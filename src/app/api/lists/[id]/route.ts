import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const list = await prisma.contactList.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      members: {
        orderBy: { addedAt: "desc" },
        include: { contact: { include: { notes: { take: 1, orderBy: { createdAt: "desc" } } } } },
      },
      _count: { select: { members: true } },
    },
  })
  if (!list) return new Response("Not found", { status: 404 })
  return Response.json(list)
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { name, description } = await request.json()
  const list = await prisma.contactList.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: {
      ...(name != null && { name: name.trim() }),
      ...(description != null && { description: description.trim() }),
    },
  })
  if (list.count === 0) return new Response("Not found", { status: 404 })
  return Response.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const deleted = await prisma.contactList.deleteMany({
    where: { id: params.id, userId: session.user.id },
  })
  if (deleted.count === 0) return new Response("Not found", { status: 404 })
  return Response.json({ ok: true })
}
