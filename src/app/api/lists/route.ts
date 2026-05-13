import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const lists = await prisma.contactList.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { members: true } },
    },
  })
  return Response.json(lists)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { name, description } = await request.json()
  if (!name?.trim()) {
    return Response.json({ error: "Name required" }, { status: 400 })
  }

  const list = await prisma.contactList.create({
    data: {
      userId: session.user.id,
      name: name.trim(),
      description: description?.trim() ?? null,
    },
    include: { _count: { select: { members: true } } },
  })
  return Response.json(list, { status: 201 })
}
