import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id

  const [rows, prefs] = await Promise.all([
    prisma.contact.groupBy({
      by: ["company"],
      where: { userId, company: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.companyPreference.findMany({
      where: { userId },
      select: { company: true },
    }),
  ])

  const preferredSet = new Set(prefs.map((p) => p.company))

  // For each company grab top-4 photo URLs and the most common industry
  const companyNames = rows.map((r) => r.company as string)

  const [samples, industries] = await Promise.all([
    prisma.contact.findMany({
      where: { userId, company: { in: companyNames }, photoUrl: { not: null } },
      select: { company: true, photoUrl: true, id: true },
      orderBy: { extensionSyncedAt: "desc" },
    }),
    prisma.contact.groupBy({
      by: ["company", "industry"],
      where: { userId, company: { in: companyNames }, industry: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ])

  const photosByCompany = new Map<string, string[]>()
  for (const s of samples) {
    if (!s.company || !s.photoUrl) continue
    const arr = photosByCompany.get(s.company) ?? []
    if (arr.length < 4) arr.push(s.photoUrl)
    photosByCompany.set(s.company, arr)
  }

  // Most common industry per company (first in groupBy result since ordered by count desc)
  const industryByCompany = new Map<string, string>()
  for (const r of industries) {
    if (r.company && r.industry && !industryByCompany.has(r.company)) {
      industryByCompany.set(r.company, r.industry)
    }
  }

  const companies = rows
    .filter((r) => r.company)
    .map((r) => ({
      name: r.company as string,
      count: r._count.id,
      preferred: preferredSet.has(r.company as string),
      industry: industryByCompany.get(r.company as string) ?? null,
      photos: photosByCompany.get(r.company as string) ?? [],
    }))

  // Preferred first, then by count desc
  companies.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1
    return b.count - a.count
  })

  return Response.json({ companies })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { company, preferred } = await req.json()
  if (!company) return new Response("Bad request", { status: 400 })

  const userId = session.user.id

  if (preferred) {
    await prisma.companyPreference.upsert({
      where: { userId_company: { userId, company } },
      create: { userId, company },
      update: {},
    })
  } else {
    await prisma.companyPreference.deleteMany({ where: { userId, company } })
  }

  return Response.json({ ok: true })
}
