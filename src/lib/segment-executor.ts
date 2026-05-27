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
import { getSectorIndustries } from "@/lib/industry-sectors"

// ─── Types (re-exported for consumers) ───────────────────────────────────────

export type SegmentRule = {
  id: string
  field: string
  operator: string
  value: string
  /** Multi-value override for text_eq fields with "is" / "is_not" operators */
  values?: string[]
}

export type SegmentDef = {
  combinator: "AND" | "OR"
  rules: SegmentRule[]
}

// ─── Internal ─────────────────────────────────────────────────────────────────

type CompanyPref = {
  company: string
  parentCompany: string | null
  type: string | null
  isPartner: boolean
  ignored: boolean
  industry: string | null
}

// Rules that require company preferences pre-fetched from DB
const COMPANY_PREF_FIELDS = new Set(["companyWithSubs", "companyType", "isPartner", "isPreferred", "sector"])

function buildCompanyPrefCondition(
  rule: SegmentRule,
  prefs: CompanyPref[],
): Prisma.ContactWhereInput | null {
  const { field, operator, value } = rule
  const mode = "insensitive" as const

  if (field === "companyWithSubs") {
    const vals = rule.values && rule.values.length > 0 ? rule.values : (value ? [value] : [])
    if (vals.length === 0) return null
    // Expand each selected company to include its subsidiaries
    const allNames = new Set<string>()
    for (const v of vals) {
      allNames.add(v)
      for (const p of prefs) {
        if (p.parentCompany?.toLowerCase() === v.toLowerCase()) allNames.add(p.company)
      }
    }
    const nameList = [...allNames]
    const clause: Prisma.ContactWhereInput = { OR: nameList.map((n) => ({ company: { equals: n, mode } })) }
    return operator === "is_not" ? { NOT: clause } : clause
  }

  if (field === "companyType") {
    const typeCompanies = prefs.filter((p) => p.type === value).map((p) => p.company)
    if (typeCompanies.length === 0) return { id: "__no_match__" }
    const clause: Prisma.ContactWhereInput = { OR: typeCompanies.map((n) => ({ company: { equals: n, mode } })) }
    return operator === "is_not" ? { NOT: clause } : clause
  }

  if (field === "isPartner") {
    const partnerCompanies = prefs.filter((p) => p.isPartner).map((p) => p.company)
    if (operator === "yes") {
      if (partnerCompanies.length === 0) return { id: "__no_match__" }
      return { OR: partnerCompanies.map((n) => ({ company: { equals: n, mode } })) }
    }
    // "no" = not at any partner company
    return { AND: partnerCompanies.map((n) => ({ NOT: { company: { equals: n, mode } } })) }
  }

  if (field === "isPreferred") {
    const preferredCompanies = prefs.filter((p) => !p.ignored).map((p) => p.company)
    const ignoredCompanies   = prefs.filter((p) =>  p.ignored).map((p) => p.company)
    if (operator === "yes") {
      if (preferredCompanies.length === 0) return { id: "__no_match__" }
      return { OR: preferredCompanies.map((n) => ({ company: { equals: n, mode } })) }
    }
    if (ignoredCompanies.length === 0) return { id: "__no_match__" }
    return { OR: ignoredCompanies.map((n) => ({ company: { equals: n, mode } })) }
  }

  if (field === "sector") {
    if (!value) return null
    const sectorIndustries = getSectorIndustries(value)
    if (sectorIndustries.length === 0) return null
    const sectorMatchCompanies = prefs
      .filter((p) => p.industry && sectorIndustries.some((si) => si.toLowerCase() === p.industry!.toLowerCase()))
      .map((p) => p.company)
    const sectorOtherCompanies = prefs
      .filter((p) => p.industry && !sectorIndustries.some((si) => si.toLowerCase() === p.industry!.toLowerCase()))
      .map((p) => p.company)
    const contactSectorClause: Prisma.ContactWhereInput = sectorOtherCompanies.length > 0
      ? { OR: sectorIndustries.map((ind) => ({ industry: { equals: ind, mode } })), NOT: { company: { in: sectorOtherCompanies } } }
      : { OR: sectorIndustries.map((ind) => ({ industry: { equals: ind, mode } })) }
    return { OR: [...(sectorMatchCompanies.length > 0 ? [{ company: { in: sectorMatchCompanies } }] : []), contactSectorClause] }
  }

  return null
}

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
      // Multi-value: use OR of case-insensitive equals (Prisma 'in' lacks mode support)
      const vals = rule.values && rule.values.length > 0 ? rule.values : (value ? [value] : [])
      if (operator === "is") {
        if (vals.length === 0) return null
        if (vals.length === 1) return { [field]: { equals: vals[0], mode } }
        return { OR: vals.map((v) => ({ [field]: { equals: v, mode } })) }
      }
      if (operator === "is_not") {
        if (vals.length === 0) return null
        if (vals.length === 1) return { NOT: { [field]: { equals: vals[0], mode } } }
        return { AND: vals.map((v) => ({ NOT: { [field]: { equals: v, mode } } })) }
      }
      if (operator === "contains")     return { [field]: { contains: value, mode } }
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
  const activeRules = rules.filter((r) => {
    if (!r.field || !r.operator) return false
    // Rules with a values array are valid even when value is empty
    if (r.values && r.values.length > 0) return true
    return true // value check is done per-rule in buildCondition
  })

  // Pre-fetch company prefs if any rule needs them
  const needsCompanyPrefs = activeRules.some((r) => COMPANY_PREF_FIELDS.has(r.field))
  let companyPrefs: CompanyPref[] = []
  if (needsCompanyPrefs) {
    companyPrefs = await prisma.companyPreference.findMany({
      where: { userId },
      select: { company: true, parentCompany: true, type: true, isPartner: true, ignored: true, industry: true },
    }).catch(() => [])
  }

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
    } else if (COMPANY_PREF_FIELDS.has(rule.field)) {
      const cond = buildCompanyPrefCondition(rule, companyPrefs)
      if (cond) conditions.push(cond)
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
  companyWithSubs:     "Company (incl. subsidiaries)",
  companyType:         "Company type",
  isPartner:           "Partner company",
  isPreferred:         "Preferred company",
  sector:              "Sector",
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
    // Multi-value display
    if (r.values && r.values.length > 0) {
      const op = r.operator === "is" ? "is" : r.operator === "is_not" ? "isn't" : r.operator
      return `${label} ${op} ${r.values.join(", ")}`
    }
    if (r.value) return `${label} ${r.operator} "${r.value}"`
    return label
  })

  const base = parts.join(` ${def.combinator ?? "AND"} `)
  return overflow > 0 ? `${base} +${overflow} more` : base
}
