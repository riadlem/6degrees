import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id
  const min = Math.max(1, parseInt(new URL(req.url).searchParams.get("min") ?? "1", 10))

  const [groups, prefs] = await Promise.all([
    prisma.contact.groupBy({
      by: ["company"],
      where: { userId, company: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.companyPreference.findMany({
      where: { userId },
      select: { company: true, isPartner: true, ignored: true, type: true, parentCompany: true },
    }).catch(async () => {
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "type" TEXT`.catch(() => {})
      await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "parentCompany" TEXT`.catch(() => {})
      return prisma.companyPreference.findMany({
        where: { userId },
        select: { company: true, isPartner: true, ignored: true, type: true, parentCompany: true },
      }).catch(() => [] as { company: string; isPartner: boolean; ignored: boolean; type: string | null; parentCompany: string | null }[])
    }),
  ])

  const prefMap = new Map(prefs.map((p) => [p.company, p]))
  const countMap = new Map(groups.map((g) => [g.company!, g._count.id]))

  // Build parent → subsidiaries map and set of all subsidiary names
  const subsidiariesByParent = new Map<string, string[]>()
  const subsidiaryNames = new Set<string>()
  for (const pref of prefs) {
    if (!pref.parentCompany) continue
    subsidiaryNames.add(pref.company)
    const arr = subsidiariesByParent.get(pref.parentCompany) ?? []
    arr.push(pref.company)
    subsidiariesByParent.set(pref.parentCompany, arr)
  }

  const companies: {
    name: string; count: number; isPartner: boolean; type: string | null; subsidiaries: string[]
  }[] = []

  for (const g of groups) {
    const name = g.company!
    // Subsidiaries are folded into their parent — skip them as standalone tiles
    if (subsidiaryNames.has(name)) continue

    const pref = prefMap.get(name)
    if (pref?.ignored) continue

    const subs = subsidiariesByParent.get(name) ?? []
    const totalCount = g._count.id + subs.reduce((acc, sub) => acc + (countMap.get(sub) ?? 0), 0)
    if (totalCount < min) continue

    companies.push({
      name,
      count: totalCount,
      isPartner: pref?.isPartner ?? false,
      type: pref?.type ?? null,
      subsidiaries: subs,
    })
  }

  return Response.json({ companies }, { headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=600" } })
}
