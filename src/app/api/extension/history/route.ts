import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const PAGE_SIZE = 50

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const url = new URL(req.url)
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10))

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where: {
        userId,
        extensionSyncedAt: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        position: true,
        city: true,
        country: true,
        location: true,
        photoUrl: true,
        profileUrl: true,
        extensionSyncedAt: true,
      },
      orderBy: { extensionSyncedAt: "desc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contact.count({
      where: { userId, extensionSyncedAt: { not: null } },
    }),
  ])

  return Response.json({ contacts, total, page, pageSize: PAGE_SIZE })
}
