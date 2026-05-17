import prisma from "@/lib/prisma"
import { normalizeEmail } from "@/lib/gmail"

export async function matchEmailToContact(
  userId: string,
  fromEmail: string,
  fromName: string | null,
  toEmails: string[],
  isOutbound: boolean,
): Promise<string | null> {
  // For outbound emails, the relevant contact is in toEmails
  // For inbound emails, the relevant contact is fromEmail
  const candidateEmails = isOutbound
    ? toEmails.map(normalizeEmail)
    : [normalizeEmail(fromEmail)]

  for (const email of candidateEmails) {
    // Pass 1: exact match against known email addresses
    const existing = await prisma.contactEmailAddress.findFirst({
      where: { email, contact: { userId } },
      select: { contactId: true },
    })
    if (existing) return existing.contactId

    // Pass 2: name-based fuzzy fallback
    if (fromName && !isOutbound) {
      const parts = fromName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const firstName = parts[0].toLowerCase()
        const lastName = parts[parts.length - 1].toLowerCase()
        const matches = await prisma.contact.findMany({
          where: {
            userId,
            firstName: { equals: firstName, mode: "insensitive" },
            lastName: { equals: lastName, mode: "insensitive" },
          },
          select: { id: true },
          take: 3,
        })
        if (matches.length === 1) {
          // Record this email for future fast lookup
          await prisma.contactEmailAddress.upsert({
            where: { contactId_email: { contactId: matches[0].id, email } },
            update: {},
            create: { contactId: matches[0].id, email, source: "gmail_from", isPrimary: true },
          })
          await prisma.contact.updateMany({
            where: { id: matches[0].id, emailAddress: null },
            data: { emailAddress: email },
          })
          return matches[0].id
        }
      }
    }
  }

  return null
}

export async function recordMatchedEmail(
  contactId: string,
  email: string,
  source: "gmail_from" | "gmail_to",
): Promise<void> {
  await prisma.contactEmailAddress.upsert({
    where: { contactId_email: { contactId, email } },
    update: {},
    create: { contactId, email, source },
  })
  // Promote to primary email on contact if none set
  await prisma.contact.updateMany({
    where: { id: contactId, emailAddress: null },
    data: { emailAddress: email },
  })
}
