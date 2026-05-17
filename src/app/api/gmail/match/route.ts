import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { normalizeEmail } from "@/lib/gmail"
import { recomputeScores } from "@/lib/reconnect-score"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const { email, contactId } = body ?? {}
  if (!email || !contactId) return new Response("Missing email or contactId", { status: 400 })

  const normalized = normalizeEmail(email)

  // Verify contact belongs to this user
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return new Response("Contact not found", { status: 404 })

  // Register email address on the contact
  await prisma.contactEmailAddress.upsert({
    where: { contactId_email: { contactId, email: normalized } },
    update: {},
    create: { contactId, email: normalized, source: "manual", isPrimary: false },
  })

  // Update all unmatched inbound messages from this email
  await prisma.emailMessage.updateMany({
    where: { userId, contactId: null, fromEmail: normalized },
    data: { contactId },
  })

  // Update all unmatched outbound messages sent to this email
  await prisma.emailMessage.updateMany({
    where: { userId, contactId: null, isOutbound: true, toEmails: { has: normalized } },
    data: { contactId },
  })

  await recomputeScores(userId)

  return Response.json({ ok: true })
}
