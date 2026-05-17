import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

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
