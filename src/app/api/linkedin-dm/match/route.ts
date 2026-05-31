import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { matchLinkedInDMToContact } from "@/lib/linkedin-dm-match"
import { recomputeScores, recomputeScoreForContact } from "@/lib/reconnect-score"

export const maxDuration = 300

// POST /api/linkedin-dm/match
// Link a conversation to a contact. Body: { conversationId, contactId }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const { conversationId, contactId } = body ?? {}
  if (!conversationId || !contactId) {
    return Response.json({ error: "Missing conversationId or contactId" }, { status: 400 })
  }

  // Verify contact belongs to this user
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return Response.json({ error: "Contact not found" }, { status: 404 })

  // Link messages + conversation atomically
  const [result] = await prisma.$transaction([
    prisma.linkedInDMMessage.updateMany({ where: { userId, conversationId }, data: { contactId } }),
    prisma.linkedInDMConversation.updateMany({ where: { userId, conversationId }, data: { contactId } }),
  ])

  // Recompute the score for just this contact — don't block the response
  recomputeScoreForContact(contactId).catch((err) => console.error("recomputeScore failed:", err))

  return Response.json({ ok: true, updated: result.count })
}

// PUT /api/linkedin-dm/match
// Re-run automatic matching on all currently-unmatched conversations.
// Useful after updating the matching algorithm without re-importing.
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // Get all distinct unmatched conversations (by conversationId)
  const unmatched = await prisma.$queryRaw<{ conversationId: string; chatName: string; profileUrl: string | null }[]>`
    SELECT DISTINCT "conversationId", MAX("chatName") AS "chatName", MAX("profileUrl") AS "profileUrl"
    FROM "LinkedInDMMessage"
    WHERE "userId" = ${userId} AND "contactId" IS NULL
    GROUP BY "conversationId"
  `

  let fixed = 0
  const touched = new Set<string>()
  for (const { conversationId, chatName, profileUrl } of unmatched) {
    const contactId = await matchLinkedInDMToContact(userId, chatName, profileUrl ?? null)
    if (!contactId) continue

    await prisma.linkedInDMMessage.updateMany({
      where: { userId, conversationId, contactId: null },
      data: { contactId },
    })

    // Sync the conversation record
    await prisma.linkedInDMConversation.updateMany({
      where: { userId, conversationId },
      data: { contactId },
    })

    touched.add(contactId)
    fixed++
  }

  if (touched.size > 0) {
    recomputeScores(userId, { contactIds: [...touched] }).catch((err) => console.error("recomputeScores failed:", err))
  }

  return Response.json({ ok: true, checked: unmatched.length, fixed })
}

// DELETE /api/linkedin-dm/match
// Unlink a conversation (set contactId back to null). Body: { conversationId }
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const { conversationId } = body ?? {}
  if (!conversationId) return Response.json({ error: "Missing conversationId" }, { status: 400 })

  // Capture the linked contact(s) before clearing so we can rescope the recompute.
  const linked = await prisma.linkedInDMMessage.findMany({
    where: { userId, conversationId, contactId: { not: null } },
    select: { contactId: true },
    distinct: ["contactId"],
  })
  const linkedIds = linked.map((m) => m.contactId).filter((id): id is string => !!id)

  const [result] = await prisma.$transaction([
    prisma.linkedInDMMessage.updateMany({ where: { userId, conversationId }, data: { contactId: null } }),
    prisma.linkedInDMConversation.updateMany({ where: { userId, conversationId }, data: { contactId: null } }),
  ])

  if (linkedIds.length > 0) {
    recomputeScores(userId, { contactIds: linkedIds }).catch((err) => console.error("recomputeScores failed:", err))
  }

  return Response.json({ ok: true, unlinked: result.count })
}
