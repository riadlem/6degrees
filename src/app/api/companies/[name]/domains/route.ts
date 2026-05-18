import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

async function ensureTable() {
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

function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
}

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  await ensureTable()

  const userId = session.user.id
  const company = decodeURIComponent(params.name)

  const rows = await prisma.companyDomain.findMany({
    where: { userId, company },
    select: { domain: true },
    orderBy: { domain: "asc" },
  }).catch(() => [] as { domain: string }[])

  return Response.json({ domains: rows.map((r) => r.domain) })
}

export async function POST(
  req: Request,
  { params }: { params: { name: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  await ensureTable()

  const userId = session.user.id
  const company = decodeURIComponent(params.name)
  const body = await req.json() as { domain?: string }
  const domain = normalizeDomain(body.domain ?? "")

  if (!domain || !domain.includes(".")) {
    return new Response("Invalid domain", { status: 400 })
  }

  await prisma.companyDomain.upsert({
    where: { userId_company_domain: { userId, company, domain } },
    create: { userId, company, domain },
    update: {},
  }).catch(() => {})

  return Response.json({ ok: true, domain })
}

export async function DELETE(
  req: Request,
  { params }: { params: { name: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id
  const company = decodeURIComponent(params.name)
  const body = await req.json() as { domain?: string }
  const domain = (body.domain ?? "").trim().toLowerCase()

  if (!domain) return new Response("Bad request", { status: 400 })

  await prisma.companyDomain.deleteMany({
    where: { userId, company, domain },
  }).catch(() => {})

  return Response.json({ ok: true })
}
