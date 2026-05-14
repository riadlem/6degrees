import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id

  const [user, contacts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { extensionToken: true },
    }),
    prisma.contact.findMany({
      where: {
        userId,
        profileUrl: { not: null },
        OR: [
          { extensionSyncedAt: null },
          { photoUrl: null },
          { experience: null },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileUrl: true,
        company: true,
        position: true,
        photoUrl: true,
        experience: true,
        education: true,
        headline: true,
        location: true,
        extensionSyncedAt: true,
      },
      orderBy: [
        { extensionSyncedAt: "asc" },  // nulls first in Prisma
      ],
      take: 100,
    }),
  ])

  // Label each contact so Claude knows what's missing
  const queue = contacts.map((c) => ({
    id: c.id,
    name: `${c.firstName} ${c.lastName}`.trim(),
    profileUrl: c.profileUrl,
    company: c.company,
    position: c.position,
    lastEnriched: c.extensionSyncedAt,
    missing: [
      !c.photoUrl && "photo",
      !c.headline && "headline",
      !c.location && "location",
      !c.experience && "experience",
      !c.education && "education",
    ].filter(Boolean) as string[],
  }))

  return Response.json({
    token: user?.extensionToken ?? null,
    total: queue.length,
    contacts: queue,
  })
}
