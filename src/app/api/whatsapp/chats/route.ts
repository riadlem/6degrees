import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

type RawRow = {
  chatName: string
  contactId: string | null
  isGroup: boolean
  messageCount: bigint
  outboundCount: bigint
  memberCount: bigint
  linkedCount: bigint
  firstAt: Date | null
  lastAt: Date | null
  lastIsOutbound: boolean | null
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get("filter") ?? "all"   // all | matched | unmatched | groups
  const sort   = searchParams.get("sort")   ?? "lastAt" // lastAt | messageCount
  const order  = searchParams.get("order")  ?? "desc"   // asc | desc
  const q      = searchParams.get("q")?.toLowerCase().trim() ?? ""

  const rows = await prisma.$queryRaw<RawRow[]>`
    WITH last_msg AS (
      SELECT DISTINCT ON ("chatName") "chatName", "isOutbound" AS "lastIsOutbound"
      FROM "WhatsAppMessage"
      WHERE "userId" = ${userId}
      ORDER BY "chatName", "sentAt" DESC
    )
    SELECT
      m."chatName",
      MAX(m."contactId")                                          AS "contactId",
      BOOL_OR(COALESCE(m."isGroup", FALSE))                       AS "isGroup",
      COUNT(*)::int                                               AS "messageCount",
      SUM(CASE WHEN m."isOutbound" THEN 1 ELSE 0 END)::int       AS "outboundCount",
      COUNT(DISTINCT CASE WHEN NOT m."isOutbound" AND m."senderName" IS NOT NULL
            THEN m."senderName" END)::int                         AS "memberCount",
      COUNT(DISTINCT CASE WHEN m."contactId" IS NOT NULL
            THEN m."contactId" END)::int                          AS "linkedCount",
      MIN(m."sentAt")                                             AS "firstAt",
      MAX(m."sentAt")                                             AS "lastAt",
      lm."lastIsOutbound"
    FROM "WhatsAppMessage" m
    JOIN last_msg lm ON lm."chatName" = m."chatName"
    WHERE m."userId" = ${userId}
    GROUP BY m."chatName", lm."lastIsOutbound"
  `

  let chats = rows.map((r) => ({
    chatName:       r.chatName,
    contactId:      r.contactId ?? null,
    isGroup:        Boolean(r.isGroup),
    messageCount:   Number(r.messageCount),
    outboundCount:  Number(r.outboundCount),
    memberCount:    Number(r.memberCount),
    linkedCount:    Number(r.linkedCount),
    inScore:        Number(r.linkedCount) > 0,
    firstAt:        r.firstAt?.toISOString() ?? null,
    lastAt:         r.lastAt?.toISOString()  ?? null,
    lastIsOutbound: r.lastIsOutbound ?? null,
  }))

  // Apply filter
  if (filter === "matched")   chats = chats.filter((c) => !c.isGroup && c.contactId)
  if (filter === "unmatched") chats = chats.filter((c) => !c.isGroup && !c.contactId)
  if (filter === "groups")    chats = chats.filter((c) => c.isGroup)

  // Apply search
  if (q) chats = chats.filter((c) => c.chatName.toLowerCase().includes(q))

  // Apply sort
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

  // Stats
  const allChats = rows.map((r) => ({ ...r, isGroup: Boolean(r.isGroup), contactId: r.contactId ?? null }))
  const totalMessages = allChats.reduce((s, r) => s + Number(r.messageCount), 0)
  const matched   = allChats.filter((r) => !r.isGroup && r.contactId).length
  const unmatched = allChats.filter((r) => !r.isGroup && !r.contactId).length
  const groups    = allChats.filter((r) => r.isGroup).length

  const stats = {
    totalChats: allChats.length,
    totalMessages,
    matched,
    unmatched,
    groups,
  }

  // Fetch contact details for matched 1:1 chats
  const contactIds = [...new Set(chats.filter((c) => !c.isGroup).map((c) => c.contactId).filter(Boolean))] as string[]
  const contacts = contactIds.length
    ? await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, firstName: true, lastName: true, company: true, photoUrl: true, city: true, country: true },
      })
    : []
  const contactMap = new Map(contacts.map((c) => [c.id, c]))

  const result = chats.map((c) => ({
    ...c,
    contact: (!c.isGroup && c.contactId) ? (contactMap.get(c.contactId) ?? null) : null,
  }))

  return Response.json({ chats: result, stats })
}
