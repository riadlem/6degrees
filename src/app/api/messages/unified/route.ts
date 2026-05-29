import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

type UnifiedChat = {
  id: string
  source: "wa" | "linkedin" | "email"
  chatName: string
  contactId: string | null
  lastAt: string | null
  lastIsOutbound: boolean | null
  subject?: string | null
  contact: {
    id: string
    firstName: string
    lastName: string
    company: string | null
    photoUrl: string | null
  } | null
}

type WaRow = { chatName: string; contactId: string | null; lastAt: Date | null; lastIsOutbound: boolean | null }
type LiMsgRow = { conversationId: string; chatName: string; contactId: string | null; lastAt: Date | null; lastIsOutbound: boolean | null }
type LiInboxRow = { conversationId: string; chatName: string; contactId: string | null; lastInboxAt: Date | null; lastInboxOutbound: boolean | null }
type EmailRow = { key: string; chatName: string; contactId: string | null; lastAt: Date; lastIsOutbound: boolean; subject: string | null }
type ContactRow = { id: string; firstName: string; lastName: string; company: string | null; photoUrl: string | null }

async function ensureInboxColumns() {
  await prisma.$executeRaw`
    ALTER TABLE "LinkedInDMConversation"
    ADD COLUMN IF NOT EXISTS "lastInboxAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "lastInboxOutbound" BOOLEAN
  `.catch(() => {})
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureInboxColumns()

  const { searchParams } = new URL(req.url)
  const sourceFilter = searchParams.get("source") // "wa" | "linkedin" | "email" | null (all)

  // ── WA chats ──────────────────────────────────────────────────────────────
  const waRows: WaRow[] = sourceFilter && sourceFilter !== "wa"
    ? []
    : await prisma.$queryRaw<WaRow[]>`
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
  const liMsgRows: LiMsgRow[] = sourceFilter && sourceFilter !== "linkedin"
    ? []
    : await prisma.$queryRaw<LiMsgRow[]>`
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
      `.catch(() => [] as LiMsgRow[])

  // ── LI DM inbox-scanned conversations (no messages imported) ─────────────
  const liInboxRows: LiInboxRow[] = sourceFilter && sourceFilter !== "linkedin"
    ? []
    : await prisma.$queryRaw<LiInboxRow[]>`
        SELECT "conversationId", "chatName", "contactId", "lastInboxAt", "lastInboxOutbound"
        FROM "LinkedInDMConversation"
        WHERE "userId" = ${userId}
          AND "lastInboxAt" IS NOT NULL
          AND "ignored" = false
      `.catch(() => [] as LiInboxRow[])

  // ── Email threads: most recent email per contact (matched) or per sender (unmatched) ──
  const emailRows: EmailRow[] = sourceFilter && sourceFilter !== "email"
    ? []
    : await prisma.$queryRaw<EmailRow[]>`
        SELECT * FROM (
          SELECT DISTINCT ON ("contactId")
            "contactId"::text AS "key",
            COALESCE("fromName", "fromEmail") AS "chatName",
            "contactId",
            "sentAt" AS "lastAt",
            "isOutbound" AS "lastIsOutbound",
            "subject"
          FROM "EmailMessage"
          WHERE "userId" = ${userId} AND "contactId" IS NOT NULL
          ORDER BY "contactId", "sentAt" DESC
        ) matched
        UNION ALL
        SELECT * FROM (
          SELECT DISTINCT ON ("fromEmail")
            'unmatched:' || "fromEmail" AS "key",
            COALESCE("fromName", "fromEmail") AS "chatName",
            NULL AS "contactId",
            "sentAt" AS "lastAt",
            "isOutbound" AS "lastIsOutbound",
            "subject"
          FROM "EmailMessage"
          WHERE "userId" = ${userId} AND "contactId" IS NULL
          ORDER BY "fromEmail", "sentAt" DESC
        ) unmatched
      `.catch(() => [] as EmailRow[])

  // ── Filter out LinkedIn system/notification conversations ────────────────
  // LinkedIn exports include InMail system entries, profile-update notifications,
  // and other non-DM rows whose chatName is "LinkedIn" or a company/system name.
  function isSystemChat(chatName: string) {
    const n = chatName.trim().toLowerCase()
    return n === "linkedin" || n === "" || n.startsWith("linkedin ")
  }

  // ── Merge LI DM: message-based data wins over inbox-only ─────────────────
  const liMsgConvIds = new Set(liMsgRows.map((r) => r.conversationId))
  const liChats = [
    ...liMsgRows.filter((r) => !isSystemChat(r.chatName)).map((r) => ({
      id: `li:${r.conversationId}`,
      source: "linkedin" as const,
      chatName: r.chatName,
      contactId: r.contactId ?? null,
      lastAt: r.lastAt?.toISOString() ?? null,
      lastIsOutbound: r.lastIsOutbound ?? null,
    })),
    ...liInboxRows
      .filter((r) => !liMsgConvIds.has(r.conversationId) && !isSystemChat(r.chatName))
      .map((r) => ({
        id: `li:${r.conversationId}`,
        source: "linkedin" as const,
        chatName: r.chatName,
        contactId: r.contactId ?? null,
        lastAt: r.lastInboxAt?.toISOString() ?? null,
        lastIsOutbound: r.lastInboxOutbound ?? null,
      })),
  ]

  const waChats: UnifiedChat[] = waRows.map((r) => ({
    id: `wa:${r.chatName}`,
    source: "wa",
    chatName: r.chatName,
    contactId: r.contactId ?? null,
    lastAt: r.lastAt?.toISOString() ?? null,
    lastIsOutbound: r.lastIsOutbound ?? null,
    contact: null,
  }))

  const emailChats: UnifiedChat[] = emailRows.map((r) => ({
    id: `email:${r.key}`,
    source: "email",
    chatName: r.chatName,
    contactId: r.contactId ?? null,
    lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null,
    lastIsOutbound: r.lastIsOutbound ?? null,
    subject: r.subject ?? null,
    contact: null,
  }))

  const allChats: UnifiedChat[] = [
    ...waChats,
    ...liChats.map((c) => ({ ...c, contact: null as UnifiedChat["contact"] })),
    ...emailChats,
  ]

  // ── Attach contact details ────────────────────────────────────────────────
  const contactIds = [...new Set(allChats.map((c) => c.contactId).filter(Boolean))] as string[]
  const contacts: ContactRow[] = contactIds.length
    ? await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, firstName: true, lastName: true, company: true, photoUrl: true },
      })
    : []
  const contactMap = new Map(contacts.map((c) => [c.id, c]))

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
