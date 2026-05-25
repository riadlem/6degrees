import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
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

  // Recompute scores in the background — don't block the response
  recomputeScores(userId).catch((err) => console.error("recomputeScores failed:", err))

  return Response.json({ ok: true, updated: result.count })
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
