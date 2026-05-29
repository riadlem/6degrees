import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { enrichContact } from "@/lib/cowork"
import { invalidateMatchCache } from "@/lib/match-cache-store"

// phones TEXT[] lives outside the Prisma schema (added at runtime via ALTER TABLE)
// so we fetch it with a separate raw query and merge it in.
async function fetchPhones(contactId: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<{ phones: string[] | null }[]>`
      SELECT phones FROM "Contact" WHERE id = ${contactId} LIMIT 1
    `
    return rows[0]?.phones ?? []
  } catch {
    return []
  }
}

// lockedFields TEXT[] — fields that must not be overwritten by enrichment syncs.
async function ensureLockedFieldsCol() {
  await prisma.$executeRaw`
    ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "lockedFields" TEXT[] DEFAULT '{}'
  `.catch(() => {})
}

async function fetchLockedFields(contactId: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<{ lockedFields: string[] | null }[]>`
      SELECT "lockedFields" FROM "Contact" WHERE id = ${contactId} LIMIT 1
    `
    return rows[0]?.lockedFields ?? []
  } catch {
    return []
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  await ensureLockedFieldsCol()

  const [contact, waAgg, waChatRow, liDMAgg, liDMConv] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: {
        notes: { orderBy: { createdAt: "desc" } },
        listMembers: { include: { list: { select: { id: true, name: true } } } },
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
        emailAddresses: { select: { email: true, isPrimary: true }, orderBy: { isPrimary: "desc" } },
      },
    }),
    prisma.whatsAppMessage.aggregate({
      where: { contactId: params.id },
      _max: { sentAt: true },
      _count: { _all: true },
    }).catch(() => null),
    prisma.whatsAppMessage.findFirst({
      where: { contactId: params.id },
      select: { chatName: true },
    }).catch(() => null),
    prisma.linkedInDMMessage.aggregate({
      where: { contactId: params.id },
      _max: { sentAt: true },
      _count: { _all: true },
    }).catch(() => null),
    prisma.linkedInDMConversation.findFirst({
      where: { contactId: params.id },
      select: { conversationId: true, chatName: true },
      orderBy: { importedAt: "desc" },
    }).catch(() => null),
  ])

  if (!contact) return new Response("Not found", { status: 404 })

  const [phones, lockedFields] = await Promise.all([
    fetchPhones(contact.id),
    fetchLockedFields(contact.id),
  ])

  return Response.json({
    ...contact,
    phones,
    lockedFields,
    whatsappLastAt: waAgg?._max.sentAt?.toISOString() ?? null,
    whatsappMessageCount: waAgg?._count._all ?? 0,
    whatsappChatName: waChatRow?.chatName ?? null,
    linkedinDmLastAt: liDMAgg?._max.sentAt?.toISOString() ?? null,
    linkedinDmMessageCount: liDMAgg?._count._all ?? 0,
    linkedinDmConversationId: liDMConv?.conversationId ?? null,
    linkedinDmChatName: liDMConv?.chatName ?? null,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await request.json()

  // Standard Prisma-managed fields
  const allowed = ["firstName", "lastName", "location", "city", "country", "industry", "headline", "profileUrl", "company", "position", "phoneNumber"]
  const data: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) data[key] = body[key]
  }

  if (Object.keys(data).length > 0) {
    const contact = await prisma.contact.updateMany({
      where: { id: params.id, userId: session.user.id },
      data,
    })
    if (contact.count === 0) return new Response("Not found", { status: 404 })
    // Name or email field changes affect the match cache — invalidate so the next
    // Gmail sync rebuilds with the correct mappings.
    const matchAffecting = ["firstName", "lastName", "emailAddress"]
    if (matchAffecting.some((k) => k in data)) {
      invalidateMatchCache(session.user.id)
    }
  }

  // lockedFields TEXT[] — add or remove a field name from the locked set
  if ("lockField" in body && typeof body.lockField === "string") {
    await ensureLockedFieldsCol()
    await prisma.$executeRaw`
      UPDATE "Contact"
      SET "lockedFields" = array_append(
        COALESCE("lockedFields", '{}'),
        ${body.lockField as string}
      )
      WHERE id = ${params.id} AND "userId" = ${session.user.id}
        AND NOT (COALESCE("lockedFields", '{}') @> ARRAY[${body.lockField as string}])
    `
  }
  if ("unlockField" in body && typeof body.unlockField === "string") {
    await ensureLockedFieldsCol()
    await prisma.$executeRaw`
      UPDATE "Contact"
      SET "lockedFields" = array_remove(COALESCE("lockedFields", '{}'), ${body.unlockField as string})
      WHERE id = ${params.id} AND "userId" = ${session.user.id}
    `
  }

  // phones TEXT[] lives outside the Prisma schema — update via raw SQL
  if ("phones" in body && Array.isArray(body.phones)) {
    // Ensure the column exists (idempotent — no-op if already there)
    await prisma.$executeRaw`ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "phones" TEXT[] DEFAULT '{}'`.catch(() => {})
    const cleaned = (body.phones as unknown[])
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim())
    await prisma.$executeRaw`
      UPDATE "Contact" SET phones = ${cleaned}::text[]
      WHERE id = ${params.id} AND "userId" = ${session.user.id}
    `
  }

  return Response.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const deleted = await prisma.contact.deleteMany({
    where: { id: params.id, userId: session.user.id },
  })

  if (deleted.count === 0) return new Response("Not found", { status: 404 })
  // Removing a contact invalidates the match cache — it must not match to a deleted record.
  invalidateMatchCache(session.user.id)
  return Response.json({ ok: true })
}

// Trigger Cowork enrichment for a single contact
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const enriched = await enrichContact(
    contact.linkedinKey,
    contact.firstName,
    contact.lastName,
    contact.company
  )

  const updated = await prisma.contact.update({
    where: { id: params.id },
    data: {
      photoUrl: enriched.photoUrl ?? contact.photoUrl,
      commonConnections: enriched.commonConnections ?? contact.commonConnections,
      location: enriched.location ?? contact.location,
      industry: enriched.industry ?? contact.industry,
      headline: enriched.headline ?? contact.headline,
      profileUrl: enriched.profileUrl ?? contact.profileUrl,
      coworkEnrichedAt: new Date(),
    },
  })

  return Response.json(updated)
}
