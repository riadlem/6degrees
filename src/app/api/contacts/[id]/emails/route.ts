import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { normalizeEmail } from "@/lib/gmail"
import { recomputeScores } from "@/lib/reconnect-score"

export const maxDuration = 300

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50)
  const cursor = searchParams.get("cursor") ?? undefined

  const messages = await prisma.emailMessage.findMany({
    where: { contactId: params.id },
    select: {
      id: true,
      subject: true,
      fromEmail: true,
      sentAt: true,
      isOutbound: true,
      threadId: true,
    },
    orderBy: { sentAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = messages.length > limit
  const items = hasMore ? messages.slice(0, limit) : messages
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return Response.json({ messages: items, nextCursor })
}

// Remove a matched email address from a contact and reset its EmailMessage associations
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const body = await req.json().catch(() => null)
  const email = body?.email ? normalizeEmail(body.email as string) : null
  if (!email) return new Response("Missing email", { status: 400 })

  // Remove from ContactEmailAddress
  await prisma.contactEmailAddress.deleteMany({
    where: { contactId: params.id, email },
  })

  // Reset inbound messages attributed to this contact via this email
  await prisma.emailMessage.updateMany({
    where: { userId, contactId: params.id, fromEmail: email },
    data: { contactId: null },
  })
  // Reset outbound messages sent to this address
  await prisma.emailMessage.updateMany({
    where: { userId, contactId: params.id, isOutbound: true, toEmails: { has: email } },
    data: { contactId: null },
  })

  // Recompute scores in the background — don't block the response
  recomputeScores(userId).catch((err) => console.error("recomputeScores failed:", err))

  return Response.json({ ok: true })
}
