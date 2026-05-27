/**
 * contact-search.ts — Pure client-side contact matching utility.
 *
 * No React, no network calls, no side effects.
 * Used by ContactSearchBar to power the instant offline autocomplete.
 */

export type IndexEntry = {
  id:        string
  firstName: string
  lastName:  string
  company:   string | null
  position:  string | null
  city:      string | null
  country:   string | null
  industry:  string | null
}

/**
 * Normalise a string for comparison:
 * - Lowercase
 * - NFD decomposition → remove combining marks (strips accents: é→e, ü→u, etc.)
 * - Remove visible emoji (Emoji_Presentation: 🌟, 🇫🇷, etc.)
 * - Collapse leftover whitespace
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")               // combining marks → remove accents
    .replace(/\p{Emoji_Presentation}/gu, "") // visible emoji → strip
    .replace(/\s+/g, " ")                  // collapse whitespace
    .trim()
}

/**
 * matchContacts — score and rank contacts against a free-text query.
 *
 * Scoring rules (per token):
 *  300 — exact last name match
 *  250 — exact first name match
 *  150 — last name starts with token
 *  100 — first name starts with token
 *   40 — company starts with token
 *   30 — position starts with token
 *   20 — token contained in first or last name
 *    5 — token contained in company or position
 *    0 — token matches nothing → contact excluded (AND semantics)
 *
 * All tokens must match at least one field (AND: "j s" → firstName starts "j"
 * AND lastName starts "s"). Order-independent.
 *
 * Returns up to `limit` contacts sorted by descending score.
 */
export function matchContacts(
  rawQuery: string,
  contacts: IndexEntry[],
  limit = 8,
): IndexEntry[] {
  const tokens = norm(rawQuery).trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return []

  const scored: { contact: IndexEntry; score: number }[] = []

  for (const c of contacts) {
    const fn = norm(c.firstName)
    const ln = norm(c.lastName)
    const co = norm(c.company  ?? "")
    const po = norm(c.position ?? "")

    let total = 0
    let miss  = false

    for (const t of tokens) {
      let s = 0

      if      (ln === t)          s = 300
      else if (fn === t)          s = 250
      else if (ln.startsWith(t)) s = 150
      else if (fn.startsWith(t)) s = 100
      else if (co.startsWith(t)) s =  40
      else if (po.startsWith(t)) s =  30
      else if (fn.includes(t) || ln.includes(t)) s = 20
      else if (co.includes(t) || po.includes(t)) s =  5
      else { miss = true; break }

      total += s
    }

    if (!miss && total > 0) {
      scored.push({ contact: c, score: total })
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => m.contact)
}
