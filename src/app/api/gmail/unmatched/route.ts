import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { normalizeEmail } from "@/lib/gmail"

const PAGE_SIZE = 20

const COMMON_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "me.com", "mac.com", "live.com", "msn.com", "aol.com", "protonmail.com",
])

async function getRecommendations(userId: string, fromName: string | null, fromEmail: string) {
  const recs: { contactId: string; name: string; company: string | null; matchReason: string }[] = []

  // Pass 1: name match
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

  // Pass 2: email domain match against company (skip common providers)
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

  // Group unmatched inbound emails by fromEmail
  const grouped = await prisma.emailMessage.groupBy({
    by: ["fromEmail"],
    where: { userId, contactId: null, isOutbound: false },
    _count: { _all: true },
    _max: { sentAt: true },
    orderBy: [{ _count: { fromEmail: "desc" } }],
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  })

  const totalGroups = await prisma.emailMessage.groupBy({
    by: ["fromEmail"],
    where: { userId, contactId: null, isOutbound: false },
  })

  // Fetch most recent fromName for each email
  const senders = await Promise.all(
    grouped.map(async (g) => {
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

  return Response.json({ senders, total: totalGroups.length, page, pageSize: PAGE_SIZE })
}
