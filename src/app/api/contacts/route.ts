import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { getSectorIndustries } from "@/lib/industry-sectors"

// Server-side in-memory cache for filter metadata (distinct values per user).
// Avoids 4 full-table distinct scans on every contacts page load.
type FilterCache = {
  industries: string[]
  companies: string[]
  locations: string[]
  countries: string[]
  expiresAt: number
}
const filterCache = new Map<string, FilterCache>()
const FILTER_TTL_MS = 5 * 60 * 1000  // 5 minutes

async function getFilterMetadata(userId: string, companyPrefs: { industry: string | null }[]): Promise<Omit<FilterCache, 'expiresAt'>> {
  const cached = filterCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return { industries: cached.industries, companies: cached.companies, locations: cached.locations, countries: cached.countries }
  }

  // Run all 4 distinct queries in parallel
  const [industryRows, companyRows, locationRows, countryRows] = await Promise.all([
    prisma.contact.findMany({
      where: { userId, industry: { not: null } },
      select: { industry: true },
      distinct: ["industry"],
      orderBy: { industry: "asc" },
    }),
    prisma.contact.findMany({
      where: { userId, company: { not: null } },
      select: { company: true },
      distinct: ["company"],
      orderBy: { company: "asc" },
    }),
    prisma.contact.findMany({
      where: { userId, location: { not: null } },
      select: { location: true },
      distinct: ["location"],
      orderBy: { location: "asc" },
    }),
    prisma.contact.findMany({
      where: { userId, country: { not: null } },
      select: { country: true },
      distinct: ["country"],
      orderBy: { country: "asc" },
    }),
  ])

  // Merge company-level industry prefs into industry list
  const industrySet = new Set(industryRows.map((r) => r.industry).filter(Boolean) as string[])
  for (const p of companyPrefs) {
    if (p.industry) industrySet.add(p.industry)
  }
  const industries = [...industrySet].sort((a, b) => a.localeCompare(b))
  const companies = companyRows.map((r) => r.company).filter(Boolean) as string[]
  const locations = locationRows.map((r) => r.location).filter(Boolean) as string[]
  const countries = countryRows.map((r) => r.country).filter(Boolean) as string[]

  filterCache.set(userId, { industries, companies, locations, countries, expiresAt: Date.now() + FILTER_TTL_MS })
  return { industries, companies, locations, countries }
}

// Ensure search indexes exist (idempotent, runs once on first cold-start)
let _indexesEnsured = false
async function ensureIndexes() {
  if (_indexesEnsured) return
  _indexesEnsured = true
  await Promise.all([
    prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Contact_userId_firstName_idx" ON "Contact"("userId", "firstName")`.catch(() => {}),
    prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Contact_userId_lastName_idx"  ON "Contact"("userId", "lastName")`.catch(() => {}),
  ])
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }
  ensureIndexes().catch(() => {})

  const { searchParams } = new URL(request.url)
  // Normalize accents so "Guillaume" matches "Guillaumé" and vice-versa
  const qRaw = searchParams.get("q") ?? ""
  const q = qRaw.normalize("NFD").replace(/\p{Mn}/gu, "")
  // Multi-company filter (comma-separated from the tag selector)
  const companiesParam = searchParams.get("companies") ?? ""
  const companies = companiesParam ? companiesParam.split(",").map((c) => c.trim()).filter(Boolean) : []
  // Single-company legacy param (used by treemap links, backward compat)
  const company = searchParams.get("company") ?? ""
  const industry = searchParams.get("industry") ?? ""
  const location = searchParams.get("location") ?? ""
  const position = searchParams.get("position") ?? ""
  const labelId = searchParams.get("label") ?? ""
  const preferredOnly = searchParams.get("preferredCompanies") === "true"
  const sector = searchParams.get("sector") ?? ""
  const companyType = searchParams.get("companyType") ?? ""
  const gmailMatched = searchParams.get("gmailMatched") ?? ""
  const country = searchParams.get("country") ?? ""
  const sort = searchParams.get("sort") ?? "name"
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const limit = parseInt(searchParams.get("limit") ?? "48", 10)

  const userId = session.user.id

  const isPartnerFilter = searchParams.get("isPartner") === "true"

  // Fetch company preferences for filtering + subsidiary lookup
  const companyPrefs = await prisma.companyPreference.findMany({
    where: { userId },
    select: { company: true, ignored: true, parentCompany: true, type: true, industry: true, isPartner: true },
  }).catch(async () => {
    await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "parentCompany" TEXT`.catch(() => {})
    await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "type" TEXT`.catch(() => {})
    await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "industry" TEXT`.catch(() => {})
    return prisma.companyPreference.findMany({
      where: { userId },
      select: { company: true, ignored: true, parentCompany: true, type: true, industry: true, isPartner: true },
    }).catch(() => [] as { company: string; ignored: boolean; parentCompany: string | null; type: string | null; industry: string | null; isPartner: boolean }[])
  })

  const preferredCompanies = companyPrefs.filter((p) => !p.ignored).map((p) => p.company)
  const ignoredCompanies   = companyPrefs.filter((p) =>  p.ignored).map((p) => p.company)
  const partnerCompanies   = companyPrefs.filter((p) =>  p.isPartner).map((p) => p.company)

  // Companies matching the requested companyType (brand / non-brand / independent)
  const companyTypeNames = companyType
    ? companyPrefs.filter((p) => p.type === companyType).map((p) => p.company)
    : []

  // Build a filter clause for one company: case-insensitive match + subsidiary expansion
  const oneCompanyClause = (co: string): Prisma.ContactWhereInput => {
    const subs = companyPrefs
      .filter((p) => p.parentCompany?.toLowerCase() === co.toLowerCase())
      .map((p) => p.company)
    if (subs.length === 0) return { company: { equals: co, mode: "insensitive" } }
    return { OR: [{ company: { equals: co, mode: "insensitive" } }, { company: { in: subs } }] }
  }

  // Unified multi-company filter: union of all selected companies (including subsidiaries).
  // Uses the `companies` array first; falls back to single `company` param for legacy treemap links.
  const selectedCompanies = companies.length > 0 ? companies : (company ? [company] : [])
  const buildCompaniesFilter = (): Prisma.ContactWhereInput => {
    if (selectedCompanies.length === 0) return {}
    if (selectedCompanies.length === 1) return oneCompanyClause(selectedCompanies[0])
    return { OR: selectedCompanies.map(oneCompanyClause) }
  }

  const where: Prisma.ContactWhereInput = {
    userId,
    // Exclude contacts with no name (deactivated LinkedIn accounts)
    NOT: { firstName: "", lastName: "" },
    AND: [
      // Preferred / ignored company filters
      ...(preferredOnly && preferredCompanies.length > 0 ? [{ company: { in: preferredCompanies } }] : []),
      ...(!preferredOnly && !company && ignoredCompanies.length > 0 ? [{ company: { notIn: ignoredCompanies } }] : []),
      // Search query (any field)
      // Multi-word queries (e.g. "William B") split across firstName + lastName
      ...(q ? (() => {
        const words = q.trim().split(/\s+/).filter(Boolean)
        const baseClauses: Prisma.ContactWhereInput[] = [
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName:  { contains: q, mode: "insensitive" as const } },
          { company:   { contains: q, mode: "insensitive" as const } },
          { position:  { contains: q, mode: "insensitive" as const } },
        ]
        // When multiple words: require EACH word to appear in firstName OR lastName
        // so "William B" matches firstName=William + lastName=Brown
        if (words.length >= 2) {
          baseClauses.push({
            AND: words.map((w) => ({
              OR: [
                { firstName: { contains: w, mode: "insensitive" as const } },
                { lastName:  { contains: w, mode: "insensitive" as const } },
              ],
            })),
          })
        }
        return [{ OR: baseClauses }]
      })() : []),
      // Company filter (multi-select with subsidiary expansion per company)
      ...(selectedCompanies.length > 0 ? [buildCompaniesFilter()] : []),
      // Industry filter: company-confirmed industry takes precedence over LinkedIn contact industry.
      // A contact matches if:
      //   (a) their company has a confirmed industry matching the filter, OR
      //   (b) their LinkedIn industry matches AND their company hasn't been confirmed as a different industry.
      ...(industry ? (() => {
        const confirmedMatch = companyPrefs
          .filter((p) => p.industry?.toLowerCase().includes(industry.toLowerCase()))
          .map((p) => p.company)
        const confirmedOther = companyPrefs
          .filter((p) => p.industry && !p.industry.toLowerCase().includes(industry.toLowerCase()))
          .map((p) => p.company)
        const contactIndustryClause: Prisma.ContactWhereInput = confirmedOther.length > 0
          ? { industry: { contains: industry, mode: "insensitive" as const }, NOT: { company: { in: confirmedOther } } }
          : { industry: { contains: industry, mode: "insensitive" as const } }
        return [{ OR: [...(confirmedMatch.length > 0 ? [{ company: { in: confirmedMatch } }] : []), contactIndustryClause] }]
      })() : []),
      ...(location  ? [{ location:  { contains: location,  mode: "insensitive" as const } }] : []),
      ...(position  ? [{ position:  { contains: position,  mode: "insensitive" as const } }] : []),
      ...(labelId   ? [{ labels:    { some: { labelId } } }] : []),
      // Sector filter: match any of the LinkedIn industry strings for that sector.
      // Also include contacts at companies whose confirmed industry falls within the sector.
      ...(sector ? (() => {
        const sectorIndustries = getSectorIndustries(sector)
        const sectorMatchCompanies = companyPrefs
          .filter((p) => p.industry && sectorIndustries.some((si) => si.toLowerCase() === p.industry!.toLowerCase()))
          .map((p) => p.company)
        const sectorOtherCompanies = companyPrefs
          .filter((p) => p.industry && !sectorIndustries.some((si) => si.toLowerCase() === p.industry!.toLowerCase()))
          .map((p) => p.company)
        const contactSectorClause: Prisma.ContactWhereInput = sectorOtherCompanies.length > 0
          ? { OR: sectorIndustries.map((ind) => ({ industry: { equals: ind, mode: "insensitive" as const } })), NOT: { company: { in: sectorOtherCompanies } } }
          : { OR: sectorIndustries.map((ind) => ({ industry: { equals: ind, mode: "insensitive" as const } })) }
        return [{ OR: [...(sectorMatchCompanies.length > 0 ? [{ company: { in: sectorMatchCompanies } }] : []), contactSectorClause] }]
      })() : []),
      // Company type filter: contacts at companies tagged with that type
      // If companyType is set but no companies are tagged, return nothing
      ...(companyType
        ? companyTypeNames.length > 0
          ? [{ company: { in: companyTypeNames, mode: "insensitive" as const } }]
          : [{ id: "__no_match__" }]
        : []),
      // Partner filter: contacts at companies marked as partner
      ...(isPartnerFilter
        ? partnerCompanies.length > 0
          ? [{ company: { in: partnerCompanies } }]
          : [{ id: "__no_match__" }]
        : []),
      ...(gmailMatched === "matched"         ? [{ emailAddress: { not: null } }] : []),
      ...(gmailMatched === "unmatched"       ? [{ emailAddress: null }] : []),
      ...(gmailMatched === "email_no_linkedin" ? [{ emailAddress: { not: null }, profileUrl: null }] : []),
      ...(country ? [{ country: { contains: country, mode: "insensitive" as const } }] : []),
    ],
  }

  const primaryOrder: Prisma.ContactOrderByWithRelationInput =
    sort === "company"        ? { company: "asc" } :
    sort === "connected"      ? { connectedOn: { sort: "desc", nulls: "last" } } :
    sort === "connected_asc"  ? { connectedOn: { sort: "asc",  nulls: "last" } } :
    sort === "recent"         ? { syncedAt: "desc" } :
    sort === "location"       ? { location: "asc" } :
    sort === "mutual"         ? { commonConnections: { sort: "desc", nulls: "last" } } :
    sort === "mutual_asc"     ? { commonConnections: { sort: "asc",  nulls: "last" } } :
    sort === "name_desc"      ? { lastName: "desc" } :
    sort === "score"          ? { interactionScore: { sort: "desc", nulls: "last" } } :
    sort === "drift_score"    ? { driftScore: { sort: "desc", nulls: "last" } } :
    sort === "country"        ? { country: "asc" } :
    sort === "country_desc"   ? { country: "desc" } :
    sort === "industry"       ? { industry: "asc" } :
    sort === "industry_desc"  ? { industry: "desc" } :
    { firstName: "asc" }
  // Deterministic tie-breaker: contacts with identical primary-sort values
  // keep a stable alphabetical position across pages.
  const orderBy: Prisma.ContactOrderByWithRelationInput[] = [
    primaryOrder,
    { firstName: "asc" },
    { lastName: "asc" },
  ]

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        notes: { orderBy: { createdAt: "desc" }, take: 1 },
        listMembers: { select: { listId: true, list: { select: { name: true } } } },
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
        whatsAppMessages:   { take: 1, orderBy: { sentAt: "desc" as const }, select: { sentAt: true, isOutbound: true } },
        linkedInDMMessages: { take: 1, orderBy: { sentAt: "desc" as const }, select: { sentAt: true, isOutbound: true } },
      },
    }),
    prisma.contact.count({ where }),
  ])

  const [filterMeta, labels] = await Promise.all([
    getFilterMetadata(userId, companyPrefs),
    prisma.label.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
    }),
  ])

  // Companies that have at least one subsidiary registered
  const parentCompanyNames = [...new Set(
    companyPrefs.filter((p) => p.parentCompany).map((p) => p.parentCompany!)
  )]

  return Response.json({
    contacts,
    total,
    page,
    pages: Math.ceil(total / limit),
    filters: {
      industries: filterMeta.industries,
      companies: filterMeta.companies,
      locations: filterMeta.locations,
      countries: filterMeta.countries,
      labels,
      parentCompanies: parentCompanyNames,
    },
  }, { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" } })
}

// POST: filter contacts to a specific set of IDs (used by segment builder display mode).
// Avoids URL length limits of a GET with hundreds of IDs in query params.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await request.json() as { ids?: string[]; sort?: string; page?: number; limit?: number }
  const { ids = [], sort = "name", page = 1, limit = 48 } = body

  if (ids.length === 0) {
    return Response.json({ contacts: [], total: 0, page: 1, pages: 0, filters: { industries: [], companies: [], locations: [], countries: [], labels: [] } })
  }

  const primaryOrder: Prisma.ContactOrderByWithRelationInput =
    sort === "company"        ? { company: "asc" } :
    sort === "connected"      ? { connectedOn: { sort: "desc", nulls: "last" } } :
    sort === "connected_asc"  ? { connectedOn: { sort: "asc",  nulls: "last" } } :
    sort === "recent"         ? { syncedAt: "desc" } :
    sort === "location"       ? { location: "asc" } :
    sort === "mutual"         ? { commonConnections: { sort: "desc", nulls: "last" } } :
    sort === "mutual_asc"     ? { commonConnections: { sort: "asc",  nulls: "last" } } :
    sort === "name_desc"      ? { lastName: "desc" } :
    sort === "score"          ? { interactionScore: { sort: "desc", nulls: "last" } } :
    sort === "drift_score"    ? { driftScore: { sort: "desc", nulls: "last" } } :
    sort === "country"        ? { country: "asc" } :
    sort === "country_desc"   ? { country: "desc" } :
    sort === "industry"       ? { industry: "asc" } :
    sort === "industry_desc"  ? { industry: "desc" } :
    { firstName: "asc" }
  // Deterministic tie-breaker: contacts with identical primary-sort values
  // keep a stable alphabetical position across pages.
  const orderBy: Prisma.ContactOrderByWithRelationInput[] = [
    primaryOrder,
    { firstName: "asc" },
    { lastName: "asc" },
  ]

  const where: Prisma.ContactWhereInput = {
    userId,
    id: { in: ids },
    NOT: { firstName: "", lastName: "" },
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        notes: { orderBy: { createdAt: "desc" }, take: 1 },
        listMembers: { select: { listId: true, list: { select: { name: true } } } },
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
        whatsAppMessages:   { take: 1, orderBy: { sentAt: "desc" as const }, select: { sentAt: true, isOutbound: true } },
        linkedInDMMessages: { take: 1, orderBy: { sentAt: "desc" as const }, select: { sentAt: true, isOutbound: true } },
      },
    }),
    prisma.contact.count({ where }),
  ])

  filterCache.delete(session.user.id)
  // Return empty filter options in segment mode — filters panel is hidden
  return Response.json({
    contacts,
    total,
    page,
    pages: Math.ceil(total / limit),
    filters: { industries: [], companies: [], locations: [], countries: [], labels: [] },
  })
}
