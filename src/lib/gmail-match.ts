import prisma from "@/lib/prisma"
import { normalizeEmail } from "@/lib/gmail"

// ---------------------------------------------------------------------------
// Cache-based matching — eliminates per-message DB round trips during sync
// ---------------------------------------------------------------------------

export type MatchCache = {
  emailToContact: Map<string, string>    // normalized email → contactId
  nameToContacts: Map<string, string[]>  // "first|last" → contactId[]
  patternToContacts: Map<string, string[]> // email username pattern → contactId[]
  pendingUpserts: Array<{ contactId: string; email: string; source: "gmail_from" | "gmail_to" }>
}

function usernamePatterns(firstName: string, lastName: string): string[] {
  const f = firstName.toLowerCase().replace(/[^a-z0-9]/g, "")
  const l = lastName.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!f || !l || f.length < 2 || l.length < 2) return []
  return [
    f[0] + l,           // flast  (rnajimi)
    f + "." + l,        // first.last
    f + "_" + l,        // first_last
    f + l,              // firstlast
    f[0] + "." + l,    // f.last
    l + "." + f[0],    // last.f
    l + f[0],           // lastf
    l + "." + f,        // last.first
    l + "_" + f,        // last_first
    l + f,              // lastfirst
  ]
}

export async function buildMatchCache(userId: string): Promise<MatchCache> {
  const [emailRows, contactRows] = await Promise.all([
    prisma.contactEmailAddress.findMany({
      where: { contact: { userId } },
      select: { email: true, contactId: true },
    }),
    prisma.contact.findMany({
      where: { userId },
      select: { id: true, firstName: true, lastName: true },
    }),
  ])

  const emailToContact = new Map<string, string>()
  for (const { email, contactId } of emailRows) {
    emailToContact.set(normalizeEmail(email), contactId)
  }

  const nameToContacts = new Map<string, string[]>()
  const patternToContacts = new Map<string, string[]>()
  for (const { id, firstName, lastName } of contactRows) {
    const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`
    const nameArr = nameToContacts.get(nameKey) ?? []
    nameArr.push(id)
    nameToContacts.set(nameKey, nameArr)

    for (const pattern of usernamePatterns(firstName, lastName)) {
      const arr = patternToContacts.get(pattern) ?? []
      arr.push(id)
      patternToContacts.set(pattern, arr)
    }
  }

  return { emailToContact, nameToContacts, patternToContacts, pendingUpserts: [] }
}

export function matchEmailCached(
  cache: MatchCache,
  fromEmail: string,
  fromName: string | null,
  toEmails: string[],
  isOutbound: boolean,
): string | null {
  const candidates = isOutbound ? toEmails.map(normalizeEmail) : [normalizeEmail(fromEmail)]

  for (const email of candidates) {
    // Pass 1: exact known address
    const contactId = cache.emailToContact.get(email)
    if (contactId) return contactId

    // Pass 2: display name match (inbound only — sender name is in From header)
    if (fromName && !isOutbound) {
      const parts = fromName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const key = `${parts[0].toLowerCase()}|${parts[parts.length - 1].toLowerCase()}`
        const matches = cache.nameToContacts.get(key)
        if (matches?.length === 1) {
          cache.emailToContact.set(email, matches[0])
          cache.pendingUpserts.push({ contactId: matches[0], email, source: "gmail_from" })
          return matches[0]
        }
      }
    }

    // Pass 3: email username pattern (handles flast, first.last, firstlast, etc.)
    const username = email.split("@")[0].toLowerCase()
    const patternMatches = cache.patternToContacts.get(username)
    if (patternMatches?.length === 1) {
      const source = isOutbound ? "gmail_to" : "gmail_from"
      cache.emailToContact.set(email, patternMatches[0])
      cache.pendingUpserts.push({ contactId: patternMatches[0], email, source })
      return patternMatches[0]
    }
  }
  return null
}

export function recordMatchedEmailCached(
  cache: MatchCache,
  contactId: string,
  email: string,
  source: "gmail_from" | "gmail_to",
): void {
  const normalized = normalizeEmail(email)
  if (!cache.emailToContact.has(normalized)) {
    cache.emailToContact.set(normalized, contactId)
    cache.pendingUpserts.push({ contactId, email: normalized, source })
  }
}

export async function flushMatchCache(cache: MatchCache): Promise<void> {
  if (cache.pendingUpserts.length === 0) return
  const upserts = cache.pendingUpserts.splice(0)

  await Promise.all(
    upserts.map(({ contactId, email, source }) =>
      prisma.contactEmailAddress.upsert({
        where: { contactId_email: { contactId, email } },
        update: {},
        create: { contactId, email, source },
      }),
    ),
  )

  // Set primary email on contacts that don't have one yet
  const byContact = new Map<string, string>()
  for (const { contactId, email } of upserts) {
    if (!byContact.has(contactId)) byContact.set(contactId, email)
  }
  await Promise.all(
    Array.from(byContact.entries()).map(([contactId, email]) =>
      prisma.contact.updateMany({
        where: { id: contactId, emailAddress: null },
        data: { emailAddress: email },
      }),
    ),
  )
}

// ---------------------------------------------------------------------------
// Legacy per-message matching (used by /api/gmail/match manual route)
// ---------------------------------------------------------------------------

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
