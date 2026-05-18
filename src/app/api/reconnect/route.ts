import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? ""
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "48"), 100)
  const page = Math.max(parseInt(searchParams.get("page") ?? "1"), 1)
  const skip = (page - 1) * limit

  // Prisma's `notIn` silently drops NULL rows in SQL, so we must use OR to explicitly include nulls.
  const EXCLUDE = ["responded", "meeting_booked", "lkd_pending"]
  const statusFilter: Prisma.ContactWhereInput = status === "not_contacted"
    ? { OR: [{ outreachStatus: null }, { outreachStatus: "not_contacted" }] }
    : status
    ? { outreachStatus: status }
    : { OR: [{ outreachStatus: null }, { outreachStatus: { notIn: EXCLUDE } }] }

  const where: Prisma.ContactWhereInput = {
    userId,
    interactionScore: { gt: 0.1 },
    ...statusFilter,
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
