import prisma from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const list = await prisma.contactList.findFirst({
    where: { shareToken: params.token, shareEnabled: true },
    include: {
      user: { select: { name: true } },
      members: {
        orderBy: { addedAt: "asc" },
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              position: true,
              company: true,
              location: true,
              industry: true,
              photoUrl: true,
              commonConnections: true,
              headline: true,
            },
          },
        },
      },
      _count: { select: { members: true } },
    },
  })

  if (!list) return new Response("Not found", { status: 404 })

  return Response.json({
    name: list.name,
    description: list.description,
    ownerName: list.user.name,
    contactCount: list._count.members,
    contacts: list.members.map((m) => m.contact),
  })
}
