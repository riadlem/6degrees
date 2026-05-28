import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const share = await prisma.eventShare.findFirst({
    where: { shareToken: params.token, shareEnabled: true },
  })
  if (!share) return new Response("Not found", { status: 404 })

  if (share.userId === session.user.id) {
    return Response.json({ error: "Cannot import your own list" }, { status: 400 })
  }

  const [ownerSpeakers, existing] = await Promise.all([
    prisma.eventSpeaker.findMany({
      where: { userId: share.userId, eventSlug: share.eventSlug },
      select: {
        eventSlug: true, eventName: true, speakerKey: true,
        firstName: true, lastName: true, role: true, company: true,
        description: true, sessionTopic: true,
        linkedinUrl: true, linkedinKey: true, photoUrl: true,
      },
    }),
    prisma.eventSpeaker.findMany({
      where: { userId: session.user.id, eventSlug: share.eventSlug },
      select: { speakerKey: true },
    }),
  ])

  const existingKeys = new Set(existing.map((e) => e.speakerKey))
  const toCreate = ownerSpeakers.filter((sp) => !existingKeys.has(sp.speakerKey))

  if (toCreate.length > 0) {
    await prisma.eventSpeaker.createMany({
      data: toCreate.map((sp) => ({
        userId: session.user.id,
        eventSlug: sp.eventSlug,
        eventName: sp.eventName,
        speakerKey: sp.speakerKey,
        firstName: sp.firstName,
        lastName: sp.lastName,
        role: sp.role ?? null,
        company: sp.company ?? null,
        description: sp.description ?? null,
        sessionTopic: sp.sessionTopic ?? null,
        linkedinUrl: sp.linkedinUrl ?? null,
        linkedinKey: sp.linkedinKey ?? null,
        photoUrl: sp.photoUrl ?? null,
        // priority and contactId intentionally omitted (null) — user sets their own
      })),
      skipDuplicates: true,
    })
  }

  return Response.json({
    ok: true,
    imported: toCreate.length,
    skipped: ownerSpeakers.length - toCreate.length,
  })
}
