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
  const sort = searchParams.get("sort") ?? "name"
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const limit = parseInt(searchParams.get("limit") ?? "48", 10)

  const userId = session.user.id

  // Fetch company preferences for filtering + subsidiary lookup
  const companyPrefs = await prisma.companyPreference.findMany({
    where: { userId },
    select: { company: true, ignored: true, parentCompany: true, type: true },
  }).catch(async () => {
    await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "parentCompany" TEXT`.catch(() => {})
    await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "type" TEXT`.catch(() => {})
    return prisma.companyPreference.findMany({
      where: { userId },
      select: { company: true, ignored: true, parentCompany: true, type: true },
    }).catch(() => [] as { company: string; ignored: boolean; parentCompany: string | null; type: string | null }[])
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
      ...(industry  ? [{ industry:  { contains: industry,  mode: "insensitive" as const } }] : []),
      ...(location  ? [{ location:  { contains: location,  mode: "insensitive" as const } }] : []),
      ...(position  ? [{ position:  { contains: position,  mode: "insensitive" as const } }] : []),
      ...(labelId   ? [{ labels:    { some: { labelId } } }] : []),
      // Sector filter: match any of the LinkedIn industry strings for that sector
      ...(sector ? [{
        OR: getSectorIndustries(sector).map((ind) => ({
          industry: { equals: ind, mode: "insensitive" as const },
        })),
      }] : []),
      // Company type filter: contacts at companies tagged with that type
      // If companyType is set but no companies are tagged, return nothing
      ...(companyType
        ? companyTypeNames.length > 0
          ? [{ company: { in: companyTypeNames, mode: "insensitive" as const } }]
          : [{ id: "__no_match__" }]
        : []),
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

  const [industries, companies, locations, labels] = await Promise.all([
    prisma.contact.findMany({
      where: { userId: session.user.id, industry: { not: null } },
      select: { industry: true },
      distinct: ["industry"],
      orderBy: { industry: "asc" },
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
      labels,
    },
  })
}
