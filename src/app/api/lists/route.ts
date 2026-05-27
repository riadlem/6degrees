import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { executeSegmentCount, type SegmentDef } from "@/lib/segment-executor"

// Ensure both dynamic-list columns exist (idempotent)
let _colEnsured = false
async function ensureCol() {
  if (_colEnsured) return
  _colEnsured = true
  await prisma.$executeRaw`ALTER TABLE "ContactList" ADD COLUMN IF NOT EXISTS "filterCompany" TEXT`.catch(() => {})
  await prisma.$executeRaw`ALTER TABLE "ContactList" ADD COLUMN IF NOT EXISTS "filterSegment" TEXT`.catch(() => {})
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id
  await ensureCol()

  const lists = await prisma.contactList.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { members: true } } },
  })

  type ListRow = typeof lists[number] & {
    filterCompany?: string | null
    filterSegment?: string | null
  }
  const rows = lists as ListRow[]

  // 1. Company lists — one grouped count query
  const companyLists = rows.filter((l) => l.filterCompany)
  const dynamicCompanyCounts = new Map<string, number>()
  if (companyLists.length > 0) {
    const companies = companyLists.map((l) => l.filterCompany as string)
    const grouped = await prisma.contact.groupBy({
      by: ["company"],
      where: { userId, company: { in: companies } },
      _count: { id: true },
    })
    for (const r of grouped) {
      if (r.company) dynamicCompanyCounts.set(r.company, r._count.id)
    }
  }

  // 2. Segment (smart) lists — run counts in parallel
  const segmentLists = rows.filter((l) => l.filterSegment && !l.filterCompany)
  const segmentCountMap = new Map<string, number>()
  if (segmentLists.length > 0) {
    const counts = await Promise.all(
      segmentLists.map(async (l) => {
        try {
          const def = JSON.parse(l.filterSegment!) as SegmentDef
          const count = await executeSegmentCount(userId, def)
          return { id: l.id, count }
        } catch {
          return { id: l.id, count: 0 }
        }
      })
    )
    for (const { id, count } of counts) segmentCountMap.set(id, count)
  }

  const result = rows.map((l) => {
    const fc = l.filterCompany ?? null
    const fs = l.filterSegment ?? null
    let memberCount = l._count.members
    if (fc)      memberCount = dynamicCompanyCounts.get(fc) ?? 0
    else if (fs) memberCount = segmentCountMap.get(l.id) ?? 0
    return { ...l, filterCompany: fc, filterSegment: fs, _count: { members: memberCount } }
  })

  return Response.json(result)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  await ensureCol()

  const { name, description, filterCompany, filterSegment } = await request.json()
  if (!name?.trim()) {
    return Response.json({ error: "Name required" }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {
    userId: session.user.id,
    name: name.trim(),
    description: description?.trim() ?? null,
  }
  if (filterCompany?.trim()) data.filterCompany = filterCompany.trim()
  if (filterSegment)         data.filterSegment = typeof filterSegment === "string"
    ? filterSegment
    : JSON.stringify(filterSegment)

  const list = await prisma.contactList.create({
    data,
    include: { _count: { select: { members: true } } },
  })

  return Response.json({
    ...list,
    filterCompany: data.filterCompany ?? null,
    filterSegment: data.filterSegment ?? null,
  }, { status: 201 })
}
