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
      select: { company: true, isPartner: true, ignored: true, type: true },
    }).catch(() => [] as { company: string; isPartner: boolean; ignored: boolean; type: string | null }[]),
  ])

  const prefMap = new Map(prefs.map((p) => [p.company, p]))

  const companies = groups
    .filter((g) => g.company != null && g._count.id >= min)
    .map((g) => {
      const pref = prefMap.get(g.company!)
      return {
        name:      g.company!,
        count:     g._count.id,
        isPartner: pref?.isPartner ?? false,
        ignored:   pref?.ignored  ?? false,
        type:      pref?.type     ?? null,
      }
    })
    .filter((c) => !c.ignored)

  return Response.json({ companies })
}
