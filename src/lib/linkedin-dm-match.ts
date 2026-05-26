import prisma from "@/lib/prisma"

/**
 * Strip accent marks (diacritics) from a string so that "Lézin" == "Lezin".
 * Uses Unicode NFD decomposition, then removes combining marks (category Mn).
 */
function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/\p{Mn}/gu, "")
}

/**
 * Attempt to match a display name to a Contact record for the given user.
 *
 * Strips common noise (brackets, dash-suffixes, trailing emoji) then tries:
 *   1. Exact case-insensitive first+last name match
 *   2. Accent-normalised first+last name match
 *   3. Single-word first-name-only match (if unique)
 *
 * Returns the contactId when exactly one match is found, otherwise null.
 */
async function directNameMatch(userId: string, name: string): Promise<string | null> {
  const cleaned = name
    .trim()
    .replace(/[\(\[\{].*?[\)\]\}]/g, "")   // remove anything in brackets
    .replace(/\s*[-–—|\/]\s*[A-Z].*/g, "") // strip " - Company" suffixes (capital-letter word after dash/pipe/slash)
    .replace(/\s+[\p{Emoji_Presentation}\p{Extended_Pictographic}].*/gu, "") // strip trailing emoji
    .trim()

  const parts = cleaned.split(/\s+/).filter(Boolean)

  // ── Exact match (case-insensitive) ────────────────────────────────────────

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

  // Single-word name: try first-name-only match (unique contacts only)
  if (parts.length === 1) {
    const firstName = parts[0]
    const matches = await prisma.contact.findMany({
      where: { userId, firstName: { equals: firstName, mode: "insensitive" } },
      select: { id: true },
      take: 2,
    })
    if (matches.length === 1) return matches[0].id
  }

  // ── Accent-normalised fallback ─────────────────────────────────────────────
  if (parts.length >= 2) {
    const normFirst = stripAccents(parts[0]).toLowerCase()
    const normLast  = stripAccents(parts[parts.length - 1]).toLowerCase()

    const firstChar = normFirst.charAt(0)
    const candidates = await prisma.$queryRaw<{ id: string; firstName: string; lastName: string | null }[]>`
      SELECT id, "firstName", "lastName"
      FROM "Contact"
      WHERE "userId" = ${userId}
        AND LOWER(LEFT("firstName", 1)) = ${firstChar}
    `
    const accentMatches = candidates.filter(
      (c) =>
        stripAccents(c.firstName ?? "").toLowerCase() === normFirst &&
        stripAccents(c.lastName  ?? "").toLowerCase() === normLast
    )
    if (accentMatches.length === 1) return accentMatches[0].id
  }

  if (parts.length === 1) {
    const normFirst = stripAccents(parts[0]).toLowerCase()
    const firstChar = normFirst.charAt(0)
    const candidates = await prisma.$queryRaw<{ id: string; firstName: string }[]>`
      SELECT id, "firstName"
      FROM "Contact"
      WHERE "userId" = ${userId}
        AND LOWER(LEFT("firstName", 1)) = ${firstChar}
    `
    const accentMatches = candidates.filter(
      (c) => stripAccents(c.firstName ?? "").toLowerCase() === normFirst
    )
    if (accentMatches.length === 1) return accentMatches[0].id
  }

  return null
}

/**
 * Match a LinkedIn DM conversation partner to a Contact in the database.
 *
 * Strategy (in priority order):
 *   1. LinkedIn profile URL → extract the vanity key → find by linkedinKey (globally unique)
 *   2. Name match via directNameMatch (exact + accent-normalised)
 *
 * Returns the Contact id, or null if no reliable match is found.
 */
export async function matchLinkedInDMToContact(
  userId: string,
  chatName: string,
  profileUrl: string | null,
): Promise<string | null> {
  // Step 1: LinkedIn URL key match — most reliable signal
  if (profileUrl) {
    const keyMatch = profileUrl.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
    if (keyMatch) {
      const linkedinKey = keyMatch[1]
      const contact = await prisma.contact.findFirst({
        where: { userId, linkedinKey },
        select: { id: true },
      })
      if (contact) return contact.id
    }
  }

  // Step 2: Name match fallback
  return directNameMatch(userId, chatName)
}
