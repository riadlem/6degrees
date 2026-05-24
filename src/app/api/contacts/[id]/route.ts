import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { enrichContact } from "@/lib/cowork"

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const [contact, waAgg] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: {
        notes: { orderBy: { createdAt: "desc" } },
        listMembers: { include: { list: { select: { id: true, name: true } } } },
        labels: { include: { label: { select: { id: true, name: true, color: true } } } },
        emailAddresses: { select: { email: true, isPrimary: true }, orderBy: { isPrimary: "desc" } },
      },
    }),
    prisma.whatsAppMessage.aggregate({
      where: { contactId: params.id },
      _max: { sentAt: true },
      _count: { _all: true },
    }).catch(() => null),
  ])

  if (!contact) return new Response("Not found", { status: 404 })
  return Response.json({
    ...contact,
    whatsappLastAt: waAgg?._max.sentAt?.toISOString() ?? null,
    whatsappMessageCount: waAgg?._count._all ?? 0,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await request.json()
  const allowed = ["firstName", "lastName", "location", "industry", "headline", "profileUrl", "company"]
  const data: Record<string, string> = {}
  for (const key of allowed) {
    if (key in body) data[key] = body[key]
  }

  const contact = await prisma.contact.updateMany({
    where: { id: params.id, userId: session.user.id },
    data,
  })

  if (contact.count === 0) return new Response("Not found", { status: 404 })
  return Response.json({ ok: true })
}

// Trigger Cowork enrichment for a single contact
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const enriched = await enrichContact(
    contact.linkedinKey,
    contact.firstName,
    contact.lastName,
    contact.company
  )

  const updated = await prisma.contact.update({
    where: { id: params.id },
    data: {
      photoUrl: enriched.photoUrl ?? contact.photoUrl,
      commonConnections: enriched.commonConnections ?? contact.commonConnections,
      location: enriched.location ?? contact.location,
      industry: enriched.industry ?? contact.industry,
      headline: enriched.headline ?? contact.headline,
      profileUrl: enriched.profileUrl ?? contact.profileUrl,
      coworkEnrichedAt: new Date(),
    },
  })

  return Response.json(updated)
}
