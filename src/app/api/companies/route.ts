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
      select: { company: true, ignored: true, isPartner: true, size: true, type: true },
    }).catch(() => [] as { company: string; ignored: boolean; isPartner: boolean; size: string | null; type: string | null }[]),
  ])

  const prefMap = new Map(prefs.map((p) => [p.company, p]))

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
    .map((r) => {
      const pref = prefMap.get(r.company as string)
      return {
        name:      r.company as string,
        count:     r._count.id,
        preferred: pref ? !pref.ignored : false,
        ignored:   pref?.ignored ?? false,
        isPartner: pref?.isPartner ?? false,
        size:      pref?.size ?? null,
        type:      pref?.type ?? null,
        industry:  industryByCompany.get(r.company as string) ?? null,
        photos:    photosByCompany.get(r.company as string) ?? [],
      }
    })

  // partner+preferred → preferred → partner-only → neutral → ignored
  companies.sort((a, b) => {
    if (a.ignored !== b.ignored) return a.ignored ? 1 : -1
    const aScore = (a.isPartner ? 2 : 0) + (a.preferred ? 1 : 0)
    const bScore = (b.isPartner ? 2 : 0) + (b.preferred ? 1 : 0)
    if (aScore !== bScore) return bScore - aScore
    return b.count - a.count
  })

  return Response.json({ companies })
}

// POST body: one of:
//   { company, status: "preferred" | "ignored" | "none" }
//   { company, size: "small" | "medium" | "corporate" | "fortune500" | null }
//   { company, isPartner: boolean }
//   { company, type: "brand" | "non-brand" | "independent" | null }
//   { company, newName: string }  ← rename/merge: moves all contacts + migrates preference
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json() as {
    company?: string
    status?: string
    size?: string | null
    isPartner?: boolean
    type?: string | null
    newName?: string
  }
  if (!body.company) return new Response("Bad request", { status: 400 })

  const userId = session.user.id
  const { company } = body

  // Rename/merge: bulk-move contacts + migrate preference row, then return early
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
        create: { userId, company: newName, ignored: oldPref.ignored, isPartner: oldPref.isPartner, size: oldPref.size, type: oldPref.type },
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
    }
  }

  try {
    await save()
  } catch {
    // Table or columns missing — self-heal then retry.
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
        ALTER TABLE "CompanyPreference"
        ADD COLUMN IF NOT EXISTS "isPartner" BOOLEAN NOT NULL DEFAULT FALSE
      `
      await prisma.$executeRaw`
        ALTER TABLE "CompanyPreference"
        ADD COLUMN IF NOT EXISTS "size" TEXT
      `
      await prisma.$executeRaw`
        ALTER TABLE "CompanyPreference"
        ADD COLUMN IF NOT EXISTS "type" TEXT
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
