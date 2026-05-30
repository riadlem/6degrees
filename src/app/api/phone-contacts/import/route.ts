import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { randomUUID } from "crypto"
import { parseVcf, type ParsedVcfContact } from "@/lib/vcf-parser"
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

  return Response.json({ count, withPhotos, withBirthdays })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureTable()

  let contacts: ParsedVcfContact[]

  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("application/json")) {
    // Pre-parsed contacts from client-side ABCDDB parsing (bypasses upload size limit)
    try {
      const body = await req.json()
      contacts = body.contacts as ParsedVcfContact[]
      if (!Array.isArray(contacts)) return Response.json({ error: "Invalid contacts payload" }, { status: 400 })
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 })
    }
  } else {
    let fileName = ""
    try {
      const formData = await req.formData()
      const file = formData.get("file")
      if (!file || typeof file === "string") {
        return Response.json({ error: "No file uploaded" }, { status: 400 })
      }
      fileName = (file as File).name.toLowerCase()

      if (fileName.endsWith(".vcf") || fileName.endsWith(".vcard")) {
        contacts = parseVcf(await (file as File).text())
      } else if (fileName.endsWith(".zip") || fileName.endsWith(".abcddb")) {
        return Response.json({
          error: "File too large to upload directly. It will be parsed in your browser instead — please try again.",
        }, { status: 400 })
      } else if (fileName.endsWith(".abbu")) {
        return Response.json({
          error: "Upload a ZIP of your .abbu file instead:\n\n1. Right-click the .abbu file → Compress\n2. Upload the resulting .zip here",
        }, { status: 400 })
      } else {
        return Response.json({ error: `Unsupported format. Please upload a .vcf, .zip (compressed .abbu), or .abcddb file.` }, { status: 400 })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not read uploaded file"
      return Response.json({ error: msg }, { status: 400 })
    }
  }

  if (contacts.length === 0) {
    return Response.json({ error: "No contacts found in this file." }, { status: 400 })
  }

  const total = contacts.length

  // De-duplicate by fullName before bulk insert — a single INSERT … ON CONFLICT
  // can't touch the same conflict key twice, and VCF exports often repeat names.
  // Merge fields, preferring the first non-null value seen.
  const byName = new Map<string, ParsedVcfContact>()
  for (const c of contacts) {
    if (!c.fullName) continue
    const existing = byName.get(c.fullName)
    if (!existing) { byName.set(c.fullName, { ...c }); continue }
    byName.set(c.fullName, {
      ...existing,
      phone:       existing.phone       ?? c.phone,
      email:       existing.email       ?? c.email,
      birthday:    existing.birthday    ?? c.birthday,
      photoData:   existing.photoData   ?? c.photoData,
      linkedinUrl: existing.linkedinUrl ?? c.linkedinUrl,
    })
  }
  const deduped = [...byName.values()]

  // Bulk upsert in chunks — one INSERT … ON CONFLICT per chunk instead of one
  // round-trip per contact. COALESCE keeps existing values when the incoming
  // field is null (matches the previous "don't overwrite with null" behaviour).
  let imported = 0
  const CHUNK = 100
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK)
    const rows = chunk.map((c) => Prisma.sql`(${randomUUID()}, ${userId}, ${c.fullName}, ${c.phone ?? null}, ${c.email ?? null}, ${c.birthday ?? null}, ${c.photoData ?? null}, ${c.linkedinUrl ?? null})`)
    try {
      await prisma.$executeRaw`
        INSERT INTO "PhoneContact" ("id","userId","fullName","phone","email","birthday","photoData","linkedinUrl")
        VALUES ${Prisma.join(rows)}
        ON CONFLICT ("userId","fullName") DO UPDATE SET
          "phone"       = COALESCE(EXCLUDED."phone",       "PhoneContact"."phone"),
          "email"       = COALESCE(EXCLUDED."email",       "PhoneContact"."email"),
          "birthday"    = COALESCE(EXCLUDED."birthday",    "PhoneContact"."birthday"),
          "photoData"   = COALESCE(EXCLUDED."photoData",   "PhoneContact"."photoData"),
          "linkedinUrl" = COALESCE(EXCLUDED."linkedinUrl", "PhoneContact"."linkedinUrl")
      `
      imported += chunk.length
    } catch { /* skip a failing chunk rather than aborting the whole import */ }
  }

  const withPhotos = contacts.filter((c) => c.photoData).length
  const withBirthdays = contacts.filter((c) => c.birthday).length

  // Enrich existing LinkedIn/Gmail contacts with data from this import
  const enrichStats = await enrichContactsFromPhoneBook(userId, contacts)

  const count = await prisma.phoneContact.count({ where: { userId } })

  return Response.json({ imported, total, withPhotos, withBirthdays, count, ...enrichStats })
}
