import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id

  // Fetch all company preferences
  const prefs = await prisma.companyPreference.findMany({
    where: { userId },
    select: { company: true, ignored: true, isPartner: true, size: true },
  }).catch(() => [] as { company: string; ignored: boolean; isPartner: boolean; size: string | null }[])

  const prefMap = new Map(prefs.map((p) => [p.company, p]))

  // Get contact counts per company
  const companyCounts = await prisma.contact.groupBy({
    by: ["company"],
    where: { userId, company: { not: null } },
    _count: { id: true },
  })

  const totalContacts = companyCounts.reduce((s, r) => s + r._count.id, 0)
  const totalCompanies = companyCounts.length
  const preferredCount = prefs.filter((p) => !p.ignored).length
  const partnerCount = prefs.filter((p) => p.isPartner && !p.ignored).length

  // Dashboard only shows companies that are preferred or partner (not ignored)
  const activePrefs = prefs.filter((p) => !p.ignored && (p.isPartner || !p.ignored))
  const targetCompanyNames = prefs
    .filter((p) => !p.ignored && (p.isPartner || prefMap.get(p.company)?.isPartner !== undefined))
    .map((p) => p.company)

  // All non-ignored companies with prefs (preferred or partner)
  const engageCompanies = companyCounts
    .filter((r) => {
      const pref = r.company ? prefMap.get(r.company) : null
      return pref && !pref.ignored
    })
    .map((r) => {
      const pref = prefMap.get(r.company as string)!
      return {
        name:      r.company as string,
        count:     r._count.id,
        preferred: !pref.ignored,
        isPartner: pref.isPartner,
        size:      pref.size,
      }
    })

  if (engageCompanies.length === 0) {
    return Response.json({
      stats: { totalContacts, totalCompanies, preferredCount, partnerCount },
      companies: [],
    }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } })
  }

  const engageNames = engageCompanies.map((c) => c.name)

  // Fetch top contacts + domains for each company (photos derived from topContacts)
  const [topContacts, industries, companyDomains] = await Promise.all([
    prisma.contact.findMany({
      where: { userId, company: { in: engageNames } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        company: true,
        photoUrl: true,
        headline: true,
        profileUrl: true,
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
      },
      orderBy: { extensionSyncedAt: "desc" },
      take: 200,
    }),
    prisma.contact.groupBy({
      by: ["company", "industry"],
      where: { userId, company: { in: engageNames }, industry: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.companyDomain.findMany({
      where: { userId, company: { in: engageNames }, excluded: false },
      select: { company: true, domain: true },
    }).catch(() => [] as { company: string; domain: string }[]),
  ])

  // Primary domain per company (first non-excluded)
  const domainByCompany = new Map<string, string>()
  for (const d of companyDomains) {
    if (!domainByCompany.has(d.company)) domainByCompany.set(d.company, d.domain)
  }

  // Group contacts by company
  const contactsByCompany = new Map<string, typeof topContacts>()
  for (const c of topContacts) {
    if (!c.company) continue
    const arr = contactsByCompany.get(c.company) ?? []
    arr.push(c)
    contactsByCompany.set(c.company, arr)
  }

  const photosByCompany = new Map<string, string[]>()
  for (const c of topContacts) {
    if (!c.company || !c.photoUrl) continue
    const arr = photosByCompany.get(c.company) ?? []
    if (arr.length < 4) { arr.push(c.photoUrl); photosByCompany.set(c.company, arr) }
  }

  const industryByCompany = new Map<string, string>()
  for (const r of industries) {
    if (r.company && r.industry && !industryByCompany.has(r.company)) {
      industryByCompany.set(r.company, r.industry)
    }
  }

  const result = engageCompanies.map((c) => ({
    ...c,
    industry:  industryByCompany.get(c.name) ?? null,
    photos:    photosByCompany.get(c.name) ?? [],
    contacts:  (contactsByCompany.get(c.name) ?? []).slice(0, 5),
    domain:    domainByCompany.get(c.name) ?? null,
  }))

  // Sort: partner+preferred > partner > preferred > rest; within each group by count desc
  result.sort((a, b) => {
    const aScore = (a.isPartner ? 2 : 0) + (a.preferred ? 1 : 0)
    const bScore = (b.isPartner ? 2 : 0) + (b.preferred ? 1 : 0)
    if (aScore !== bScore) return bScore - aScore
    return b.count - a.count
  })

  // Connection-year distribution: count contacts by year of connectedOn
  const connectionYears = await prisma.$queryRaw<{ year: number; count: bigint }[]>`
    SELECT EXTRACT(YEAR FROM "connectedOn")::int AS year, COUNT(*)::bigint AS count
    FROM "Contact"
    WHERE "userId" = ${userId} AND "connectedOn" IS NOT NULL
    GROUP BY year ORDER BY year ASC
  `.then((rows) => rows.map((r) => ({ year: r.year, count: Number(r.count) })))

  return Response.json({
    stats: { totalContacts, totalCompanies, preferredCount, partnerCount },
    companies: result,
    connectionYears,
  }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } })
}
