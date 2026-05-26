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
 * Return all (normFirst, normLast) candidate pairs for a chat name.
 *
 * Fixes:
 *   1. Strip ALL emoji (not just space-preceded) — "Hernandez🌺" → "Hernandez"
 *   2. Compound last names  — "Carla de Preval" generates 3 candidates:
 *        A. (carla, preval)      last word only — DB might store trimmed form
 *        B. (carla, de preval)   first + full rest — handles French/Spanish particles
 *        C. (carla de, preval)   compound first + last — handles "Carla de" as firstName
 *      All three tried; first unambiguous match wins.
 */
type NameCandidate = { normFirst: string; normLast: string }

function nameVariants(chatName: string): NameCandidate[] {
  const cleaned = chatName
    .trim()
    // Strip ALL emoji including those glued directly without a space
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}️‍]/gu, "")
    // Remove anything in brackets: "(London)", "[CEO at Acme]", etc.
    .replace(/[\(\[\{].*?[\)\]\}]/g, "")
    // Strip " - Company" / " | Title" suffixes starting with a capital letter
    .replace(/\s*[-–—|\/]\s*[A-Z].*/g, "")
    .trim()
    .replace(/\s+/g, " ")  // collapse internal whitespace

  const parts = cleaned.split(" ").filter(Boolean)
  if (parts.length === 0) return []

  const nf = stripAccents(parts[0]).toLowerCase()

  if (parts.length === 1) return [{ normFirst: nf, normLast: "" }]
  if (parts.length === 2) return [{ normFirst: nf, normLast: stripAccents(parts[1]).toLowerCase() }]

  // 3+ parts: generate all useful split variants to handle particles and compound names
  const seen = new Set<string>()
  const candidates: NameCandidate[] = []

  function addCandidate(fn: string[], ln: string[]) {
    const cnf = stripAccents(fn.join(" ")).toLowerCase()
    const cnl = stripAccents(ln.join(" ")).toLowerCase()
    const key = `${cnf}\0${cnl}`
    if (!seen.has(key)) { seen.add(key); candidates.push({ normFirst: cnf, normLast: cnl }) }
  }

  // A: first word + last word  (most selective → try first)
  addCandidate([parts[0]], [parts[parts.length - 1]])
  // B: first word + everything after  ("Carla" + "de Preval")
  addCandidate([parts[0]], parts.slice(1))
  // C: everything before last + last word  ("Carla de" + "Preval")
  addCandidate(parts.slice(0, -1), [parts[parts.length - 1]])

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
