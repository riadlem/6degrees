import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

type UnifiedChat = {
  id: string
  source: "wa" | "linkedin"
  chatName: string
  contactId: string | null
  lastAt: string | null
  lastIsOutbound: boolean | null
  contact: {
    id: string
    firstName: string
    lastName: string
    company: string | null
    photoUrl: string | null
  } | null
}

async function ensureInboxColumns() {
  await prisma.$executeRaw`
    ALTER TABLE "LinkedInDMConversation"
    ADD COLUMN IF NOT EXISTS "lastInboxAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "lastInboxOutbound" BOOLEAN
  `.catch(() => {})
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureInboxColumns()

  // ── WA chats ──────────────────────────────────────────────────────────────
  const waRows = await prisma.$queryRaw<
    { chatName: string; contactId: string | null; lastAt: Date | null; lastIsOutbound: boolean | null }[]
  >`
    WITH last_msg AS (
      SELECT DISTINCT ON ("chatName") "chatName", "isOutbound" AS "lastIsOutbound"
      FROM "WhatsAppMessage"
      WHERE "userId" = ${userId}
      ORDER BY "chatName", "sentAt" DESC
    )
    SELECT
      m."chatName",
      MAX(m."contactId")                                    AS "contactId",
      MAX(m."sentAt")                                       AS "lastAt",
      lm."lastIsOutbound"
    FROM "WhatsAppMessage" m
    JOIN last_msg lm ON lm."chatName" = m."chatName"
    WHERE m."userId" = ${userId}
    GROUP BY m."chatName", lm."lastIsOutbound"
  `

  // ── LI DM chats from imported messages ────────────────────────────────────
  const liMsgRows = await prisma.$queryRaw<
    {
      conversationId: string
      chatName: string
      contactId: string | null
      lastAt: Date | null
      lastIsOutbound: boolean | null
    }[]
  >`
    WITH last_msg AS (
      SELECT DISTINCT ON ("conversationId") "conversationId", "isOutbound" AS "lastIsOutbound"
      FROM "LinkedInDMMessage"
      WHERE "userId" = ${userId}
      ORDER BY "conversationId", "sentAt" DESC
    )
    SELECT
      m."conversationId",
      MAX(m."chatName")                                     AS "chatName",
      MAX(m."contactId")                                    AS "contactId",
      MAX(m."sentAt")                                       AS "lastAt",
      lm."lastIsOutbound"
    FROM "LinkedInDMMessage" m
    JOIN last_msg lm ON lm."conversationId" = m."conversationId"
    WHERE m."userId" = ${userId}
    GROUP BY m."conversationId", lm."lastIsOutbound"
  `.catch(() => [] as typeof liMsgRows)

  // ── LI DM inbox-scanned conversations (no messages imported) ─────────────
  const liInboxRows = await prisma.$queryRaw<
    {
      conversationId: string
      chatName: string
      contactId: string | null
      lastInboxAt: Date | null
      lastInboxOutbound: boolean | null
    }[]
  >`
    SELECT "conversationId", "chatName", "contactId", "lastInboxAt", "lastInboxOutbound"
    FROM "LinkedInDMConversation"
    WHERE "userId" = ${userId}
      AND "lastInboxAt" IS NOT NULL
      AND "ignored" = false
  `.catch(() => [] as typeof liInboxRows)

  // ── Merge LI DM: message-based data wins over inbox-only ─────────────────
  const liMsgConvIds = new Set(liMsgRows.map((r: { conversationId: string }) => r.conversationId))
  const liChats = [
    ...liMsgRows.map((r: { conversationId: string; chatName: string; contactId: string | null; lastAt: Date | null; lastIsOutbound: boolean | null }) => ({
      id: `li:${r.conversationId}`,
      source: "linkedin" as const,
      chatName: r.chatName,
      contactId: r.contactId ?? null,
      lastAt: r.lastAt?.toISOString() ?? null,
      lastIsOutbound: r.lastIsOutbound ?? null,
    })),
    ...liInboxRows
      .filter((r: { conversationId: string }) => !liMsgConvIds.has(r.conversationId))
      .map((r: { conversationId: string; chatName: string; contactId: string | null; lastInboxAt: Date | null; lastInboxOutbound: boolean | null }) => ({
        id: `li:${r.conversationId}`,
        source: "linkedin" as const,
        chatName: r.chatName,
        contactId: r.contactId ?? null,
        lastAt: r.lastInboxAt?.toISOString() ?? null,
        lastIsOutbound: r.lastInboxOutbound ?? null,
      })),
  ]

  const waChats: UnifiedChat[] = waRows.map((r: { chatName: string; contactId: string | null; lastAt: Date | null; lastIsOutbound: boolean | null }) => ({
    id: `wa:${r.chatName}`,
    source: "wa",
    chatName: r.chatName,
    contactId: r.contactId ?? null,
    lastAt: r.lastAt?.toISOString() ?? null,
    lastIsOutbound: r.lastIsOutbound ?? null,
    contact: null,
  }))

  const allChats: UnifiedChat[] = [...waChats, ...liChats.map((c) => ({ ...c, contact: null }))]

  // ── Attach contact details ────────────────────────────────────────────────
  const contactIds = [...new Set(allChats.map((c) => c.contactId).filter(Boolean))] as string[]
  const contacts = contactIds.length
    ? await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, firstName: true, lastName: true, company: true, photoUrl: true },
      })
    : []
  const contactMap = new Map(contacts.map((c: { id: string; firstName: string; lastName: string; company: string | null; photoUrl: string | null }) => [c.id, c]))

  const result = allChats.map((c) => ({
    ...c,
    contact: c.contactId ? (contactMap.get(c.contactId) ?? null) : null,
  }))

  // Sort by most recent activity (nulls last)
  result.sort((a, b) => {
    if (!a.lastAt && !b.lastAt) return 0
    if (!a.lastAt) return 1
    if (!b.lastAt) return -1
    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
  })

  return Response.json({ chats: result })
}
