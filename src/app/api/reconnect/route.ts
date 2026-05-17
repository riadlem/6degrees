import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? ""
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "48"), 100)
  const page = Math.max(parseInt(searchParams.get("page") ?? "1"), 1)
  const skip = (page - 1) * limit

  const where = {
    userId,
    interactionScore: { gt: 0.1 },
    outreachStatus: status
      ? { equals: status }
      : { notIn: ["responded", "meeting_booked"] as string[] },
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        company: true,
        photoUrl: true,
        emailAddress: true,
        lastInteractionAt: true,
        interactionScore: true,
        outreachStatus: true,
        outreachUpdatedAt: true,
        labels: { select: { label: { select: { id: true, name: true, color: true } } } },
      },
      orderBy: { interactionScore: "desc" },
      take: limit,
      skip,
    }),
    prisma.contact.count({ where }),
  ])

  return Response.json({
    contacts,
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}
