import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const VALID_STATUSES = ["not_contacted", "drafted", "sent", "responded", "meeting_booked", "lkd_pending"]

export async function PATCH(req: Request, { params }: { params: { contactId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { status } = body as { status?: string | null }

  // Allow null to clear status (invitation sent → back to regular pool)
  if (status !== null && status !== undefined && !VALID_STATUSES.includes(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 })
  }

  const contact = await prisma.contact.findFirst({
    where: { id: params.contactId, userId: session.user.id },
    select: { id: true },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const updated = await prisma.contact.update({
    where: { id: params.contactId },
    data: { outreachStatus: status ?? null, outreachUpdatedAt: new Date() },
    select: { id: true, outreachStatus: true, outreachUpdatedAt: true },
  })

  return Response.json(updated)
}
