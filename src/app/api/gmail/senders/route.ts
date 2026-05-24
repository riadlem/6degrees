// GET /api/gmail/senders?q=<query>
// Searches ALL email senders (matched + unmatched) for the ContactDetail link-email widget.
// Unlike /api/gmail/unmatched, this returns senders whose emails are already linked to a
// contact, so contacts like Remy can be found even if all their emails are auto-matched.

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return Response.json({ senders: [] })

  const ql = q.toLowerCase()

  // Find all unique fromEmails where the email or fromName matches the query
  // We search ALL messages (contactId can be null or non-null)
  const byEmail = await prisma.emailMessage.findMany({
    where: {
      userId,
      isOutbound: false,
      fromEmail: { contains: q, mode: "insensitive" },
    },
    select: { fromEmail: true, fromName: true, contactId: true },
    distinct: ["fromEmail"],
    take: 20,
  })

  const byName = await prisma.emailMessage.findMany({
    where: {
      userId,
      isOutbound: false,
      fromName: { contains: q, mode: "insensitive" },
    },
    select: { fromEmail: true, fromName: true, contactId: true },
    distinct: ["fromEmail"],
    take: 20,
  })

  // Merge and deduplicate
  const seen = new Map<string, { fromEmail: string; fromName: string | null; contactId: string | null }>()
  for (const r of [...byEmail, ...byName]) {
    if (!seen.has(r.fromEmail)) {
      seen.set(r.fromEmail, r)
    }
  }

  // For each unique sender, get message count and look up linked contact name
  const results = await Promise.all(
    Array.from(seen.values())
      .filter((s) => {
        // Re-check: fromEmail or fromName contains query (case-insensitive)
        return s.fromEmail.toLowerCase().includes(ql) ||
          (s.fromName?.toLowerCase().includes(ql) ?? false)
      })
      .slice(0, 8)
      .map(async (s) => {
        const count = await prisma.emailMessage.count({
          where: { userId, fromEmail: s.fromEmail, isOutbound: false },
        })

        // Get the most recent fromName for this email
        const latest = await prisma.emailMessage.findFirst({
          where: { userId, fromEmail: s.fromEmail, isOutbound: false },
          orderBy: { sentAt: "desc" },
          select: { fromName: true },
        })

        // Check if this email is already linked (to any contact)
        const linked = await prisma.emailMessage.findFirst({
          where: { userId, fromEmail: s.fromEmail, contactId: { not: null } },
          select: { contactId: true },
        })

        let linkedContactName: string | null = null
        if (linked?.contactId) {
          const c = await prisma.contact.findFirst({
            where: { id: linked.contactId },
            select: { firstName: true, lastName: true },
          })
          if (c) linkedContactName = `${c.firstName} ${c.lastName}`.trim()
        }

        return {
          fromEmail: s.fromEmail,
          fromName: latest?.fromName ?? s.fromName ?? null,
          messageCount: count,
          alreadyLinked: !!linked?.contactId,
          linkedContactId: linked?.contactId ?? null,
          linkedContactName,
        }
      })
  )

  return Response.json({ senders: results })
}
