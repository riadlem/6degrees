import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { isAutomatedEmail } from "@/lib/email-filters"

export async function GET(
  req: Request,
  { params }: { params: { name: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const companyName = decodeURIComponent(params.name)
  const { searchParams } = new URL(req.url)
  const domains = (searchParams.get("domains") ?? "").split(",").map((d) => d.trim()).filter(Boolean)

  if (domains.length === 0) {
    return Response.json({ senders: [] })
  }

  // Load dismissed emails
  const dismissed = await prisma.dismissedEmail.findMany({
    where: { userId },
    select: { email: true },
  })
  const dismissedSet = new Set(dismissed.map((d) => d.email))

  // Unmatched senders from these domains
  const grouped = await prisma.emailMessage.groupBy({
    by: ["fromEmail"],
    where: {
      userId,
      contactId: null,
      isOutbound: false,
      OR: domains.map((d) => ({ fromEmail: { endsWith: `@${d}` } })),
    },
    _count: { _all: true },
    _max: { sentAt: true },
    orderBy: [{ _count: { fromEmail: "desc" } }],
  })

  const actionable = grouped.filter(
    (g) => !dismissedSet.has(g.fromEmail) && !isAutomatedEmail(g.fromEmail)
  )

  // Also look for senders that match by company name in a broader search
  // (in case the company email domain doesn't match neatly)
  const senders = await Promise.all(
    actionable.map(async (g) => {
      const latest = await prisma.emailMessage.findFirst({
        where: { userId, fromEmail: g.fromEmail, isOutbound: false },
        orderBy: { sentAt: "desc" },
        select: { fromName: true },
      })

      // Find existing contacts at this company for quick-match suggestions
      let suggestions: { contactId: string; name: string }[] = []
      if (latest?.fromName) {
        const parts = latest.fromName.trim().split(/\s+/)
        if (parts.length >= 2) {
          const nameMatches = await prisma.contact.findMany({
            where: {
              userId,
              OR: [
                { firstName: { contains: parts[0], mode: "insensitive" }, lastName: { contains: parts[parts.length - 1], mode: "insensitive" } },
                { firstName: { contains: parts[parts.length - 1], mode: "insensitive" }, lastName: { contains: parts[0], mode: "insensitive" } },
              ],
            },
            select: { id: true, firstName: true, lastName: true },
            take: 3,
          })
          suggestions = nameMatches.map((c) => ({ contactId: c.id, name: `${c.firstName} ${c.lastName}` }))
        }
      }
      if (suggestions.length === 0) {
        // Suggest contacts at same company
        const companyContacts = await prisma.contact.findMany({
          where: { userId, company: companyName },
          select: { id: true, firstName: true, lastName: true },
          take: 5,
        })
        suggestions = companyContacts.map((c) => ({ contactId: c.id, name: `${c.firstName} ${c.lastName}` }))
      }

      return {
        fromEmail: g.fromEmail,
        fromName: latest?.fromName ?? null,
        messageCount: g._count._all,
        lastSeen: g._max.sentAt?.toISOString() ?? null,
        suggestions,
      }
    })
  )

  return Response.json({ senders })
}
