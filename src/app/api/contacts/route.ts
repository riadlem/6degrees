import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q") ?? ""
  const company = searchParams.get("company") ?? ""
  const industry = searchParams.get("industry") ?? ""
  const location = searchParams.get("location") ?? ""
  const position = searchParams.get("position") ?? ""
  const labelId = searchParams.get("label") ?? ""
  const sort = searchParams.get("sort") ?? "name"
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const limit = parseInt(searchParams.get("limit") ?? "48", 10)

  const where: Prisma.ContactWhereInput = {
    userId: session.user.id,
    ...(q && {
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { position: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(company && { company: { contains: company, mode: "insensitive" } }),
    ...(industry && { industry: { contains: industry, mode: "insensitive" } }),
    ...(location && { location: { contains: location, mode: "insensitive" } }),
    ...(position && { position: { contains: position, mode: "insensitive" } }),
    ...(labelId && { labels: { some: { labelId } } }),
  }

  const orderBy: Prisma.ContactOrderByWithRelationInput =
    sort === "company"
      ? { company: "asc" }
      : sort === "connected"
      ? { connectedOn: "desc" }
      : sort === "recent"
      ? { syncedAt: "desc" }
      : { firstName: "asc" }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        notes: { orderBy: { createdAt: "desc" }, take: 1 },
        listMembers: { select: { listId: true } },
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
      },
    }),
    prisma.contact.count({ where }),
  ])

  const [industries, companies, locations, labels] = await Promise.all([
    prisma.contact.findMany({
      where: { userId: session.user.id, industry: { not: null } },
      select: { industry: true },
      distinct: ["industry"],
      orderBy: { industry: "asc" },
    }),
    prisma.contact.findMany({
      where: { userId: session.user.id, company: { not: null } },
      select: { company: true },
      distinct: ["company"],
      orderBy: { company: "asc" },
    }),
    prisma.contact.findMany({
      where: { userId: session.user.id, location: { not: null } },
      select: { location: true },
      distinct: ["location"],
      orderBy: { location: "asc" },
    }),
    prisma.label.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
    }),
  ])

  return Response.json({
    contacts,
    total,
    page,
    pages: Math.ceil(total / limit),
    filters: {
      industries: industries.map((r) => r.industry).filter(Boolean),
      companies: companies.map((r) => r.company).filter(Boolean),
      locations: locations.map((r) => r.location).filter(Boolean),
      labels,
    },
  })
}
