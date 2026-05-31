import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const PREF_SELECT = { company: true, ignored: true, isPartner: true, size: true, type: true, parentCompany: true, industry: true, website: true } as const

/**
 * Ensure partial indexes exist for fast photo/location lookups.
 * CREATE INDEX IF NOT EXISTS is near-instant when the index already exists.
 * We run this once per cold start (serverless: per lambda invocation on first request).
 */
let _indexesReady: Promise<void> | null = null
function ensureIndexes() {
  if (_indexesReady) return _indexesReady
  _indexesReady = Promise.all([
    prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Contact_userId_photoUrl_idx"
      ON "Contact"("userId", "extensionSyncedAt" DESC)
      WHERE "photoUrl" IS NOT NULL AND "company" IS NOT NULL`.catch(() => {}),
    prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Contact_userId_location_idx"
      ON "Contact"("userId", "company")
      WHERE "location" IS NOT NULL AND "company" IS NOT NULL`.catch(() => {}),
  ]).then(() => {})
  return _indexesReady
}

async function getPrefs(userId: string) {
  return prisma.companyPreference.findMany({ where: { userId }, select: PREF_SELECT })
    .catch(async () => {
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "type" TEXT`.catch(() => {})
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "parentCompany" TEXT`.catch(() => {})
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "industry" TEXT`.catch(() => {})
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "website" TEXT`.catch(() => {})
      return prisma.companyPreference.findMany({ where: { userId }, select: PREF_SELECT })
        .catch(() => [] as { company: string; ignored: boolean; isPartner: boolean; size: string | null; type: string | null; parentCompany: string | null; industry: string | null; website: string | null }[])
    })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id

  // Ensure partial indexes exist (fast no-op when already present)
  ensureIndexes()

  const [rows, prefs] = await Promise.all([
    prisma.contact.groupBy({
      by: ["company"],
      where: { userId, company: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    getPrefs(userId),
  ])

  const prefMap = new Map(prefs.map((p) => [p.company, p]))

  // Avoid large IN clause by scanning only relevant subsets:
  // - contacts with a photo (for avatar chips) — partial index makes this fast
  // - contacts with a location (for dominant-country derivation) — partial index
  // - contacts with an industry (for company industry inference) — existing indexes
  const [samples, industries, locationRows] = await Promise.all([
    prisma.contact.findMany({
      where: { userId, company: { not: null }, photoUrl: { not: null } },
      select: { company: true, photoUrl: true },
      orderBy: { extensionSyncedAt: "desc" },
    }),
    prisma.contact.groupBy({
      by: ["company", "industry"],
      where: { userId, company: { not: null }, industry: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    // Derive dominant country per company from contact location strings
    // ("Paris, Île-de-France, France" → last comma-segment → "France")
    prisma.contact.findMany({
      where: { userId, company: { not: null }, location: { not: null } },
      select: { company: true, location: true },
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

  // Derive dominant country per company: last comma-segment of location string,
  // e.g. "Paris, Île-de-France, France" → "France"; "London, United Kingdom" → "United Kingdom"
  const countryCounts = new Map<string, Map<string, number>>()
  for (const r of locationRows) {
    if (!r.company || !r.location) continue
    const parts = r.location.split(",")
    const country = parts[parts.length - 1].trim()
    if (country.length < 2) continue
    if (!countryCounts.has(r.company)) countryCounts.set(r.company, new Map())
    const m = countryCounts.get(r.company)!
    m.set(country, (m.get(country) ?? 0) + 1)
  }
  const countryByCompany = new Map<string, string>()
  for (const [company, m] of countryCounts) {
    let max = 0, best = ""
    for (const [country, cnt] of m) {
      if (cnt > max) { max = cnt; best = country }
    }
    if (best) countryByCompany.set(company, best)
  }

  const companies = rows
    .filter((r) => r.company)
    .map((r) => {
      const pref = prefMap.get(r.company as string)
      return {
        name:          r.company as string,
        count:         r._count.id,
        preferred:     pref ? !pref.ignored : false,
        ignored:       pref?.ignored ?? false,
        isPartner:     pref?.isPartner ?? false,
        size:          pref?.size ?? null,
        type:          pref?.type ?? null,
        parentCompany: pref?.parentCompany ?? null,
        industry:      pref?.industry ?? industryByCompany.get(r.company as string) ?? null,
        industryConfirmed: !!pref?.industry,
        country:       countryByCompany.get(r.company as string) ?? null,
        photos:        photosByCompany.get(r.company as string) ?? [],
      }
    })

  companies.sort((a, b) => {
    if (a.ignored !== b.ignored) return a.ignored ? 1 : -1
    const aScore = (a.isPartner ? 2 : 0) + (a.preferred ? 1 : 0)
    const bScore = (b.isPartner ? 2 : 0) + (b.preferred ? 1 : 0)
    if (aScore !== bScore) return bScore - aScore
    return b.count - a.count
  })

  return Response.json({ companies }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } })
}

// POST body — one of:
//   { company, status: "preferred" | "ignored" | "none" }
//   { company, size: "small" | "medium" | "corporate" | "fortune500" | null }
//   { company, isPartner: boolean }
//   { company, type: "brand" | "non-brand" | "independent" | null }
//   { company, parentCompany: string | null }
//   { company, newName: string }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json() as {
    company?: string
    status?: string
    size?: string | null
    isPartner?: boolean
    type?: string | null
    parentCompany?: string | null
    industry?: string | null
    newName?: string
  }
  if (!body.company) return new Response("Bad request", { status: 400 })

  const userId = session.user.id
  const { company } = body

  if ("newName" in body) {
    const newName = (body.newName ?? "").trim()
    if (!newName || newName === company) return Response.json({ ok: true })
    await prisma.contact.updateMany({ where: { userId, company }, data: { company: newName } })
    const oldPref = await prisma.companyPreference.findUnique({
      where: { userId_company: { userId, company } },
    })
    if (oldPref) {
      await prisma.companyPreference.delete({ where: { userId_company: { userId, company } } })
      await prisma.companyPreference.upsert({
        where: { userId_company: { userId, company: newName } },
        update: {},
        create: { userId, company: newName, ignored: oldPref.ignored, isPartner: oldPref.isPartner, size: oldPref.size, type: oldPref.type, parentCompany: oldPref.parentCompany },
      })
    }
    return Response.json({ ok: true })
  }

  const save = async () => {
    if ("status" in body) {
      if (body.status === "none") {
        await prisma.companyPreference.deleteMany({ where: { userId, company } })
      } else {
        await prisma.companyPreference.upsert({
          where: { userId_company: { userId, company } },
          create: { userId, company, ignored: body.status === "ignored" },
          update: { ignored: body.status === "ignored" },
        })
      }
    } else if ("size" in body) {
      await prisma.companyPreference.upsert({
        where: { userId_company: { userId, company } },
        create: { userId, company, size: body.size ?? null },
        update: { size: body.size ?? null },
      })
    } else if ("isPartner" in body) {
      await prisma.companyPreference.upsert({
        where: { userId_company: { userId, company } },
        create: { userId, company, isPartner: !!body.isPartner },
        update: { isPartner: !!body.isPartner },
      })
    } else if ("type" in body) {
      await prisma.companyPreference.upsert({
        where: { userId_company: { userId, company } },
        create: { userId, company, type: body.type ?? null },
        update: { type: body.type ?? null },
      })
    } else if ("parentCompany" in body) {
      const parent = body.parentCompany ? (body.parentCompany as string).trim() || null : null
      await prisma.companyPreference.upsert({
        where: { userId_company: { userId, company } },
        create: { userId, company, parentCompany: parent },
        update: { parentCompany: parent },
      })
    } else if ("industry" in body) {
      const ind = body.industry ? (body.industry as string).trim() || null : null
      await prisma.companyPreference.upsert({
        where: { userId_company: { userId, company } },
        create: { userId, company, industry: ind },
        update: { industry: ind },
      })
    }
  }

  try {
    await save()
  } catch {
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
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "ignored" BOOLEAN NOT NULL DEFAULT FALSE`
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "isPartner" BOOLEAN NOT NULL DEFAULT FALSE`
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "size" TEXT`
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "type" TEXT`
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "parentCompany" TEXT`
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "industry" TEXT`
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "website" TEXT`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "CompanyPreference_userId_idx" ON "CompanyPreference"("userId")`
      await save()
    } catch {
      return Response.json({ ok: false, error: "Could not save preference" }, { status: 503 })
    }
  }

  return Response.json({ ok: true })
}
