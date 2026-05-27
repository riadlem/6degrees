import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id

  const groups = await prisma.contact.groupBy({
    by: ["country"],
    where: { userId, country: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  })

  const countries = groups
    .filter((g) => g.country && g._count.id >= 1)
    .map((g) => ({
      name: g.country!,
      count: g._count.id,
    }))

  return Response.json({ countries })
}
