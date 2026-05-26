import prisma from "@/lib/prisma"

/**
 * Strip accent marks (diacritics) from a string so that "Lézin" == "Lezin".
 * Uses Unicode NFD decomposition, then removes combining marks (category Mn).
 */
function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/\p{Mn}/gu, "")
}

/** Extract the vanity slug from any linkedin.com/in/... URL, lowercased. */
function extractLinkedInKey(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
  return m ? decodeURIComponent(m[1]).toLowerCase() : null
}

/**
 * Normalise a chat name and return all (normFirst, normLast) candidate pairs.
 *
 * Two bugs fixed vs. the previous version:
 *
 *   1. Emoji stripping — the old regex only stripped emoji preceded by whitespace,
 *      so "Hernandez🌺" (no space) survived intact.  New: strip ALL emoji/modifiers.
 *
 *   2. Compound last names — "Carla de Preval" has parts ["Carla","de","Preval"].
 *      Old code: lastName = parts[last] = "Preval".  DB stores lastName = "de Preval".
 *      New: for 3+ word names generate two candidates:
 *        – (Carla, Preval)      [last word only — DB might store it trimmed]
 *        – (Carla, de Preval)   [full rest — handles French/Spanish/Dutch particles]
 */
type NameCandidate = { normFirst: string; normLast: string }

function nameVariants(chatName: string): NameCandidate[] {
  const cleaned = chatName
    .trim()
    // Strip ALL emoji (including those glued directly to the name without a space)
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}️‍]/gu, "")
    // Remove anything in brackets: "(London)", "[CEO at Acme]", etc.
    .replace(/[\(\[\{].*?[\)\]\}]/g, "")
    // Strip " - Company" / " | Title" suffixes that start with a capital letter
    .replace(/\s*[-–—|\/]\s*[A-Z].*/g, "")
    .trim()
    .replace(/\s+/g, " ")  // collapse internal whitespace

  const parts = cleaned.split(" ").filter(Boolean)
  if (parts.length === 0) return []

  const nf = stripAccents(parts[0]).toLowerCase()

  if (parts.length === 1) {
    // Single word: first-name-only match
    return [{ normFirst: nf, normLast: "" }]
  }

  if (parts.length === 2) {
    return [{ normFirst: nf, normLast: stripAccents(parts[1]).toLowerCase() }]
  }

  // 3+ parts: try both splits to handle noble particles and compound surnames
  const candidates: NameCandidate[] = []
  // Candidate A: first + last word  ("Carla" + "Preval")
  candidates.push({ normFirst: nf, normLast: stripAccents(parts[parts.length - 1]).toLowerCase() })
  // Candidate B: first + all remaining words  ("Carla" + "de Preval")
  const fullRest = stripAccents(parts.slice(1).join(" ")).toLowerCase()
  if (fullRest !== candidates[0].normLast) {
    candidates.push({ normFirst: nf, normLast: fullRest })
  }

  return candidates
}

/**
 * Attempt to match a display name to a Contact record for the given user.
 * Returns the contactId when exactly one unambiguous match is found, else null.
 */
async function directNameMatch(userId: string, chatName: string): Promise<string | null> {
  const variants = nameVariants(chatName)
  if (variants.length === 0) return null

  const nf = variants[0].normFirst
  if (!nf) return null

  // Fetch all contacts whose first name starts with the right letter.
  // A single DB round-trip covers exact + accent-normalised + compound-last-name.
  const firstChar = nf.charAt(0)
  const candidates = await prisma.$queryRaw<{ id: string; firstName: string; lastName: string | null }[]>`
    SELECT id, "firstName", "lastName"
    FROM "Contact"
    WHERE "userId" = ${userId}
      AND LOWER(LEFT("firstName", 1)) = ${firstChar}
  `

  // Build lookup: normFirst\0normLast → [contactId]
  const lookup = new Map<string, string[]>()
  for (const c of candidates) {
    const k = `${stripAccents(c.firstName ?? "").toLowerCase()}\0${stripAccents(c.lastName ?? "").toLowerCase()}`
    if (!lookup.has(k)) lookup.set(k, [])
    lookup.get(k)!.push(c.id)
  }

  // Try each variant in priority order (last-word-only first — more selective)
  for (const v of variants) {
    const key = `${v.normFirst}\0${v.normLast}`
    const hits = lookup.get(key) ?? []
    if (hits.length === 1) return hits[0]
    // If ambiguous (2+), continue to next variant — it might be more specific
  }

  // Single-word first-name-only fallback
  if (variants[0].normLast === "") {
    const hits = [...lookup.entries()]
      .filter(([k]) => k.startsWith(`${nf}\0`))
      .flatMap(([, ids]) => ids)
    if (hits.length === 1) return hits[0]
  }

  return null
}

/**
 * Match a LinkedIn DM conversation partner to a Contact in the database.
 *
 * Strategy (in priority order):
 *   1. LinkedIn URL → vanity key → Contact.linkedinKey  (fastest, globally unique)
 *   2. LinkedIn URL → vanity key → Contact.profileUrl   (catches renamed vanity URLs)
 *   3. Name variants via directNameMatch  (accent-normalised + compound surnames)
 */
export async function matchLinkedInDMToContact(
  userId: string,
  chatName: string,
  profileUrl: string | null,
): Promise<string | null> {
  if (profileUrl) {
    const key = extractLinkedInKey(profileUrl)
    if (key) {
      const byKey = await prisma.contact.findFirst({
        where: { userId, linkedinKey: { equals: key, mode: "insensitive" } },
        select: { id: true },
      })
      if (byKey) return byKey.id

      const byUrl = await prisma.contact.findFirst({
        where: { userId, profileUrl: { contains: key, mode: "insensitive" } },
        select: { id: true },
      })
      if (byUrl) return byUrl.id
    }
  }

  return directNameMatch(userId, chatName)
}
