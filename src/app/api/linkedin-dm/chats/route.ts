import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

type RawRow = {
  conversationId: string
  chatName: string
  profileUrl: string | null
  contactId: string | null
  messageCount: bigint
  outboundCount: bigint
  firstAt: Date | null
  lastAt: Date | null
  lastIsOutbound: boolean | null
}

type ContactRow = {
  id: string
  firstName: string
  lastName: string
  company: string | null
  photoUrl: string | null
  city: string | null
  country: string | null
  linkedinDegree: string | null
  connectedOn: Date | null
}

async function ensureColumns() {
  await prisma.$executeRaw`
    ALTER TABLE "LinkedInDMConversation" ADD COLUMN IF NOT EXISTS "ignored" BOOLEAN NOT NULL DEFAULT FALSE
  `.catch(() => {})
}

function isNotConnected(contact: ContactRow | null | undefined): boolean {
  if (!contact) return true                      // unmatched sender = not a connection
  if (contact.connectedOn) return false          // has formal connection date
  if (contact.linkedinDegree === "1") return false // 1st degree
  return true
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureColumns()

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get("filter") ?? "all"   // all | matched | unmatched | not_connected | ignored
  const sort   = searchParams.get("sort")   ?? "lastAt"
  const order  = searchParams.get("order")  ?? "desc"
  const q      = searchParams.get("q")?.toLowerCase().trim() ?? ""

  const [rows, ignoredMeta, allContacts] = await Promise.all([
    prisma.$queryRaw<RawRow[]>`
      WITH last_msg AS (
        SELECT DISTINCT ON ("conversationId") "conversationId", "isOutbound" AS "lastIsOutbound"
        FROM "LinkedInDMMessage"
        WHERE "userId" = ${userId}
        ORDER BY "conversationId", "sentAt" DESC
      )
      SELECT
        m."conversationId",
        MAX(m."chatName")                                              AS "chatName",
        MAX(m."profileUrl")                                           AS "profileUrl",
        MAX(m."contactId")                                            AS "contactId",
        COUNT(*)::int                                                  AS "messageCount",
        SUM(CASE WHEN m."isOutbound" THEN 1 ELSE 0 END)::int          AS "outboundCount",
        MIN(m."sentAt")                                                AS "firstAt",
        MAX(m."sentAt")                                                AS "lastAt",
        lm."lastIsOutbound"
      FROM "LinkedInDMMessage" m
      JOIN last_msg lm ON lm."conversationId" = m."conversationId"
      WHERE m."userId" = ${userId}
      GROUP BY m."conversationId", lm."lastIsOutbound"
    `,
    prisma.$queryRaw<{ conversationId: string; ignored: boolean }[]>`
      SELECT "conversationId", "ignored"
      FROM "LinkedInDMConversation"
      WHERE "userId" = ${userId}
    `.catch(() => [] as { conversationId: string; ignored: boolean }[]),
    // Fetch contacts for ALL matched chats (needed for stats + not_connected filter)
    (async () => {
      const allContactIds = [...new Set(
        (await prisma.$queryRaw<{ contactId: string | null }[]>`
          SELECT DISTINCT MAX("contactId") AS "contactId"
          FROM "LinkedInDMMessage"
          WHERE "userId" = ${userId}
          GROUP BY "conversationId"
        `.catch(() => []))
          .map((r) => r.contactId)
          .filter(Boolean)
      )] as string[]
      if (!allContactIds.length) return [] as ContactRow[]
      return prisma.contact.findMany({
        where: { id: { in: allContactIds } },
        select: {
          id: true, firstName: true, lastName: true, company: true,
          photoUrl: true, city: true, country: true,
          linkedinDegree: true, connectedOn: true,
        },
      }) as Promise<ContactRow[]>
    })(),
  ])

  const ignoredSet = new Set(ignoredMeta.filter((c) => c.ignored).map((c) => c.conversationId))
  const contactMap = new Map(allContacts.map((c) => [c.id, c]))

  let chats = rows.map((r) => ({
    conversationId:  r.conversationId,
    chatName:        r.chatName,
    profileUrl:      r.profileUrl ?? null,
    contactId:       r.contactId ?? null,
    messageCount:    Number(r.messageCount),
    outboundCount:   Number(r.outboundCount),
    firstAt:         r.firstAt?.toISOString()  ?? null,
    lastAt:          r.lastAt?.toISOString()   ?? null,
    lastIsOutbound:  r.lastIsOutbound ?? null,
    ignored:         ignoredSet.has(r.conversationId),
    contact:         r.contactId ? (contactMap.get(r.contactId) ?? null) : null,
  }))

  // Stats over the full (unfiltered) set
  const totalMessages = chats.reduce((s, c) => s + c.messageCount, 0)
  const stats = {
    totalChats:   chats.length,
    totalMessages,
    matched:      chats.filter((c) => c.contactId && !c.ignored).length,
    unmatched:    chats.filter((c) => !c.contactId).length,
    notConnected: chats.filter((c) => isNotConnected(c.contact) && !c.ignored).length,
    ignored:      chats.filter((c) => c.ignored).length,
  }

  // Apply filter — "ignored" tab is opt-in; all other tabs exclude ignored chats
  if      (filter === "all")           chats = chats.filter((c) => !c.ignored)
  else if (filter === "matched")       chats = chats.filter((c) => c.contactId && !c.ignored)
  else if (filter === "unmatched")     chats = chats.filter((c) => !c.contactId)
  else if (filter === "not_connected") chats = chats.filter((c) => isNotConnected(c.contact) && !c.ignored)
  else if (filter === "ignored")       chats = chats.filter((c) => c.ignored)

  // Search
  if (q) chats = chats.filter((c) => c.chatName.toLowerCase().includes(q))

  // Sort
  chats.sort((a, b) => {
    let diff = 0
    if (sort === "messageCount") {
      diff = a.messageCount - b.messageCount
    } else {
      if (!a.lastAt && !b.lastAt) diff = 0
      else if (!a.lastAt) diff = 1
      else if (!b.lastAt) diff = -1
      else diff = new Date(a.lastAt).getTime() - new Date(b.lastAt).getTime()
    }
    return order === "asc" ? diff : -diff
  })

  // For not_connected / ignored tabs: fetch last 3 messages per conversation to show timeline
  let recentMsgMap = new Map<string, { sentAt: string; isOutbound: boolean }[]>()
  if (filter === "not_connected" || filter === "ignored") {
    const convIds = chats.map((c) => c.conversationId)
    if (convIds.length) {
      const msgs = await prisma.linkedInDMMessage.findMany({
        where: { userId, conversationId: { in: convIds } },
        orderBy: { sentAt: "desc" },
        select: { conversationId: true, sentAt: true, isOutbound: true },
      })
      for (const msg of msgs) {
        if (!recentMsgMap.has(msg.conversationId)) recentMsgMap.set(msg.conversationId, [])
        const arr = recentMsgMap.get(msg.conversationId)!
        if (arr.length < 3) arr.push({ sentAt: msg.sentAt.toISOString(), isOutbound: msg.isOutbound })
      }
    }
  }

  const result = chats.map((c) => ({
    ...c,
    contact: c.contact
      ? {
          id:            (c.contact as ContactRow).id,
          firstName:     (c.contact as ContactRow).firstName,
          lastName:      (c.contact as ContactRow).lastName,
          company:       (c.contact as ContactRow).company,
          photoUrl:      (c.contact as ContactRow).photoUrl,
          city:          (c.contact as ContactRow).city,
          country:       (c.contact as ContactRow).country,
          linkedinDegree:(c.contact as ContactRow).linkedinDegree,
          connectedOn:   (c.contact as ContactRow).connectedOn?.toISOString() ?? null,
        }
      : null,
    recentMessages: recentMsgMap.get(c.conversationId) ?? [],
  }))

  return Response.json({ chats: result, stats })
}
