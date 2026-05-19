import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { parseVcf } from "@/lib/vcf-parser"
import { enrichContactsFromPhoneBook } from "@/lib/phone-contact-enrich"

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

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureTable()

  const count = await prisma.phoneContact.count({ where: { userId } })
  const withPhotos = await prisma.phoneContact.count({ where: { userId, photoData: { not: null } } })
  const withBirthdays = await prisma.phoneContact.count({ where: { userId, birthday: { not: null } } })

  // Get most recent import time via max updatedAt — use raw since no updatedAt field
  // We approximate by checking if any row exists; importedAt not tracked separately
  return Response.json({ count, withPhotos, withBirthdays })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureTable()

  let vcfText: string
  try {
    const formData = await req.formData()
    const file = formData.get("file")
    if (!file || typeof file === "string") {
      return Response.json({ error: "No file uploaded" }, { status: 400 })
    }
    vcfText = await (file as File).text()
  } catch {
    return Response.json({ error: "Could not read uploaded file" }, { status: 400 })
  }

  const contacts = parseVcf(vcfText)
  if (contacts.length === 0) {
    return Response.json({ error: "No contacts found in this file. Make sure you uploaded a .vcf vCard file." }, { status: 400 })
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
