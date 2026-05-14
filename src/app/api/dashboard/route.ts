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
    })
  }

  const engageNames = engageCompanies.map((c) => c.name)

  // Fetch top contacts + photos for each company
  const [topContacts, photos, industries] = await Promise.all([
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
    }),
    prisma.contact.findMany({
      where: { userId, company: { in: engageNames }, photoUrl: { not: null } },
      select: { company: true, photoUrl: true },
      orderBy: { extensionSyncedAt: "desc" },
    }),
    prisma.contact.groupBy({
      by: ["company", "industry"],
      where: { userId, company: { in: engageNames }, industry: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ])

  // Group contacts by company
  const contactsByCompany = new Map<string, typeof topContacts>()
  for (const c of topContacts) {
    if (!c.company) continue
    const arr = contactsByCompany.get(c.company) ?? []
    arr.push(c)
    contactsByCompany.set(c.company, arr)
  }

  const photosByCompany = new Map<string, string[]>()
  for (const p of photos) {
    if (!p.company || !p.photoUrl) continue
    const arr = photosByCompany.get(p.company) ?? []
    if (arr.length < 4) arr.push(p.photoUrl)
    photosByCompany.set(p.company, arr)
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
  }))

  // Sort: partner+preferred > partner > preferred > rest; within each group by count desc
  result.sort((a, b) => {
    const aScore = (a.isPartner ? 2 : 0) + (a.preferred ? 1 : 0)
    const bScore = (b.isPartner ? 2 : 0) + (b.preferred ? 1 : 0)
    if (aScore !== bScore) return bScore - aScore
    return b.count - a.count
  })

  return Response.json({
    stats: { totalContacts, totalCompanies, preferredCount, partnerCount },
    companies: result,
  })
}
