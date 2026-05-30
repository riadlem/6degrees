import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { matchChatNameToContact } from "@/lib/whatsapp-match"
import { recomputeScores, recomputeScoreForContact } from "@/lib/reconnect-score"

export const maxDuration = 300

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const { chatName, contactId } = body ?? {}
  if (!chatName || !contactId) return Response.json({ error: "Missing chatName or contactId" }, { status: 400 })

  // Verify contact belongs to this user
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return Response.json({ error: "Contact not found" }, { status: 404 })

  // Link ALL messages from this chat to the contact (handles both initial match and re-assignment)
  const result = await prisma.whatsAppMessage.updateMany({
    where: { userId, chatName },
    data: { contactId },
  })

  // Backfill phone number onto the contact if it doesn't already have one.
  // The phone is stored on the message rows (from ZCONTACTJID during import).
  const msgWithPhone = await prisma.whatsAppMessage.findFirst({
    where: { userId, chatName, phone: { not: null } },
    select: { phone: true },
  }).catch(() => null)
  if (msgWithPhone?.phone) {
    await prisma.contact.updateMany({
      where: { id: contactId, phoneNumber: null },
      data: { phoneNumber: msgWithPhone.phone },
    })
  }

  // Recompute the score for just this contact — don't block the response
  recomputeScoreForContact(contactId).catch((err) => console.error("recomputeScore failed:", err))

  return Response.json({ ok: true, updated: result.count })
}

// Re-run automatic matching on all currently-unmatched chats.
// Useful after updating the matching algorithm without re-importing.
// PUT /api/whatsapp/match   (no body needed)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // Get all distinct unmatched chat names
  const unmatched = await prisma.$queryRaw<{ chatName: string }[]>`
    SELECT DISTINCT "chatName"
    FROM "WhatsAppMessage"
    WHERE "userId" = ${userId} AND "contactId" IS NULL
  `

  let fixed = 0
  const touched = new Set<string>()
  for (const { chatName } of unmatched) {
    const contactId = await matchChatNameToContact(userId, chatName)
    if (!contactId) continue
    await prisma.whatsAppMessage.updateMany({
      where: { userId, chatName, contactId: null },
      data: { contactId },
    })
    // Backfill phone number if stored on the messages
    const msgWithPhone = await prisma.whatsAppMessage.findFirst({
      where: { userId, chatName, phone: { not: null } },
      select: { phone: true },
    }).catch(() => null)
    if (msgWithPhone?.phone) {
      await prisma.contact.updateMany({
        where: { id: contactId, phoneNumber: null },
        data: { phoneNumber: msgWithPhone.phone },
      })
    }
    touched.add(contactId)
    fixed++
  }

  if (touched.size > 0) {
    recomputeScores(userId, { contactIds: [...touched] }).catch((err) => console.error("recomputeScores failed:", err))
  }

  return Response.json({ ok: true, checked: unmatched.length, fixed })
}

// Unlink all messages for a chat (set contactId back to null)
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const { chatName } = body ?? {}
  if (!chatName) return Response.json({ error: "Missing chatName" }, { status: 400 })

  // Capture which contacts were linked to this chat before clearing, so we can
  // recompute just their scores.
  const linked = await prisma.whatsAppMessage.findMany({
    where: { userId, chatName, contactId: { not: null } },
    select: { contactId: true },
    distinct: ["contactId"],
  })
  const linkedIds = linked.map((m) => m.contactId).filter((id): id is string => !!id)

  const result = await prisma.whatsAppMessage.updateMany({
    where: { userId, chatName },
    data: { contactId: null },
  })

  if (linkedIds.length > 0) {
    recomputeScores(userId, { contactIds: linkedIds }).catch((err) => console.error("recomputeScores failed:", err))
  }

  return Response.json({ ok: true, unlinked: result.count })
}
