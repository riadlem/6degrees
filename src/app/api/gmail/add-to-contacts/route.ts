import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { recomputeScoreForContact } from "@/lib/reconnect-score"

function parseName(fromName: string | null, fromEmail: string): { firstName: string; lastName: string } {
  if (fromName?.trim()) {
    const parts = fromName.trim().split(/\s+/)
    if (parts.length >= 2) return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
    return { firstName: parts[0], lastName: "" }
  }
  return { firstName: fromEmail.split("@")[0], lastName: "" }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const { fromEmail, fromName } = body as { fromEmail?: string; fromName?: string | null }
  if (!fromEmail) return Response.json({ error: "fromEmail required" }, { status: 400 })

  const { firstName, lastName } = parseName(fromName ?? null, fromEmail)
  const linkedinKey = `gmail:${fromEmail}`

  // Upsert — if already created, just ensure lkd_pending status
  const existing = await prisma.contact.findUnique({
    where: { userId_linkedinKey: { userId, linkedinKey } },
    select: { id: true },
  })

  let contactId: string

  if (existing) {
    await prisma.contact.update({
      where: { id: existing.id },
      data: { outreachStatus: "lkd_pending", outreachUpdatedAt: new Date() },
    })
    contactId = existing.id
  } else {
    const contact = await prisma.contact.create({
      data: {
        userId,
        linkedinKey,
        firstName,
        lastName,
        emailAddress: fromEmail,
        outreachStatus: "lkd_pending",
        outreachUpdatedAt: new Date(),
      },
    })
    contactId = contact.id

    await prisma.contactEmailAddress.create({
      data: { contactId, email: fromEmail, source: "gmail_from", isPrimary: true },
    }).catch(() => {})
  }

  // Link all unmatched inbound messages from this sender to the new contact
  await prisma.emailMessage.updateMany({
    where: { userId, fromEmail, contactId: null },
    data: { contactId },
  })

  // Compute score immediately so the contact appears in Reconnect
  await recomputeScoreForContact(contactId)

  return Response.json({ contactId })
}
