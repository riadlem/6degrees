import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { normalizeEmail } from "@/lib/gmail"
import { recomputeScoreForContact } from "@/lib/reconnect-score"

export const maxDuration = 300

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const { email, contactId } = body ?? {}
  if (!email || !contactId) return Response.json({ error: "Missing email or contactId" }, { status: 400 })

  const normalized = normalizeEmail(email)

  // Verify contact belongs to this user
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return Response.json({ error: "Contact not found" }, { status: 404 })

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

  // ── Propagate to other unmatched emails from senders with the same display name ──
  // e.g. "Bassem Tawfeeq" <bassem@gmail.com> manually linked → also auto-link
  // "Bassem Tawfeeq" <bassem@work.com> so it stops appearing in the unmatched panel.
  const propagatedEmails: string[] = []

  const fromNames = await prisma.emailMessage.findMany({
    where: { userId, fromEmail: normalized, isOutbound: false },
    select: { fromName: true },
    distinct: ["fromName"],
    take: 3,
  })

  for (const { fromName } of fromNames) {
    if (!fromName?.trim()) continue

    // Only propagate when the display name unambiguously matches the contact
    // (both first + last present in the name, case-insensitive)
    const firstLower = contact.firstName.toLowerCase()
    const lastLower = (contact.lastName ?? "").toLowerCase()
    const nameLower = fromName.toLowerCase()
    const nameMatches = lastLower
      ? nameLower.includes(firstLower) && nameLower.includes(lastLower)
      : nameLower.includes(firstLower)

    if (!nameMatches) continue

    // Find other unmatched inbound emails from senders with this exact display name
    const otherEmails = await prisma.emailMessage.findMany({
      where: {
        userId,
        contactId: null,
        isOutbound: false,
        fromName: { equals: fromName, mode: "insensitive" },
        NOT: { fromEmail: normalized },
      },
      select: { fromEmail: true },
      distinct: ["fromEmail"],
    })

    for (const { fromEmail: otherEmail } of otherEmails) {
      // Register the new email address on the contact
      await prisma.contactEmailAddress.upsert({
        where: { contactId_email: { contactId, email: otherEmail } },
        update: {},
        create: { contactId, email: otherEmail, source: "manual", isPrimary: false },
      })
      // Link all unmatched messages from that sender
      await prisma.emailMessage.updateMany({
        where: { userId, contactId: null, fromEmail: otherEmail },
        data: { contactId },
      })
      propagatedEmails.push(otherEmail)
    }
  }

  // Recompute the score for just this contact — don't block the response
  recomputeScoreForContact(contactId).catch((err) => console.error("recomputeScore failed:", err))

  // Return propagatedEmails so the UI can immediately remove them from the list
  return Response.json({ ok: true, propagatedEmails })
}
