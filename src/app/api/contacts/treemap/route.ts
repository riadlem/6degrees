import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const groups = await prisma.contact.groupBy({
    by: ["company"],
    where: { userId: session.user.id, company: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  })

  const companies = groups
    .filter((g) => g.company != null && g._count.id > 5)
    .map((g) => ({ name: g.company!, count: g._count.id }))

  return Response.json({ companies })
}
