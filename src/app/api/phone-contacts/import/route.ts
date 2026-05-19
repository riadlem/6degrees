import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { parseVcf, type ParsedVcfContact } from "@/lib/vcf-parser"
import { parseAbcddb } from "@/lib/abbu-parser"
import { enrichContactsFromPhoneBook } from "@/lib/phone-contact-enrich"
import JSZip from "jszip"

async function ensureTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "PhoneContact" (
      "id"        TEXT NOT NULL,
      "userId"    TEXT NOT NULL,
      "fullName"  TEXT NOT NULL,
      "phone"     TEXT,
      "email"     TEXT,
      "birthday"  TEXT,
      "photoData"   TEXT,
      "linkedinUrl" TEXT,
      CONSTRAINT "PhoneContact_pkey"               PRIMARY KEY ("id"),
      CONSTRAINT "PhoneContact_userId_fullName_key" UNIQUE ("userId", "fullName"),
      CONSTRAINT "PhoneContact_userId_fkey"         FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE
    )
  `.catch(() => {})
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "PhoneContact_userId_idx" ON "PhoneContact"("userId")
  `.catch(() => {})
  await prisma.$executeRaw`ALTER TABLE "PhoneContact" ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT`.catch(() => {})
}

async function extractAbcddbFromZip(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)
  let dbEntry: JSZip.JSZipObject | null = null
  zip.forEach((relativePath, file) => {
    if (!file.dir && relativePath.endsWith(".abcddb")) dbEntry = file
  })
  if (!dbEntry) throw new Error(
    "No .abcddb file found inside the ZIP. Make sure you right-clicked the .abbu file and chose Compress."
  )
  return Buffer.from(await (dbEntry as JSZip.JSZipObject).async("arraybuffer"))
}

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureTable()

  const count = await prisma.phoneContact.count({ where: { userId } })
  const withPhotos = await prisma.phoneContact.count({ where: { userId, photoData: { not: null } } })
  const withBirthdays = await prisma.phoneContact.count({ where: { userId, birthday: { not: null } } })

  return Response.json({ count, withPhotos, withBirthdays })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureTable()

  let contacts: ParsedVcfContact[]
  let fileName = ""
  try {
    const formData = await req.formData()
    const file = formData.get("file")
    if (!file || typeof file === "string") {
      return Response.json({ error: "No file uploaded" }, { status: 400 })
    }
    fileName = (file as File).name.toLowerCase()

    if (fileName.endsWith(".zip")) {
      const buf = Buffer.from(await (file as File).arrayBuffer())
      const dbBuf = await extractAbcddbFromZip(buf)
      contacts = parseAbcddb(dbBuf)
    } else if (fileName.endsWith(".abcddb")) {
      const buf = Buffer.from(await (file as File).arrayBuffer())
      contacts = parseAbcddb(buf)
    } else if (fileName.endsWith(".vcf") || fileName.endsWith(".vcard")) {
      contacts = parseVcf(await (file as File).text())
    } else if (fileName.endsWith(".abbu")) {
      return Response.json({
        error: "Upload a ZIP of your .abbu file instead:\n\n1. Find your .abbu file (or use File → Export → Address Book Archive… in Contacts.app)\n2. Right-click the .abbu file → Compress\n3. Upload the resulting .zip here",
      }, { status: 400 })
    } else {
      return Response.json({ error: `Unsupported format. Please upload a .vcf, .zip (compressed .abbu), or .abcddb file.` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not read uploaded file"
    return Response.json({ error: msg }, { status: 400 })
  }

  if (contacts.length === 0) {
    return Response.json({ error: "No contacts found in this file." }, { status: 400 })
  }

  const total = contacts.length
  let imported = 0

  // Upsert in chunks to avoid parameter limits
  const CHUNK = 100
  for (let i = 0; i < contacts.length; i += CHUNK) {
    const chunk = contacts.slice(i, i + CHUNK)
    await Promise.all(
      chunk.map(async (c) => {
        try {
          await prisma.phoneContact.upsert({
            where: { userId_fullName: { userId, fullName: c.fullName } },
            update: {
              phone: c.phone ?? undefined,
              email: c.email ?? undefined,
              birthday: c.birthday ?? undefined,
              photoData: c.photoData ?? undefined,
              linkedinUrl: c.linkedinUrl ?? undefined,
            },
            create: {
              userId,
              fullName: c.fullName,
              phone: c.phone,
              email: c.email,
              birthday: c.birthday,
              photoData: c.photoData,
              linkedinUrl: c.linkedinUrl,
            },
          })
          imported++
        } catch { /* skip individual failures */ }
      })
    )
  }

  const withPhotos = contacts.filter((c) => c.photoData).length
  const withBirthdays = contacts.filter((c) => c.birthday).length

  // Enrich existing LinkedIn/Gmail contacts with data from this import
  const enrichStats = await enrichContactsFromPhoneBook(userId, contacts)

  const count = await prisma.phoneContact.count({ where: { userId } })

  return Response.json({ imported, total, withPhotos, withBirthdays, count, ...enrichStats })
}
