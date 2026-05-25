import prisma from "@/lib/prisma"

/**
 * Normalise a phone number to digits-only with a leading '+' preserved.
 * "+33 6 12 34 56 78" → "+33612345678"
 * "06 12 34 56 78"    → "0612345678"
 * Strips spaces, dashes, dots, parentheses.
 */
function normalizePhone(phone: string): string {
  const trimmed = phone.trim()
  const sign = trimmed.startsWith("+") ? "+" : ""
  const digits = trimmed.replace(/\D/g, "")
  return sign + digits
}

export async function matchChatNameToContact(
  userId: string,
  chatName: string,
): Promise<string | null> {
  // Step 1: direct name split match against Contact
  const directId = await directNameMatch(userId, chatName)
  if (directId) return directId

  // Step 2: look up chatName in address book (PhoneContact)
  let phoneContact: { fullName: string; email: string | null; phone: string | null } | null = null
  try {
    phoneContact = await prisma.phoneContact.findFirst({
      where: { userId, fullName: { equals: chatName, mode: "insensitive" } },
      select: { fullName: true, email: true, phone: true },
    })
  } catch { /* PhoneContact table may not exist yet */ }

  if (!phoneContact) return null

  // Step 3: email match — strongest signal
  if (phoneContact.email) {
    const normalEmail = phoneContact.email.toLowerCase().trim()

    const emailAddr = await prisma.contactEmailAddress.findFirst({
      where: { contact: { userId }, email: normalEmail },
      select: { contactId: true },
    })
    if (emailAddr) return emailAddr.contactId

    const direct = await prisma.contact.findFirst({
      where: { userId, emailAddress: normalEmail },
      select: { id: true },
    })
    if (direct) return direct.id
  }

  // Step 3b: phone match — compare normalized phone numbers.
  // Handles "06 12 34 56 78" vs "+33612345678" etc.
  if (phoneContact.phone) {
    const normPhone = normalizePhone(phoneContact.phone)
    if (normPhone.length >= 6) {
      // Fetch contacts that have a phoneNumber and normalise each one for comparison.
      // We can't do this in SQL easily so we fetch candidates by prefix heuristic
      // (last 9 digits are internationally stable) and compare in JS.
      const suffix = normPhone.slice(-9) // e.g. "612345678"
      const candidates = await prisma.$queryRaw<{ id: string; phoneNumber: string | null }[]>`
        SELECT id, "phoneNumber"
        FROM "Contact"
        WHERE "userId" = ${userId}
          AND "phoneNumber" IS NOT NULL
          AND "phoneNumber" != ''
          AND replace(replace(replace("phoneNumber", ' ', ''), '-', ''), '.', '') LIKE ${"%" + suffix}
      `
      for (const c of candidates) {
        if (c.phoneNumber && normalizePhone(c.phoneNumber).endsWith(suffix)) {
          return c.id
        }
      }
    }
  }

  // Step 4: retry name match using canonical full name from address book
  if (phoneContact.fullName.toLowerCase() !== chatName.toLowerCase()) {
    const canonicalId = await directNameMatch(userId, phoneContact.fullName)
    if (canonicalId) return canonicalId
  }

  return null
}

async function directNameMatch(userId: string, name: string): Promise<string | null> {
  // Strip common noise suffixes that appear in phone address books but are not
  // part of the person's actual name, e.g.:
  //   "Romain (Nuvei)"  → "Romain"
  //   "Romain - Nuvei"  → "Romain"
  //   "Romain | Nuvei"  → "Romain"
  //   "Alice 🏢"        → "Alice"
  const cleaned = name
    .trim()
    .replace(/[\(\[\{].*?[\)\]\}]/g, "")   // remove anything in brackets
    .replace(/\s*[-–—|\/]\s*[A-Z].*/g, "") // strip " - Company" suffixes (capital-letter word after dash/pipe/slash)
    .replace(/\s+[\p{Emoji_Presentation}\p{Extended_Pictographic}].*/gu, "") // strip trailing emoji
    .trim()

  const parts = cleaned.split(/\s+/).filter(Boolean)

  // Two-or-more word name: match firstName + lastName exactly
  if (parts.length >= 2) {
    const firstName = parts[0]
    const lastName  = parts[parts.length - 1]

    const matches = await prisma.contact.findMany({
      where: {
        userId,
        firstName: { equals: firstName, mode: "insensitive" },
        lastName:  { equals: lastName,  mode: "insensitive" },
      },
      select: { id: true },
      take: 2,
    })
    if (matches.length === 1) return matches[0].id
  }

  // Single-word name (e.g. "Romain" or a nickname): try first-name-only match.
  // Only accept if exactly ONE contact has that first name — avoids false positives
  // for common names like "David" or "Sarah".
  if (parts.length === 1) {
    const firstName = parts[0]
    const matches = await prisma.contact.findMany({
      where: { userId, firstName: { equals: firstName, mode: "insensitive" } },
      select: { id: true },
      take: 2,
    })
    if (matches.length === 1) return matches[0].id
  }

  return null
}

export async function enrichContactFromPhoneBook(
  userId: string,
  contactId: string,
  chatName: string,
): Promise<void> {
  let phoneContact: { photoData: string | null } | null = null
  try {
    phoneContact = await prisma.phoneContact.findFirst({
      where: { userId, fullName: { equals: chatName, mode: "insensitive" } },
      select: { photoData: true },
    })
  } catch { return }

  if (!phoneContact?.photoData) return

  // Only set photo if contact doesn't already have one
  await prisma.contact.updateMany({
    where: { id: contactId, photoUrl: null },
    data: { photoUrl: phoneContact.photoData },
  })
}
