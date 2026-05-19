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

// Strip diacritics then lowercase — "Élodie" → "elodie", "Jean-Luc" → "jean-luc"
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

export async function enrichContactsFromPhoneBook(
  userId: string,
  entries?: PhoneEntry[],  // pass in-memory entries from VCF parse, or omit to load from DB
): Promise<EnrichResult> {
  // Load address book entries if not supplied
  const phoneContacts: PhoneEntry[] = entries ?? await prisma.phoneContact.findMany({
    where: { userId },
    select: { fullName: true, phone: true, email: true, photoData: true, linkedinUrl: true },
  })

  if (phoneContacts.length === 0) {
    return { enriched: 0, matched: 0, alreadyUpToDate: 0, phones: 0, emails: 0, photos: 0, linkedinUrls: 0 }
  }

  // Bulk-load all contacts (no photos — just meta needed for matching + null checks)
  const allContacts = await prisma.contact.findMany({
    where: { userId },
    select: { id: true, firstName: true, lastName: true, emailAddress: true, phoneNumber: true, photoUrl: true, profileUrl: true },
  })

  // Bulk-load ContactEmailAddress rows
  const allLinkedEmails = await prisma.contactEmailAddress.findMany({
    where: { contact: { userId } },
    select: { contactId: true, email: true },
  })

  // Build indices (normalized: diacritics stripped, lowercased)
  const emailIndex = new Map<string, string>() // email → contactId
  for (const c of allContacts) {
    if (c.emailAddress) emailIndex.set(c.emailAddress.toLowerCase(), c.id)
  }
  for (const e of allLinkedEmails) {
    emailIndex.set(e.email.toLowerCase(), e.contactId)
  }

  // name key: norm(first) | norm(last)
  const nameIndex = new Map<string, string[]>()
  for (const c of allContacts) {
    const key = `${norm(c.firstName)}|${norm(c.lastName)}`
    const arr = nameIndex.get(key) ?? []
    arr.push(c.id)
    nameIndex.set(key, arr)
  }

  const contactById = new Map(allContacts.map((c) => [c.id, c]))

  // Match and collect updates
  const phoneUpdates: { id: string; phone: string }[] = []
  const emailUpdates: { id: string; email: string }[] = []
  const photoUpdates: { id: string; photo: string }[] = []
  const linkedinUpdates: { id: string; url: string }[] = []
  const newEmailRows: { contactId: string; email: string }[] = []
  const seen = new Set<string>() // avoid double-enriching the same contact

  let matched = 0
  let alreadyUpToDate = 0

  for (const pc of phoneContacts) {
    // Match: email first (exact), then normalized name (first | last)
    let contactId: string | null = null

    if (pc.email) {
      contactId = emailIndex.get(pc.email.toLowerCase()) ?? null
    }

    if (!contactId) {
      const parts = pc.fullName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const key = `${norm(parts[0])}|${norm(parts[parts.length - 1])}`
        const ids = nameIndex.get(key) ?? []
        if (ids.length === 1) contactId = ids[0]
      }
    }

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
      const normalEmail = pc.email.toLowerCase()
      emailUpdates.push({ id: contactId, email: normalEmail })
      newEmailRows.push({ contactId, email: normalEmail })
      contact.emailAddress = normalEmail
      emailIndex.set(normalEmail, contactId)
      updated = true
    }

    if (pc.photoData && !contact.photoUrl) {
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

  // Apply in batches of 50
  const applyBatch = async <T>(items: T[], fn: (item: T) => Promise<unknown>) => {
    const BATCH = 50
    for (let i = 0; i < items.length; i += BATCH) {
      await Promise.all(items.slice(i, i + BATCH).map(fn))
    }
  }

  await applyBatch(phoneUpdates, (u) =>
    prisma.contact.update({ where: { id: u.id }, data: { phoneNumber: u.phone } })
  )
  await applyBatch(emailUpdates, (u) =>
    prisma.contact.update({ where: { id: u.id }, data: { emailAddress: u.email } })
  )
  await applyBatch(photoUpdates, (u) =>
    prisma.contact.update({ where: { id: u.id }, data: { photoUrl: u.photo } })
  )
  await applyBatch(linkedinUpdates, (u) =>
    prisma.contact.update({ where: { id: u.id }, data: { profileUrl: u.url } })
  )
  await applyBatch(newEmailRows, (u) =>
    prisma.contactEmailAddress.upsert({
      where: { contactId_email: { contactId: u.contactId, email: u.email } },
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
