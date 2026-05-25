import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Diagnostic endpoint: shows what WhatsApp chat names and contacts exist
// for a given search query, and why matching may have failed.
// Usage: GET /api/debug/whatsapp-search?q=gaspard
// DELETE this route after diagnosis is complete.

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const q = new URL(req.url).searchParams.get("q")?.toLowerCase().trim() ?? ""
  if (!q) return Response.json({ error: "?q= required" }, { status: 400 })

  // 1. WhatsApp chat names containing q
  const waMsgs = await prisma.$queryRaw<{ chatName: string; contactId: string | null; cnt: bigint }[]>`
    SELECT "chatName", MAX("contactId") AS "contactId", COUNT(*) AS cnt
    FROM "WhatsAppMessage"
    WHERE "userId" = ${userId}
      AND LOWER("chatName") LIKE ${"%" + q + "%"}
    GROUP BY "chatName"
    ORDER BY cnt DESC
  `

  // 2. Contacts whose firstName or lastName contains q
  const contacts = await prisma.contact.findMany({
    where: {
      userId,
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName:  { contains: q, mode: "insensitive" } },
        { company:   { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, company: true, emailAddress: true },
    take: 20,
  })

  // 3. PhoneContacts with fullName containing q (if table exists)
  let phoneContacts: { fullName: string; email: string | null }[] = []
  try {
    phoneContacts = await prisma.phoneContact.findMany({
      where: { userId, fullName: { contains: q, mode: "insensitive" } },
      select: { fullName: true, email: true },
      take: 10,
    })
  } catch { /* table may not exist */ }

  // 4. Simulate directNameMatch for each found chatName
  async function simulateMatch(chatName: string) {
    const parts = chatName.trim().split(/\s+/)
    if (parts.length < 2) return { result: null, reason: `single-word name — directNameMatch skips (parts.length=${parts.length})` }
    const firstName = parts[0]
    const lastName  = parts[parts.length - 1]
    const matches = await prisma.contact.findMany({
      where: {
        userId,
        firstName: { equals: firstName, mode: "insensitive" },
        lastName:  { equals: lastName,  mode: "insensitive" },
      },
      select: { id: true, firstName: true, lastName: true },
      take: 3,
    })
    if (matches.length === 0) return { result: null, reason: `no Contact with firstName="${firstName}" lastName="${lastName}"`, matches }
    if (matches.length > 1)   return { result: null, reason: `ambiguous — ${matches.length} contacts with that name`, matches }
    return { result: matches[0].id, reason: "matched", matches }
  }

  const chatDiagnostics = await Promise.all(
    waMsgs.map(async (row) => ({
      chatName:        row.chatName,
      storedContactId: row.contactId,
      messageCount:    Number(row.cnt),
      matchSimulation: await simulateMatch(row.chatName),
    }))
  )

  return Response.json({
    query: q,
    whatsappChats: chatDiagnostics,
    contacts,
    phoneContacts,
    summary: {
      chatCount:     waMsgs.length,
      contactCount:  contacts.length,
      phonebookCount: phoneContacts.length,
    },
  }, { status: 200 })
}
