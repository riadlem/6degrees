/**
 * segment-executor.ts — shared segment query logic.
 *
 * Used by:
 * - /api/contacts/segment (ephemeral segment queries)
 * - /api/lists/[id] (resolving smart list members)
 * - /api/lists (resolving smart list member counts)
 */

import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"

// ─── Types (re-exported for consumers) ───────────────────────────────────────

export type SegmentRule = {
  id: string
  field: string
  operator: string
  value: string
}

export type SegmentDef = {
  combinator: "AND" | "OR"
  rules: SegmentRule[]
}

// ─── Internal ─────────────────────────────────────────────────────────────────

const NUM_OP: Record<string, string> = {
  gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=",
}

export function buildCondition(rule: SegmentRule): Prisma.ContactWhereInput | null {
  const { field, operator, value } = rule

  switch (field) {
    case "coworkEnriched":
      return operator === "yes" ? { coworkEnrichedAt: { not: null } } : { coworkEnrichedAt: null }
    case "hasEmail":
      return operator === "yes" ? { emailAddress: { not: null } } : { emailAddress: null }
    case "hasPhoto":
      return operator === "yes" ? { photoUrl: { not: null } } : { photoUrl: null }
    case "hasLinkedIn":
      return operator === "yes" ? { profileUrl: { not: null } } : { profileUrl: null }
    case "hasPhone":
      return operator === "yes" ? { phoneNumber: { not: null } } : { phoneNumber: null }

    case "country":
    case "city":
    case "company": {
      const mode = "insensitive" as const
      if (operator === "is")          return { [field]: { equals: value, mode } }
      if (operator === "is_not")      return { NOT: { [field]: { equals: value, mode } } }
      if (operator === "contains")    return { [field]: { contains: value, mode } }
      if (operator === "not_contains") return { NOT: { [field]: { contains: value, mode } } }
      return null
    }

    case "industry":
    case "position":
    case "headline": {
      const mode = "insensitive" as const
      if (operator === "contains")    return { [field]: { contains: value, mode } }
      if (operator === "not_contains") return { NOT: { [field]: { contains: value, mode } } }
      return null
    }

    case "outreachStatus":
      if (operator === "any")    return { outreachStatus: { not: null } }
      if (operator === "none")   return { outreachStatus: null }
      if (operator === "is")     return { outreachStatus: value || null }
      if (operator === "is_not") return { NOT: { outreachStatus: value || null } }
      return null

    case "commonConnections":
    case "interactionScore": {
      const n = parseFloat(value)
      if (isNaN(n)) return null
      if (operator === "eq")  return { [field]: n }
      if (operator === "gt")  return { [field]: { gt: n } }
      if (operator === "gte") return { [field]: { gte: n } }
      if (operator === "lt")  return { [field]: { lt: n } }
      if (operator === "lte") return { [field]: { lte: n } }
      return null
    }

    case "connectedOn": {
      const d = new Date(value)
      if (isNaN(d.getTime())) return null
      if (operator === "after")  return { connectedOn: { gt: d.toISOString() } }
      if (operator === "before") return { connectedOn: { lt: d.toISOString() } }
      return null
    }

    case "labelId":
      if (operator === "has")     return { labels: { some: { labelId: value } } }
      if (operator === "has_not") return { labels: { none: { labelId: value } } }
      return null

    default:
      return null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a Prisma WHERE clause for a segment definition.
 * The `companyContactCount` aggregate rule requires a raw SQL subquery
 * which is resolved here and folded into the final condition.
 */
export async function buildSegmentWhere(
  userId: string,
  def: SegmentDef,
): Promise<Prisma.ContactWhereInput> {
  const { combinator = "AND", rules = [] } = def
  const activeRules = rules.filter((r) => r.field && r.operator)

  const conditions: Prisma.ContactWhereInput[] = []

  for (const rule of activeRules) {
    if (rule.field === "companyContactCount") {
      const n = parseInt(rule.value, 10)
      const op = NUM_OP[rule.operator]
      if (isNaN(n) || !op) continue

      const rows = await prisma.$queryRaw<{ company: string }[]>(
        Prisma.sql`
          SELECT "company" FROM "Contact"
          WHERE "userId" = ${userId}
            AND "company" IS NOT NULL
            AND "firstName" != ''
            AND "lastName" != ''
          GROUP BY "company"
          HAVING COUNT(*) ${Prisma.raw(op)} ${n}
        `
      )
      conditions.push({ company: { in: rows.map((r) => r.company) } })
    } else {
      const cond = buildCondition(rule)
      if (cond) conditions.push(cond)
    }
  }

  return {
    userId,
    NOT: { firstName: "", lastName: "" },
    ...(conditions.length > 0
      ? combinator === "AND"
        ? { AND: conditions }
        : { OR: conditions }
      : {}),
  }
}

/** Returns matching contact IDs and total count for a segment. */
export async function executeSegment(
  userId: string,
  def: SegmentDef,
): Promise<{ ids: string[]; total: number }> {
  const where = await buildSegmentWhere(userId, def)
  const contacts = await prisma.contact.findMany({ where, select: { id: true } })
  return { ids: contacts.map((c) => c.id), total: contacts.length }
}

/** Returns only the count — cheaper than fetching all IDs. */
export async function executeSegmentCount(
  userId: string,
  def: SegmentDef,
): Promise<number> {
  if (!def.rules?.length) return 0
  const where = await buildSegmentWhere(userId, def)
  return prisma.contact.count({ where })
}

// ─── Human-readable summary ───────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  company:             "Company",
  position:            "Role",
  industry:            "Industry",
  country:             "Country",
  city:                "City",
  outreachStatus:      "Status",
  labelId:             "Label",
  hasEmail:            "Has email",
  hasPhoto:            "Has photo",
  hasLinkedIn:         "Has LinkedIn",
  hasPhone:            "Has phone",
  companyContactCount: "Company size",
  commonConnections:   "Mutual connections",
  interactionScore:    "Score",
  connectedOn:         "Connected",
  coworkEnriched:      "Cowork enriched",
  headline:            "Headline",
}

/**
 * Returns a short human-readable summary of a segment definition.
 * Used for display in list cards and detail pages.
 */
export function summariseSegment(def: SegmentDef, maxRules = 2): string {
  const rules = def.rules ?? []
  const shown = rules.slice(0, maxRules)
  const overflow = rules.length - shown.length

  const parts = shown.map((r) => {
    const label = FIELD_LABELS[r.field] ?? r.field
    if (r.operator === "yes") return `${label}: Yes`
    if (r.operator === "no")  return `${label}: No`
    if (r.operator === "any") return `${label}: any`
    if (r.operator === "none") return `${label}: none`
    if (r.value) return `${label} ${r.operator} "${r.value}"`
    return label
  })

  const base = parts.join(` ${def.combinator ?? "AND"} `)
  return overflow > 0 ? `${base} +${overflow} more` : base
}
