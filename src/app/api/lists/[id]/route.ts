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
        include: {
          contact: {
            include: {
              notes: { take: 1, orderBy: { createdAt: "desc" } },
              labels: { include: { label: { select: { id: true, name: true, color: true } } } },
            },
          },
        },
      },
      _count: { select: { members: true } },
    },
  })
  if (!list) return new Response("Not found", { status: 404 })

  const filterCompany = (list as { filterCompany?: string | null }).filterCompany ?? null

  // Company list: replace static members with dynamic contacts from that company
  if (filterCompany) {
    const contacts = await prisma.contact.findMany({
      where: { userId: session.user.id, company: { equals: filterCompany, mode: "insensitive" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        notes: { take: 1, orderBy: { createdAt: "desc" } },
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
      },
    })
    return Response.json({
      ...list,
      filterCompany,
      members: contacts.map((c) => ({
        id: c.id,
        addedAt: list.createdAt.toISOString(),
        contact: c,
      })),
      _count: { members: contacts.length },
    })
  }

  return Response.json({ ...list, filterCompany: null })
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
