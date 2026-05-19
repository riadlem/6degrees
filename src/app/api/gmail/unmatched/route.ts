import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { isAutomatedEmail } from "@/lib/email-filters"

const PAGE_SIZE = 20

const COMMON_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "me.com", "mac.com", "live.com", "msn.com", "aol.com", "protonmail.com",
])

async function getRecommendations(userId: string, fromName: string | null, fromEmail: string) {
  const recs: { contactId: string; name: string; company: string | null; matchReason: string }[] = []

  if (fromName) {
    const parts = fromName.trim().split(/\s+/)
    if (parts.length >= 2) {
      const first = parts[0]
      const last = parts[parts.length - 1]
      const nameMatches = await prisma.contact.findMany({
        where: {
          userId,
          OR: [
            { firstName: { contains: first, mode: "insensitive" }, lastName: { contains: last, mode: "insensitive" } },
            { firstName: { contains: last, mode: "insensitive" }, lastName: { contains: first, mode: "insensitive" } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, company: true },
        take: 3,
      })
      for (const c of nameMatches) {
        recs.push({ contactId: c.id, name: `${c.firstName} ${c.lastName}`, company: c.company ?? null, matchReason: "name" })
      }
    }
  }

  if (recs.length < 3) {
    const domain = fromEmail.split("@")[1]?.toLowerCase()
    if (domain && !COMMON_DOMAINS.has(domain)) {
      const baseDomain = domain.split(".")[0]
      const domainMatches = await prisma.contact.findMany({
        where: {
          userId,
          company: { contains: baseDomain, mode: "insensitive" },
          id: { notIn: recs.map((r) => r.contactId) },
        },
        select: { id: true, firstName: true, lastName: true, company: true },
        take: 3 - recs.length,
      })
      for (const c of domainMatches) {
        recs.push({ contactId: c.id, name: `${c.firstName} ${c.lastName}`, company: c.company ?? null, matchReason: "domain" })
      }
    }
  }

  return recs.slice(0, 3)
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0"))
  const q = searchParams.get("q")?.toLowerCase().trim() ?? ""

  // Load dismissed emails for this user
  const dismissed = await prisma.dismissedEmail.findMany({
    where: { userId },
    select: { email: true },
  })
  const dismissedSet = new Set(dismissed.map((d) => d.email))

  // Fetch all unique unmatched inbound senders
  const allGrouped = await prisma.emailMessage.groupBy({
    by: ["fromEmail"],
    where: { userId, contactId: null, isOutbound: false },
    _count: { _all: true },
    _max: { sentAt: true },
    orderBy: [{ _count: { fromEmail: "desc" } }],
  })

  // Partition into auto-detected, dismissed, and actionable
  const automated: typeof allGrouped = []
  const actionable: typeof allGrouped = []

  for (const g of allGrouped) {
    if (dismissedSet.has(g.fromEmail)) continue // already dismissed, skip entirely
    if (isAutomatedEmail(g.fromEmail)) {
      automated.push(g)
    } else {
      actionable.push(g)
    }
  }

  // If searching by name, gather fromEmails where fromName contains q
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

  // Fetch fromName + recommendations for this page
  const senders = await Promise.all(
    paginated.map(async (g) => {
      const latest = await prisma.emailMessage.findFirst({
        where: { userId, fromEmail: g.fromEmail, isOutbound: false },
        orderBy: { sentAt: "desc" },
        select: { fromName: true },
      })
      const fromName = latest?.fromName ?? null
      const recommendations = await getRecommendations(userId, fromName, g.fromEmail)
      return {
        fromEmail: g.fromEmail,
        fromName,
        messageCount: g._count._all,
        lastSeen: g._max.sentAt?.toISOString() ?? null,
        recommendations,
      }
    }),
  )

  return Response.json({
    senders,
    total,
    autoFilteredCount: automated.length,
    page,
    pageSize: PAGE_SIZE,
  })
}
