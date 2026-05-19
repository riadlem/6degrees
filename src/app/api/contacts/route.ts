import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { getSectorIndustries } from "@/lib/industry-sectors"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q") ?? ""
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

  // Fetch company preferences for filtering + subsidiary lookup
  const companyPrefs = await prisma.companyPreference.findMany({
    where: { userId },
    select: { company: true, ignored: true, parentCompany: true, type: true, industry: true },
  }).catch(async () => {
    await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "parentCompany" TEXT`.catch(() => {})
    await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "type" TEXT`.catch(() => {})
    await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "industry" TEXT`.catch(() => {})
    return prisma.companyPreference.findMany({
      where: { userId },
      select: { company: true, ignored: true, parentCompany: true, type: true, industry: true },
    }).catch(() => [] as { company: string; ignored: boolean; parentCompany: string | null; type: string | null; industry: string | null }[])
  })

  const preferredCompanies = companyPrefs.filter((p) => !p.ignored).map((p) => p.company)
  const ignoredCompanies   = companyPrefs.filter((p) =>  p.ignored).map((p) => p.company)

  // Companies matching the requested companyType (brand / non-brand / independent)
  const companyTypeNames = companyType
    ? companyPrefs.filter((p) => p.type === companyType).map((p) => p.company)
    : []

  // When a specific company is requested, include its subsidiaries automatically
  const subsidiaryNames = company
    ? companyPrefs
        .filter((p) => p.parentCompany?.toLowerCase() === company.toLowerCase())
        .map((p) => p.company)
    : []

  // Build company filter: parent (case-insensitive) + exact subsidiary names
  const companyFilter = (): Prisma.ContactWhereInput => {
    if (!company) return {}
    if (subsidiaryNames.length === 0) return { company: { equals: company, mode: "insensitive" } }
    return {
      OR: [
        { company: { equals: company, mode: "insensitive" } },
        { company: { in: subsidiaryNames } },
      ],
    }
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
      ...(q ? [{
        OR: [
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName:  { contains: q, mode: "insensitive" as const } },
          { company:   { contains: q, mode: "insensitive" as const } },
          { position:  { contains: q, mode: "insensitive" as const } },
        ],
      }] : []),
      // Company filter (with subsidiary expansion)
      ...(company ? [companyFilter()] : []),
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
      ...(gmailMatched === "matched"         ? [{ emailAddress: { not: null } }] : []),
      ...(gmailMatched === "unmatched"       ? [{ emailAddress: null }] : []),
      ...(gmailMatched === "email_no_linkedin" ? [{ emailAddress: { not: null }, profileUrl: null }] : []),
      ...(country ? [{ country: { contains: country, mode: "insensitive" as const } }] : []),
    ],
  }

  const orderBy: Prisma.ContactOrderByWithRelationInput =
    sort === "company"        ? { company: "asc" } :
    sort === "connected"      ? { connectedOn: "desc" } :
    sort === "connected_asc"  ? { connectedOn: "asc" } :
    sort === "recent"         ? { syncedAt: "desc" } :
    sort === "location"       ? { location: "asc" } :
    sort === "mutual"         ? { commonConnections: "desc" } :
    sort === "name_desc"      ? { lastName: "desc" } :
    sort === "score"          ? { interactionScore: "desc" } :
    sort === "country"        ? { country: "asc" } :
    sort === "country_desc"   ? { country: "desc" } :
    sort === "industry"       ? { industry: "asc" } :
    sort === "industry_desc"  ? { industry: "desc" } :
    { firstName: "asc" }

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
      },
    }),
    prisma.contact.count({ where }),
  ])

  const [industries, companies, locations, countries, labels] = await Promise.all([
    prisma.contact.findMany({
      where: { userId: session.user.id, industry: { not: null } },
      select: { industry: true },
      distinct: ["industry"],
      orderBy: { industry: "asc" },
    }).then((rows) => {
      // Merge confirmed company industries into the dropdown so company-level
      // industry assignments are always visible as filter options.
      const contactIndustries = new Set(rows.map((r) => r.industry).filter(Boolean) as string[])
      for (const p of companyPrefs) {
        if (p.industry) contactIndustries.add(p.industry)
      }
      return [...contactIndustries].sort((a, b) => a.localeCompare(b)).map((i) => ({ industry: i }))
    }),
    prisma.contact.findMany({
      where: { userId: session.user.id, company: { not: null } },
      select: { company: true },
      distinct: ["company"],
      orderBy: { company: "asc" },
    }),
    prisma.contact.findMany({
      where: { userId: session.user.id, location: { not: null } },
      select: { location: true },
      distinct: ["location"],
      orderBy: { location: "asc" },
    }),
    prisma.contact.findMany({
      where: { userId: session.user.id, country: { not: null } },
      select: { country: true },
      distinct: ["country"],
      orderBy: { country: "asc" },
    }),
    prisma.label.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
    }),
  ])

  return Response.json({
    contacts,
    total,
    page,
    pages: Math.ceil(total / limit),
    filters: {
      industries: industries.map((r) => r.industry).filter(Boolean),
      companies: companies.map((r) => r.company).filter(Boolean),
      locations: locations.map((r) => r.location).filter(Boolean),
      countries: countries.map((r) => r.country).filter(Boolean),
      labels,
    },
  })
}
