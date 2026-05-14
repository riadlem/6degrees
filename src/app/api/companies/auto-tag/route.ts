import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { knownParentOf } from "@/lib/known-subsidiaries"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id

  // Get all distinct company names the user has contacts at
  const rows = await prisma.contact.groupBy({
    by: ["company"],
    where: { userId, company: { not: null } },
  })

  // Get existing preferences to avoid overwriting manually-set parents
  await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "parentCompany" TEXT`.catch(() => {})
  const existingPrefs = await prisma.companyPreference.findMany({
    where: { userId },
    select: { company: true, parentCompany: true },
  }).catch(() => [] as { company: string; parentCompany: string | null }[])
  const existingParentMap = new Map(existingPrefs.map((p) => [p.company, p.parentCompany]))

  let tagged = 0

  for (const row of rows) {
    const name = row.company!
    const parent = knownParentOf(name)
    if (!parent) continue
    // Don't overwrite a manually-set parent
    if (existingParentMap.get(name) !== undefined && existingParentMap.get(name) !== null) continue

    await prisma.companyPreference.upsert({
      where: { userId_company: { userId, company: name } },
      create: { userId, company: name, parentCompany: parent },
      update: { parentCompany: parent },
    }).catch(() => {})
    tagged++
  }

  return Response.json({ tagged })
}
