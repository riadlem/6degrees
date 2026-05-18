import prisma from "@/lib/prisma"
import { normalizeEmail } from "@/lib/gmail"

// ---------------------------------------------------------------------------
// Cache-based matching — eliminates per-message DB round trips during sync
// ---------------------------------------------------------------------------

export type MatchCache = {
  emailToContact: Map<string, string>      // normalized email → contactId
  nameToContacts: Map<string, string[]>    // "first|last" → contactId[]
  patternToContacts: Map<string, string[]> // email username pattern → contactId[]
  contactDomains: Map<string, Set<string>> // contactId → known email domains (from confirmed addresses)
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
  const contactDomains = new Map<string, Set<string>>()
  for (const { email, contactId } of emailRows) {
    const normalized = normalizeEmail(email)
    emailToContact.set(normalized, contactId)
    // Track which domains are confirmed for each contact
    const domain = normalized.split("@")[1]
    if (domain) {
      const set = contactDomains.get(contactId) ?? new Set<string>()
      set.add(domain)
      contactDomains.set(contactId, set)
    }
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

  return { emailToContact, nameToContacts, patternToContacts, contactDomains, pendingUpserts: [] }
}

// Returns true if the incoming email's domain is consistent with what we already
// know about this contact. If the contact has no prior emails we allow anything
// (cold-start). If they do, the domain must match to avoid cross-person collisions.
function domainAllowed(cache: MatchCache, contactId: string, incomingEmail: string): boolean {
  const knownDomains = cache.contactDomains.get(contactId)
  if (!knownDomains || knownDomains.size === 0) return true
  const incomingDomain = incomingEmail.split("@")[1]?.toLowerCase()
  return !!incomingDomain && knownDomains.has(incomingDomain)
}

export function matchEmailCached(
  cache: MatchCache,
  fromEmail: string,
  fromName: string | null,
  toEmails: string[],
  isOutbound: boolean,
): string | null {
  // For outbound multi-recipient emails, fuzzy matching is unreliable — we can't
  // know which recipient is the "primary" contact. Only use exact matches.
  const multiRecipient = isOutbound && toEmails.length > 1
  const candidates = isOutbound ? toEmails.map(normalizeEmail) : [normalizeEmail(fromEmail)]

  for (const email of candidates) {
    // Pass 1: exact known address — always safe
    const contactId = cache.emailToContact.get(email)
    if (contactId) return contactId

    if (multiRecipient) continue // skip fuzzy passes for multi-recipient outbound

    // Pass 2: display name match (inbound only — sender name is in From header)
    // Domain guard: only auto-match if the domain is consistent with what we already
    // know about this contact, to prevent cross-person collisions.
    if (fromName && !isOutbound) {
      const parts = fromName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const key = `${parts[0].toLowerCase()}|${parts[parts.length - 1].toLowerCase()}`
        const matches = cache.nameToContacts.get(key)
        if (matches?.length === 1 && domainAllowed(cache, matches[0], email)) {
          cache.emailToContact.set(email, matches[0])
          cache.pendingUpserts.push({ contactId: matches[0], email, source: "gmail_from" })
          // Track the new domain so future fuzzy passes stay consistent
          const domain = email.split("@")[1]?.toLowerCase()
          if (domain) {
            const set = cache.contactDomains.get(matches[0]) ?? new Set<string>()
            set.add(domain)
            cache.contactDomains.set(matches[0], set)
          }
          return matches[0]
        }
      }
    }

    // Pass 3: email username pattern (handles flast, first.last, firstlast, etc.)
    // Domain guard: same — require domain consistency to avoid matching two people
    // named "Kamel Najimi" at different companies.
    const username = email.split("@")[0].toLowerCase()
    const patternMatches = cache.patternToContacts.get(username)
    if (patternMatches?.length === 1 && domainAllowed(cache, patternMatches[0], email)) {
      const source = isOutbound ? "gmail_to" : "gmail_from"
      cache.emailToContact.set(email, patternMatches[0])
      cache.pendingUpserts.push({ contactId: patternMatches[0], email, source })
      const domain = email.split("@")[1]?.toLowerCase()
      if (domain) {
        const set = cache.contactDomains.get(patternMatches[0]) ?? new Set<string>()
        set.add(domain)
        cache.contactDomains.set(patternMatches[0], set)
      }
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
