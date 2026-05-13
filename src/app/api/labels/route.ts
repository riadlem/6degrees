import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { LABEL_COLOR_KEYS } from "@/lib/label-colors"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const labels = await prisma.label.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { contacts: true } } },
  })

  return Response.json(labels)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { name, color = "blue" } = await req.json()
  if (!name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 })
  if (!LABEL_COLOR_KEYS.includes(color)) return Response.json({ error: "Invalid color" }, { status: 400 })

  try {
    const label = await prisma.label.create({
      data: { userId: session.user.id, name: name.trim(), color },
      include: { _count: { select: { contacts: true } } },
    })
    return Response.json(label, { status: 201 })
  } catch {
    return Response.json({ error: "A label with this name already exists" }, { status: 409 })
  }
}
