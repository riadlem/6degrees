import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export type SegmentRule = {
  id: string
  field: string
  operator: string
  value: string
}

const NUM_OP: Record<string, string> = {
  gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=",
}

function buildCondition(rule: SegmentRule): Prisma.ContactWhereInput | null {
  const { field, operator, value } = rule

  switch (field) {
    // ── Boolean presence fields ─────────────────────────────────────────────
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

    // ── String equality fields ──────────────────────────────────────────────
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

    // ── String contains fields ──────────────────────────────────────────────
    case "industry":
    case "position":
    case "headline": {
      const mode = "insensitive" as const
      if (operator === "contains")    return { [field]: { contains: value, mode } }
      if (operator === "not_contains") return { NOT: { [field]: { contains: value, mode } } }
      return null
    }

    // ── Outreach status ─────────────────────────────────────────────────────
    case "outreachStatus":
      if (operator === "any")     return { outreachStatus: { not: null } }
      if (operator === "none")    return { outreachStatus: null }
      if (operator === "is")      return { outreachStatus: value || null }
      if (operator === "is_not")  return { NOT: { outreachStatus: value || null } }
      return null

    // ── Number fields ───────────────────────────────────────────────────────
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

    // ── connectedOn date ────────────────────────────────────────────────────
    case "connectedOn": {
      const d = new Date(value)
      if (isNaN(d.getTime())) return null
      if (operator === "after")  return { connectedOn: { gt: d.toISOString() } }
      if (operator === "before") return { connectedOn: { lt: d.toISOString() } }
      return null
    }

    // ── Label membership ────────────────────────────────────────────────────
    case "labelId":
      if (operator === "has")     return { labels: { some: { labelId: value } } }
      if (operator === "has_not") return { labels: { none: { labelId: value } } }
      return null

    default:
      return null
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { combinator?: "AND" | "OR"; rules?: SegmentRule[] }
  const { combinator = "AND", rules = [] } = body

  const activeRules = rules.filter((r) => r.field && r.operator)
  if (activeRules.length === 0) return Response.json({ ids: [], total: 0 })

  const conditions: Prisma.ContactWhereInput[] = []

  for (const rule of activeRules) {
    if (rule.field === "companyContactCount") {
      // Aggregate — requires raw SQL subquery
      const n = parseInt(rule.value, 10)
      const op = NUM_OP[rule.operator]
      if (isNaN(n) || !op) continue

      const rows = await prisma.$queryRaw<{ company: string }[]>(
        Prisma.sql`
          SELECT "company" FROM "Contact"
          WHERE "userId" = ${userId} AND "company" IS NOT NULL
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

  const where: Prisma.ContactWhereInput = {
    userId,
    NOT: { firstName: "", lastName: "" },
    ...(conditions.length > 0
      ? combinator === "AND"
        ? { AND: conditions }
        : { OR: conditions }
      : {}),
  }

  const contacts = await prisma.contact.findMany({ where, select: { id: true } })
  return Response.json({ ids: contacts.map((c) => c.id), total: contacts.length })
}
