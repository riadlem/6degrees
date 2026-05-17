import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const { contactId, subject, body: draftBody } = body as {
    contactId?: string
    subject?: string
    body?: string
  }

  if (!contactId || !draftBody) {
    return Response.json({ error: "contactId and body required" }, { status: 400 })
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId },
    select: { id: true },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const draft = await prisma.outreachDraft.create({
    data: { contactId, userId, subject: subject ?? null, body: draftBody },
  })

  // Advance status to "drafted" if not already further along
  await prisma.contact.updateMany({
    where: {
      id: contactId,
      OR: [{ outreachStatus: { in: ["not_contacted"] } }, { outreachStatus: null }],
    },
    data: { outreachStatus: "drafted", outreachUpdatedAt: new Date() },
  })

  return Response.json(draft, { status: 201 })
}
