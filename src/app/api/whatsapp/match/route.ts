import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { recomputeScores } from "@/lib/reconnect-score"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const { chatName, contactId } = body ?? {}
  if (!chatName || !contactId) return new Response("Missing chatName or contactId", { status: 400 })

  // Verify contact belongs to this user
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return new Response("Contact not found", { status: 404 })

  // Link all unmatched messages from this chat to the contact
  const result = await prisma.whatsAppMessage.updateMany({
    where: { userId, chatName, contactId: null },
    data: { contactId },
  })

  await recomputeScores(userId)

  return Response.json({ ok: true, updated: result.count })
}
