import prisma from "@/lib/prisma"

function prioOrder(p: number | null): number {
  if (p === 4) return 99
  if (p === null) return 10
  return p
}

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const share = await prisma.eventShare.findFirst({
    where: { shareToken: params.token, shareEnabled: true },
    include: { user: { select: { name: true } } },
  })

  if (!share) return new Response("Not found", { status: 404 })

  const speakers = await prisma.eventSpeaker.findMany({
    where: { userId: share.userId, eventSlug: share.eventSlug },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      company: true,
      photoUrl: true,
      priority: true,
      sessionTopic: true,
      linkedinUrl: true,
      linkedinKey: true,
      eventName: true,
    },
  })

  const sorted = [...speakers].sort((a, b) => prioOrder(a.priority) - prioOrder(b.priority))
  const eventName = sorted[0]?.eventName ?? "Event"

  return Response.json({
    ownerName: share.user.name,
    eventName,
    eventSlug: share.eventSlug,
    speakers: sorted,
  })
}
