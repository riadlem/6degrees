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
      select: { company: true, ignored: true },
    }).catch(() => [] as { company: string; ignored: boolean }[]),
  ])

  const preferredSet = new Set(prefs.filter((p) => !p.ignored).map((p) => p.company))
  const ignoredSet  = new Set(prefs.filter((p) =>  p.ignored).map((p) => p.company))

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

  const industryByCompany = new Map<string, string>()
  for (const r of industries) {
    if (r.company && r.industry && !industryByCompany.has(r.company)) {
      industryByCompany.set(r.company, r.industry)
    }
  }

  const companies = rows
    .filter((r) => r.company)
    .map((r) => ({
      name:      r.company as string,
      count:     r._count.id,
      preferred: preferredSet.has(r.company as string),
      ignored:   ignoredSet.has(r.company as string),
      industry:  industryByCompany.get(r.company as string) ?? null,
      photos:    photosByCompany.get(r.company as string) ?? [],
    }))

  // preferred first → neutral → ignored last; within each group sort by count desc
  companies.sort((a, b) => {
    if (a.ignored  !== b.ignored)  return a.ignored  ? 1 : -1
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1
    return b.count - a.count
  })

  return Response.json({ companies })
}

// POST body: { company: string; status: "preferred" | "ignored" | "none" }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { company, status } = await req.json() as { company?: string; status?: string }
  if (!company) return new Response("Bad request", { status: 400 })

  const userId = session.user.id

  const save = async () => {
    if (status === "none") {
      await prisma.companyPreference.deleteMany({ where: { userId, company } })
    } else {
      await prisma.companyPreference.upsert({
        where: { userId_company: { userId, company } },
        create: { userId, company, ignored: status === "ignored" },
        update: { ignored: status === "ignored" },
      })
    }
  }

  try {
    await save()
  } catch {
    // Table likely missing — create it (self-healing migration) then retry.
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "CompanyPreference" (
          "id"      TEXT NOT NULL,
          "userId"  TEXT NOT NULL,
          "company" TEXT NOT NULL,
          "ignored" BOOLEAN NOT NULL DEFAULT FALSE,
          CONSTRAINT "CompanyPreference_pkey"               PRIMARY KEY ("id"),
          CONSTRAINT "CompanyPreference_userId_company_key"  UNIQUE ("userId", "company"),
          CONSTRAINT "CompanyPreference_userId_fkey"         FOREIGN KEY ("userId")
            REFERENCES "User"("id") ON DELETE CASCADE
        )
      `
      await prisma.$executeRaw`
        ALTER TABLE "CompanyPreference"
        ADD COLUMN IF NOT EXISTS "ignored" BOOLEAN NOT NULL DEFAULT FALSE
      `
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "CompanyPreference_userId_idx"
        ON "CompanyPreference"("userId")
      `
      await save()
    } catch {
      return Response.json({ ok: false, error: "Could not save preference" }, { status: 503 })
    }
  }

  return Response.json({ ok: true })
}
