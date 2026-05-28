import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    speakerIds,
    eventSlug = "money2020-europe-2026",
    labels = ["Money20/20", "M2020 Speakers"],
  } = body as {
    speakerIds?: string[]
    eventSlug?: string
    labels?: string[]
  }

  const ids: string[] = speakerIds ?? []

  const speakers = await prisma.eventSpeaker.findMany({
    where:
      ids.length > 0
        ? { id: { in: ids }, userId: session.user.id }
        : { eventSlug, userId: session.user.id, contactId: null },
  })

  let added = 0

  for (const speaker of speakers) {
    if (speaker.contactId) continue

    let contactId: string | null = null

    if (speaker.linkedinKey) {
      const c = await prisma.contact.findFirst({
        where: {
          userId: session.user.id,
          OR: [
            { linkedinKey: speaker.linkedinKey },
            { profileUrl: { contains: `/in/${speaker.linkedinKey}`, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      })
      if (c) contactId = c.id
    }

    if (!contactId) {
      const c = await prisma.contact.findFirst({
        where: {
          userId: session.user.id,
          firstName: { equals: speaker.firstName, mode: "insensitive" },
          lastName: { equals: speaker.lastName, mode: "insensitive" },
          ...(speaker.company
            ? { company: { equals: speaker.company, mode: "insensitive" } }
            : {}),
        },
        select: { id: true },
      })
      if (c) contactId = c.id
    }

    if (!contactId) {
      const linkedinKey = speaker.linkedinKey || `m2020-${speaker.id}`
      try {
        const c = await prisma.contact.create({
          data: {
            userId: session.user.id,
            linkedinKey,
            firstName: speaker.firstName,
            lastName: speaker.lastName,
            position: speaker.role ?? null,
            company: speaker.company ?? null,
            headline: speaker.role ?? null,
            profileUrl: speaker.linkedinUrl ?? null,
            photoUrl: speaker.photoUrl ?? null,
          },
          select: { id: true },
        })
        contactId = c.id
      } catch {
        continue
      }
    }

    for (const name of labels) {
      if (!name?.trim()) continue
      try {
        const label = await prisma.label.upsert({
          where: { userId_name: { userId: session.user.id, name: name.trim() } },
          update: {},
          create: { userId: session.user.id, name: name.trim(), color: "purple" },
        })
        await prisma.contactLabel.upsert({
          where: { contactId_labelId: { contactId: contactId!, labelId: label.id } },
          update: {},
          create: { contactId: contactId!, labelId: label.id },
        })
      } catch { /* ignore */ }
    }

    await prisma.eventSpeaker.update({
      where: { id: speaker.id },
      data: { contactId },
    })

    added++
  }

  return Response.json({ ok: true, added })
}
