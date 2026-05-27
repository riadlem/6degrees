import prisma from "@/lib/prisma"
import { buildSegmentWhere, type SegmentDef } from "@/lib/segment-executor"

const CONTACT_SELECT = {
  id: true, firstName: true, lastName: true,
  position: true, company: true, location: true,
  industry: true, photoUrl: true, commonConnections: true,
  headline: true,
} as const

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
        include: { contact: { select: CONTACT_SELECT } },
      },
    },
  })

  if (!list) return new Response("Not found", { status: 404 })

  const listAny = list as typeof list & { userId: string; filterCompany?: string | null; filterSegment?: string | null }
  const userId = listAny.userId
  const filterCompany = listAny.filterCompany ?? null
  const filterSegment = listAny.filterSegment ?? null

  let contacts: typeof list.members[0]["contact"][]

  if (filterCompany) {
    contacts = await prisma.contact.findMany({
      where: { userId, company: { equals: filterCompany, mode: "insensitive" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: CONTACT_SELECT,
    })
  } else if (filterSegment) {
    try {
      const def = JSON.parse(filterSegment) as SegmentDef
      const where = await buildSegmentWhere(userId, def)
      contacts = await prisma.contact.findMany({
        where,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: CONTACT_SELECT,
      })
    } catch {
      contacts = list.members.map((m) => m.contact)
    }
  } else {
    contacts = list.members.map((m) => m.contact)
  }

  return Response.json({
    name: list.name,
    description: list.description,
    ownerName: list.user.name,
    contactCount: contacts.length,
    contacts,
  })
}
