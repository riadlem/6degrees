import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { isAutomatedEmail } from "@/lib/email-filters"

const PAGE_SIZE = 20

const COMMON_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "me.com", "mac.com", "live.com", "msn.com", "aol.com", "protonmail.com",
])

type SenderGroup = {
  fromEmail: string
  fromName: string | null
  messageCount: number
  lastSeen: string | null
}

type Recommendation = {
  contactId: string
  name: string
  company: string | null
  matchReason: string
}

/**
 * Fetch recommendations for all senders on the current page in batched queries
 * instead of issuing separate queries per sender.
 *
 * Strategy:
 *  - One query to find contacts by name for all senders that have a parseable
 *    first+last name (using OR across all pairs).
 *  - One query to find contacts by domain for all non-common domains.
 * Then assign up to 3 recommendations per sender using in-memory matching.
 */
async function getBatchedRecommendations(
  userId: string,
  senders: SenderGroup[],
): Promise<Map<string, Recommendation[]>> {
  const result = new Map<string, Recommendation[]>()
  for (const s of senders) result.set(s.fromEmail, [])

  // Build name pairs and domain sets for a single batch query each.
  type NamePair = { fromEmail: string; first: string; last: string }
  const namePairs: NamePair[] = []
  const domainSenders: { fromEmail: string; domain: string; baseDomain: string }[] = []

  for (const s of senders) {
    if (s.fromName) {
      const parts = s.fromName.trim().split(/\s+/)
      if (parts.length >= 2) {
        namePairs.push({ fromEmail: s.fromEmail, first: parts[0], last: parts[parts.length - 1] })
      }
    }
    const domain = s.fromEmail.split("@")[1]?.toLowerCase()
    if (domain && !COMMON_DOMAINS.has(domain)) {
      domainSenders.push({ fromEmail: s.fromEmail, domain, baseDomain: domain.split(".")[0] })
    }
  }

  // Query A: batch name-match lookup.
  // Build one OR clause per sender pair; Prisma doesn't support parameterised dynamic OR well
  // so we use a raw query with LOWER() matching.
  if (namePairs.length > 0) {
    const nameContacts = await prisma.contact.findMany({
      where: {
        userId,
        OR: namePairs.flatMap((p) => [
          {
            firstName: { contains: p.first, mode: "insensitive" as const },
            lastName: { contains: p.last, mode: "insensitive" as const },
          },
          {
            firstName: { contains: p.last, mode: "insensitive" as const },
            lastName: { contains: p.first, mode: "insensitive" as const },
          },
        ]),
      },
      select: { id: true, firstName: true, lastName: true, company: true },
    })

    // Assign to senders in memory.
    for (const pair of namePairs) {
      const recs = result.get(pair.fromEmail)!
      for (const c of nameContacts) {
        if (recs.length >= 3) break
        const fn = c.firstName.toLowerCase()
        const ln = c.lastName.toLowerCase()
        const pf = pair.first.toLowerCase()
        const pl = pair.last.toLowerCase()
        const matches =
          (fn.includes(pf) && ln.includes(pl)) ||
          (fn.includes(pl) && ln.includes(pf))
        if (matches) {
          recs.push({
            contactId: c.id,
            name: `${c.firstName} ${c.lastName}`,
            company: c.company ?? null,
            matchReason: "name",
          })
        }
      }
    }
  }

  // Query B: batch domain-match lookup.
  if (domainSenders.length > 0) {
    const baseDomains = [...new Set(domainSenders.map((d) => d.baseDomain))]

    const domainContacts = await prisma.contact.findMany({
      where: {
        userId,
        OR: baseDomains.map((bd) => ({
          company: { contains: bd, mode: "insensitive" as const },
        })),
      },
      select: { id: true, firstName: true, lastName: true, company: true },
    })

    for (const ds of domainSenders) {
      const recs = result.get(ds.fromEmail)!
      const existingIds = new Set(recs.map((r) => r.contactId))
      for (const c of domainContacts) {
        if (recs.length >= 3) break
        if (existingIds.has(c.id)) continue
        if (c.company?.toLowerCase().includes(ds.baseDomain)) {
          recs.push({
            contactId: c.id,
            name: `${c.firstName} ${c.lastName}`,
            company: c.company ?? null,
            matchReason: "domain",
          })
        }
      }
    }
  }

  return result
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0"))
  const q = searchParams.get("q")?.toLowerCase().trim() ?? ""

  // Query 1: load dismissed emails.
  const dismissed = await prisma.dismissedEmail.findMany({
    where: { userId },
    select: { email: true },
  })
  const dismissedSet = new Set(dismissed.map((d) => d.email))

  // Query 2: get all unique unmatched inbound senders with counts, latest sentAt, and latest
  // fromName — all in one groupBy + a single raw query for the latest fromName per email.
  const allGrouped = await prisma.emailMessage.groupBy({
    by: ["fromEmail"],
    where: { userId, contactId: null, isOutbound: false },
    _count: { _all: true },
    _max: { sentAt: true },
    orderBy: [{ _count: { fromEmail: "desc" } }],
  })

  // Partition into auto-detected and actionable (skip dismissed).
  const automated: typeof allGrouped = []
  const actionable: typeof allGrouped = []

  for (const g of allGrouped) {
    if (dismissedSet.has(g.fromEmail)) continue
    if (isAutomatedEmail(g.fromEmail)) {
      automated.push(g)
    } else {
      actionable.push(g)
    }
  }

  // Optional name-match filter (query 3, only when q is set).
  let nameMatchEmails = new Set<string>()
  if (q) {
    const nameMatches = await prisma.emailMessage.findMany({
      where: { userId, contactId: null, isOutbound: false, fromName: { contains: q, mode: "insensitive" } },
      select: { fromEmail: true },
      distinct: ["fromEmail"],
      take: 100,
    })
    nameMatchEmails = new Set(nameMatches.map((m) => m.fromEmail))
  }

  const filtered = q
    ? actionable.filter((g) => g.fromEmail.toLowerCase().includes(q) || nameMatchEmails.has(g.fromEmail))
    : actionable

  const total = filtered.length
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (paginated.length === 0) {
    return Response.json({
      senders: [],
      total,
      autoFilteredCount: automated.length,
      page,
      pageSize: PAGE_SIZE,
    })
  }

  // Query 3 (or 4): one raw SQL query to get the latest fromName for each email on this page.
  const pageEmails = paginated.map((g) => g.fromEmail)

  const nameRows = await prisma.$queryRaw<{ fromEmail: string; fromName: string | null }[]>`
    SELECT DISTINCT ON ("fromEmail") "fromEmail", "fromName"
    FROM "EmailMessage"
    WHERE "userId" = ${userId}
      AND "fromEmail" = ANY(${pageEmails})
      AND "isOutbound" = false
    ORDER BY "fromEmail", "sentAt" DESC
  `

  const nameMap = new Map<string, string | null>()
  for (const row of nameRows) {
    nameMap.set(row.fromEmail, row.fromName ?? null)
  }

  // Build sender list for this page with fromName resolved.
  const pageSenders: SenderGroup[] = paginated.map((g) => ({
    fromEmail: g.fromEmail,
    fromName: nameMap.get(g.fromEmail) ?? null,
    messageCount: g._count._all,
    lastSeen: g._max.sentAt?.toISOString() ?? null,
  }))

  // Query 4+5: two batched queries (name + domain) to get recommendations for all page senders.
  const recommendationsMap = await getBatchedRecommendations(userId, pageSenders)

  const senders = pageSenders.map((s) => ({
    ...s,
    recommendations: recommendationsMap.get(s.fromEmail) ?? [],
  }))

  return Response.json({
    senders,
    total,
    autoFilteredCount: automated.length,
    page,
    pageSize: PAGE_SIZE,
  })
}
