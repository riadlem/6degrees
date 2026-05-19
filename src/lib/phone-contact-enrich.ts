import prisma from "@/lib/prisma"

export type EnrichResult = {
  enriched: number
  matched: number
  alreadyUpToDate: number
  phones: number
  emails: number
  photos: number
  linkedinUrls: number
}

type PhoneEntry = {
  fullName: string
  phone: string | null
  email: string | null
  photoData: string | null
  linkedinUrl?: string | null
}

/**
 * Normalise a name token for fuzzy matching:
 * - strip diacritics ("Élodie" → "elodie")
 * - treat hyphens as spaces ("Jean-Luc" → "jean luc")
 * - collapse whitespace and lowercase
 */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

export async function enrichContactsFromPhoneBook(
  userId: string,
  entries?: PhoneEntry[],
): Promise<EnrichResult> {
  const phoneContacts: PhoneEntry[] = entries ?? await prisma.phoneContact.findMany({
    where: { userId },
    select: { fullName: true, phone: true, email: true, photoData: true, linkedinUrl: true },
  })

  if (phoneContacts.length === 0) {
    return { enriched: 0, matched: 0, alreadyUpToDate: 0, phones: 0, emails: 0, photos: 0, linkedinUrls: 0 }
  }

  const allContacts = await prisma.contact.findMany({
    where: { userId },
    select: { id: true, firstName: true, lastName: true, emailAddress: true, phoneNumber: true, photoUrl: true, profileUrl: true },
  })

  const allLinkedEmails = await prisma.contactEmailAddress.findMany({
    where: { contact: { userId } },
    select: { contactId: true, email: true },
  })

  // ── Index: email → contactId ───────────────────────────────────────────────
  const emailIndex = new Map<string, string>()
  for (const c of allContacts) {
    if (c.emailAddress) emailIndex.set(c.emailAddress.toLowerCase(), c.id)
  }
  for (const e of allLinkedEmails) {
    emailIndex.set(e.email.toLowerCase(), e.contactId)
  }

  // ── Index: name key → contactId[] ─────────────────────────────────────────
  // Multiple strategies so one index lookup per strategy is O(1)

  // Strategy A  norm(firstName) + "|" + norm(lastName)
  const nameIdx = new Map<string, string[]>()
  // Strategy B  norm(lastName) + "|" + norm(firstName)  (reversed — family-name-first)
  const nameRevIdx = new Map<string, string[]>()
  // Strategy C  norm(firstName + " " + lastName)        (full-name exact)
  const fullIdx = new Map<string, string[]>()
  // Strategy D  norm(lastName + " " + firstName)        (full-name reversed)
  const fullRevIdx = new Map<string, string[]>()

  function pushIdx(map: Map<string, string[]>, key: string, id: string) {
    const arr = map.get(key) ?? []
    arr.push(id)
    map.set(key, arr)
  }

  for (const c of allContacts) {
    const fn = norm(c.firstName)
    const ln = norm(c.lastName)
    pushIdx(nameIdx,    `${fn}|${ln}`,   c.id)
    pushIdx(nameRevIdx, `${ln}|${fn}`,   c.id)
    pushIdx(fullIdx,    `${fn} ${ln}`,   c.id)
    pushIdx(fullRevIdx, `${ln} ${fn}`,   c.id)
  }

  const contactById = new Map(allContacts.map((c) => [c.id, c]))

  // ── Matching helpers ───────────────────────────────────────────────────────

  // Returns the single contactId when exactly one entry matches, else null
  function single(ids: string[] | undefined): string | null {
    return ids?.length === 1 ? ids[0] : null
  }

  function matchByName(fullName: string): string | null {
    const normalized = norm(fullName)
    const parts = normalized.split(" ").filter(Boolean)

    if (parts.length === 0) return null

    // Strategy C: full normalised name matches "firstName lastName"
    let id = single(fullIdx.get(normalized))
    if (id) return id

    // Strategy D: full normalised name matches "lastName firstName"
    id = single(fullRevIdx.get(normalized))
    if (id) return id

    if (parts.length < 2) return null

    const first = parts[0]
    const last  = parts[parts.length - 1]

    // Strategy A: first token | last token
    id = single(nameIdx.get(`${first}|${last}`))
    if (id) return id

    // Strategy B: reversed — last token | first token (family-name-first contacts)
    id = single(nameRevIdx.get(`${last}|${first}`))
    if (id) return id

    // Strategy E: first token | everything-after-first (handles "Pierre de Gaulle"
    //   where lastName="de Gaulle" and parts = ["pierre","de","gaulle"])
    if (parts.length >= 3) {
      const restAsLast = parts.slice(1).join(" ")
      id = single(nameIdx.get(`${first}|${restAsLast}`))
      if (id) return id

      // reversed variant: last-name-first multi-word ("de Gaulle Pierre")
      const restAsFirst = parts.slice(0, parts.length - 1).join(" ")
      id = single(nameRevIdx.get(`${last}|${restAsFirst}`))
      if (id) return id
    }

    return null
  }

  // ── Collect updates ────────────────────────────────────────────────────────
  const phoneUpdates:   { id: string; phone: string }[] = []
  const emailUpdates:   { id: string; email: string }[] = []
  const photoUpdates:   { id: string; photo: string }[] = []
  const linkedinUpdates: { id: string; url: string }[] = []
  const newEmailRows:   { contactId: string; email: string }[] = []
  const seen = new Set<string>()

  let matched = 0
  let alreadyUpToDate = 0

  for (const pc of phoneContacts) {
    let contactId: string | null = null

    // 1. Email match (most reliable)
    if (pc.email) contactId = emailIndex.get(pc.email.toLowerCase()) ?? null

    // 2. Multi-strategy name match
    if (!contactId) contactId = matchByName(pc.fullName)

    if (!contactId || seen.has(contactId)) continue
    seen.add(contactId)
    matched++

    const contact = contactById.get(contactId)
    if (!contact) continue

    let updated = false

    if (pc.phone && !contact.phoneNumber) {
      phoneUpdates.push({ id: contactId, phone: pc.phone })
      contact.phoneNumber = pc.phone
      updated = true
    }
    if (pc.email && !contact.emailAddress) {
      const e = pc.email.toLowerCase()
      emailUpdates.push({ id: contactId, email: e })
      newEmailRows.push({ contactId, email: e })
      contact.emailAddress = e
      emailIndex.set(e, contactId)
      updated = true
    }
    // Prefer a local data-URI over a remote URL: LinkedIn CDN URLs expire,
    // phone-book data-URIs never do. Overwrite remote URLs with local photos.
    const existingPhotoIsRemote = !!contact.photoUrl && !contact.photoUrl.startsWith("data:")
    if (pc.photoData && (!contact.photoUrl || existingPhotoIsRemote)) {
      photoUpdates.push({ id: contactId, photo: pc.photoData })
      contact.photoUrl = pc.photoData
      updated = true
    }
    if (pc.linkedinUrl && !contact.profileUrl) {
      linkedinUpdates.push({ id: contactId, url: pc.linkedinUrl })
      contact.profileUrl = pc.linkedinUrl
      updated = true
    }

    if (!updated) alreadyUpToDate++
  }

  // ── Apply in batches of 50 ─────────────────────────────────────────────────
  const applyBatch = async <T>(items: T[], fn: (item: T) => Promise<unknown>) => {
    for (let i = 0; i < items.length; i += 50) {
      await Promise.all(items.slice(i, i + 50).map(fn))
    }
  }

  await applyBatch(phoneUpdates,    (u) => prisma.contact.update({ where: { id: u.id }, data: { phoneNumber: u.phone } }))
  await applyBatch(emailUpdates,    (u) => prisma.contact.update({ where: { id: u.id }, data: { emailAddress: u.email } }))
  await applyBatch(photoUpdates,    (u) => prisma.contact.update({ where: { id: u.id }, data: { photoUrl: u.photo } }))
  await applyBatch(linkedinUpdates, (u) => prisma.contact.update({ where: { id: u.id }, data: { profileUrl: u.url } }))
  await applyBatch(newEmailRows,    (u) =>
    prisma.contactEmailAddress.upsert({
      where:  { contactId_email: { contactId: u.contactId, email: u.email } },
      update: {},
      create: { contactId: u.contactId, email: u.email, source: "address_book", isPrimary: false },
    })
  )

  const enriched = new Set([
    ...phoneUpdates.map((u) => u.id),
    ...emailUpdates.map((u) => u.id),
    ...photoUpdates.map((u) => u.id),
    ...linkedinUpdates.map((u) => u.id),
  ]).size

  return { enriched, matched, alreadyUpToDate, phones: phoneUpdates.length, emails: emailUpdates.length, photos: photoUpdates.length, linkedinUrls: linkedinUpdates.length }
}
