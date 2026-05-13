import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { LABEL_COLOR_KEYS } from "@/lib/label-colors"

async function getLabel(id: string, userId: string) {
  return prisma.label.findFirst({ where: { id, userId } })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const label = await getLabel(params.id, session.user.id)
  if (!label) return new Response("Not found", { status: 404 })

  const { name, color } = await req.json()
  if (color && !LABEL_COLOR_KEYS.includes(color)) return Response.json({ error: "Invalid color" }, { status: 400 })

  const updated = await prisma.label.update({
    where: { id: params.id },
    data: {
      ...(name?.trim() && { name: name.trim() }),
      ...(color && { color }),
    },
    include: { _count: { select: { contacts: true } } },
  })

  return Response.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const label = await getLabel(params.id, session.user.id)
  if (!label) return new Response("Not found", { status: 404 })

  await prisma.label.delete({ where: { id: params.id } })
  return new Response(null, { status: 204 })
}
