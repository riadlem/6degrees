import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { buildSegmentWhere, type SegmentDef } from "@/lib/segment-executor"

const CONTACT_INCLUDE = {
  notes: { take: 1, orderBy: { createdAt: "desc" } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
  whatsAppMessages:  { take: 1, orderBy: { sentAt: "desc" as const }, select: { sentAt: true, isOutbound: true } },
  linkedInDMMessages: { take: 1, orderBy: { sentAt: "desc" as const }, select: { sentAt: true, isOutbound: true } },
} as const

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const list = await prisma.contactList.findFirst({
    where: { id: params.id, userId },
    include: {
      members: {
        orderBy: { addedAt: "desc" },
        include: { contact: { include: CONTACT_INCLUDE } },
      },
      _count: { select: { members: true } },
    },
  })
  if (!list) return new Response("Not found", { status: 404 })

  const filterCompany = (list as { filterCompany?: string | null }).filterCompany ?? null
  const filterSegment = (list as { filterSegment?: string | null }).filterSegment ?? null

  // ── Company dynamic list ──────────────────────────────────────────────────
  if (filterCompany) {
    const contacts = await prisma.contact.findMany({
      where: { userId, company: { equals: filterCompany, mode: "insensitive" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: CONTACT_INCLUDE,
    })
    return Response.json({
      ...list,
      filterCompany,
      filterSegment: null,
      members: contacts.map((c) => ({ id: c.id, addedAt: list.createdAt.toISOString(), contact: c })),
      _count: { members: contacts.length },
    })
  }

  // ── Smart segment list ────────────────────────────────────────────────────
  if (filterSegment) {
    try {
      const def = JSON.parse(filterSegment) as SegmentDef
      const where = await buildSegmentWhere(userId, def)
      const contacts = await prisma.contact.findMany({
        where,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        include: CONTACT_INCLUDE,
      })
      return Response.json({
        ...list,
        filterCompany: null,
        filterSegment,
        members: contacts.map((c) => ({ id: c.id, addedAt: list.createdAt.toISOString(), contact: c })),
        _count: { members: contacts.length },
      })
    } catch {
      // Malformed JSON — fall through to return static members
    }
  }

  // ── Static manual list ────────────────────────────────────────────────────
  return Response.json({ ...list, filterCompany: null, filterSegment: null })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await request.json()
  const { name, description, filterSegment } = body as {
    name?: string
    description?: string
    filterSegment?: string | null
  }
  const list = await prisma.contactList.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: {
      ...(name           != null && { name: name.trim() }),
      ...(description    != null && { description: description.trim() }),
      ...(filterSegment  !== undefined && { filterSegment }),
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
