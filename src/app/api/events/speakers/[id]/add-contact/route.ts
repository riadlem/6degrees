import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const speaker = await prisma.eventSpeaker.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!speaker) return new Response("Not found", { status: 404 })

  const body = await req.json().catch(() => ({}))
  const labelNames: string[] = body.labels ?? ["Money20/20", "M2020 Speakers"]

  let contactId = speaker.contactId

  if (!contactId) {
    // Try to find existing contact by LinkedIn key or name+company
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
      // Create a new contact from the speaker data
      const linkedinKey =
        speaker.linkedinKey || `m2020-${speaker.id}`
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
        return Response.json({ error: "Failed to create contact" }, { status: 500 })
      }
    }
  }

  // Apply labels
  for (const name of labelNames) {
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
    } catch { /* ignore duplicate */ }
  }

  // Link speaker to contact
  await prisma.eventSpeaker.update({
    where: { id: speaker.id },
    data: { contactId },
  })

  return Response.json({ ok: true, contactId })
}
