import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { matchChatNameToContact } from "@/lib/whatsapp-match"
import { recomputeScores } from "@/lib/reconnect-score"

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

  // Recompute scores in the background — don't block the response
  recomputeScores(userId).catch((err) => console.error("recomputeScores failed:", err))

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
    fixed++
  }

  if (fixed > 0) {
    recomputeScores(userId).catch((err) => console.error("recomputeScores failed:", err))
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

  const result = await prisma.whatsAppMessage.updateMany({
    where: { userId, chatName },
    data: { contactId: null },
  })

  recomputeScores(userId).catch((err) => console.error("recomputeScores failed:", err))

  return Response.json({ ok: true, unlinked: result.count })
}
