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

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get("filter") ?? "all"   // all | matched | unmatched
  const sort   = searchParams.get("sort")   ?? "lastAt" // lastAt | messageCount
  const order  = searchParams.get("order")  ?? "desc"   // asc | desc
  const q      = searchParams.get("q")?.toLowerCase().trim() ?? ""

  // One query: group by conversationId, pick the first non-null contactId per conversation
  const rows = await prisma.$queryRaw<RawRow[]>`
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
  `

  // Normalise bigint → number (driver may return BigInt on some platforms)
  let chats = rows.map((r) => ({
    conversationId:  r.conversationId,
    chatName:        r.chatName,
    profileUrl:      r.profileUrl ?? null,
    contactId:       r.contactId ?? null,
    messageCount:    Number(r.messageCount),
    outboundCount:   Number(r.outboundCount),
    firstAt:         r.firstAt?.toISOString() ?? null,
    lastAt:          r.lastAt?.toISOString()  ?? null,
    lastIsOutbound:  r.lastIsOutbound ?? null,
  }))

  // Apply filter
  if (filter === "matched")   chats = chats.filter((c) => c.contactId)
  if (filter === "unmatched") chats = chats.filter((c) => !c.contactId)

  // Apply search
  if (q) chats = chats.filter((c) => c.chatName.toLowerCase().includes(q))

  // Apply sort
  chats.sort((a, b) => {
    let diff = 0
    if (sort === "messageCount") {
      diff = a.messageCount - b.messageCount
    } else {
      // lastAt — nulls last
      if (!a.lastAt && !b.lastAt) diff = 0
      else if (!a.lastAt) diff = 1
      else if (!b.lastAt) diff = -1
      else diff = new Date(a.lastAt).getTime() - new Date(b.lastAt).getTime()
    }
    return order === "asc" ? diff : -diff
  })

  // Stats (over unfiltered set)
  const allChats = rows
  const totalMessages = allChats.reduce((s, r) => s + Number(r.messageCount), 0)
  const matched   = allChats.filter((r) => r.contactId).length
  const unmatched = allChats.length - matched

  const stats = {
    totalChats: allChats.length,
    totalMessages,
    matched,
    unmatched,
  }

  // Fetch contact details for matched chats
  const contactIds = [...new Set(chats.map((c) => c.contactId).filter(Boolean))] as string[]
  const contacts = contactIds.length
    ? await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, firstName: true, lastName: true, company: true, photoUrl: true, city: true, country: true },
      })
    : []
  const contactMap = new Map(contacts.map((c) => [c.id, c]))

  const result = chats.map((c) => ({
    ...c,
    contact: c.contactId ? (contactMap.get(c.contactId) ?? null) : null,
  }))

  return Response.json({ chats: result, stats })
}
