import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

async function ensureColumns() {
  await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "industry" TEXT`.catch(() => {})
  await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "website" TEXT`.catch(() => {})
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "CompanyDomain" (
      "id"      TEXT NOT NULL,
      "userId"  TEXT NOT NULL,
      "company" TEXT NOT NULL,
      "domain"  TEXT NOT NULL,
      CONSTRAINT "CompanyDomain_pkey"                       PRIMARY KEY ("id"),
      CONSTRAINT "CompanyDomain_userId_company_domain_key" UNIQUE ("userId", "company", "domain"),
      CONSTRAINT "CompanyDomain_userId_fkey"               FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE
    )
  `.catch(() => {})
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "CompanyDomain_userId_company_idx" ON "CompanyDomain"("userId", "company")
  `.catch(() => {})
}

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureColumns()

  const companyName = decodeURIComponent(params.name)

  const [pref, countResult, contactRows, manualDomainRows] = await Promise.all([
    prisma.companyPreference.findUnique({
      where: { userId_company: { userId, company: companyName } },
      select: { ignored: true, isPartner: true, size: true, type: true, parentCompany: true, industry: true, website: true },
    }),
    prisma.contact.count({ where: { userId, company: companyName } }),
    prisma.contact.findMany({
      where: { userId, company: companyName },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        company: true,
        photoUrl: true,
        emailAddress: true,
        lastInteractionAt: true,
        interactionScore: true,
        outreachStatus: true,
        profileUrl: true,
        labels: { select: { label: { select: { id: true, name: true, color: true } } } },
        emailAddresses: { select: { email: true }, take: 5 },
      },
    }),
    prisma.companyDomain.findMany({
      where: { userId, company: companyName },
      select: { domain: true },
      orderBy: { domain: "asc" },
    }).catch(() => [] as { domain: string }[]),
  ])

  // Sort: partner first, then preferred, then by interactionScore desc
  const sortedContacts = [...contactRows].sort((a, b) => {
    const scoreA = a.interactionScore ?? 0
    const scoreB = b.interactionScore ?? 0
    return scoreB - scoreA
  })

  // Collect domains inferred from matched contacts' email addresses
  const inferredDomainsSet = new Set<string>()
  for (const c of contactRows) {
    if (c.emailAddress) {
      const domain = c.emailAddress.split("@")[1]?.toLowerCase()
      if (domain) inferredDomainsSet.add(domain)
    }
    for (const ea of c.emailAddresses) {
      const domain = ea.email.split("@")[1]?.toLowerCase()
      if (domain) inferredDomainsSet.add(domain)
    }
  }

  const manualDomains = manualDomainRows.map((r) => r.domain)

  // Merge: manual domains take priority, then inferred
  const allDomainsSet = new Set([...manualDomains, ...inferredDomainsSet])

  return Response.json({
    company: {
      name:             companyName,
      count:            countResult,
      ignored:          pref?.ignored ?? false,
      isPartner:        pref?.isPartner ?? false,
      preferred:        pref ? !pref.ignored : false,
      size:             pref?.size ?? null,
      type:             pref?.type ?? null,
      parentCompany:    pref?.parentCompany ?? null,
      industry:         pref?.industry ?? null,
      website:          pref?.website ?? null,
    },
    contacts: sortedContacts,
    domains: [...allDomainsSet],
    manualDomains,
    inferredDomains: [...inferredDomainsSet],
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: { name: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureColumns()

  const companyName = decodeURIComponent(params.name)
  const body = await req.json() as Record<string, unknown>

  const allowed: Record<string, unknown> = {}
  const ALLOWED_KEYS = ["industry", "website", "size", "type", "parentCompany", "isPartner", "ignored"]
  for (const key of ALLOWED_KEYS) {
    if (key in body) allowed[key] = body[key] ?? null
  }

  if (Object.keys(allowed).length === 0) return Response.json({ ok: true })

  await prisma.companyPreference.upsert({
    where: { userId_company: { userId, company: companyName } },
    create: { userId, company: companyName, ...allowed },
    update: allowed,
  })

  return Response.json({ ok: true })
}
