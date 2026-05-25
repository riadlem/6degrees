import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Ensure filterCompany column exists (idempotent)
let _colEnsured = false
async function ensureCol() {
  if (_colEnsured) return
  _colEnsured = true
  await prisma.$executeRaw`ALTER TABLE "ContactList" ADD COLUMN IF NOT EXISTS "filterCompany" TEXT`.catch(() => {})
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  await ensureCol()

  const lists = await prisma.contactList.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { members: true } },
    },
  })

  // For company lists, override the member count with a live contact count
  type ListWithFC = typeof lists[number] & { filterCompany?: string | null }
  const listsWithFC = lists as ListWithFC[]
  const companyLists = listsWithFC.filter((l) => l.filterCompany)
  const dynamicCounts = new Map<string, number>()
  if (companyLists.length > 0) {
    const companies = companyLists.map((l) => l.filterCompany as string)
    const rows = await prisma.contact.groupBy({
      by: ["company"],
      where: { userId: session.user.id, company: { in: companies } },
      _count: { id: true },
    })
    for (const r of rows) {
      if (r.company) dynamicCounts.set(r.company, r._count.id)
    }
  }

  const result = listsWithFC.map((l) => {
    const fc = l.filterCompany ?? null
    return {
      ...l,
      filterCompany: fc,
      _count: fc
        ? { members: dynamicCounts.get(fc) ?? 0 }
        : l._count,
    }
  })

  return Response.json(result)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  await ensureCol()

  const { name, description, filterCompany } = await request.json()
  if (!name?.trim()) {
    return Response.json({ error: "Name required" }, { status: 400 })
  }

  const data = {
    userId: session.user.id,
    name: name.trim(),
    description: description?.trim() ?? null,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (filterCompany?.trim()) (data as any).filterCompany = filterCompany.trim()

  const list = await prisma.contactList.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
    include: { _count: { select: { members: true } } },
  })
  return Response.json({ ...list, filterCompany: filterCompany?.trim() ?? null }, { status: 201 })
}
