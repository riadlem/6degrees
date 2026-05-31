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

  // Query 1: one raw SQL query to get matching senders with aggregate counts and latest fromName.
  // Uses DISTINCT ON to pick the most-recent fromName per fromEmail in the same pass.
  const rows = await prisma.$queryRaw<
    { fromEmail: string; fromName: string | null; messageCount: bigint; contactId: string | null }[]
  >`
    SELECT
      sub."fromEmail",
      sub."fromName",
      sub."messageCount",
      sub."contactId"
    FROM (
      SELECT
        "fromEmail",
        FIRST_VALUE("fromName") OVER (
          PARTITION BY "fromEmail"
          ORDER BY "sentAt" DESC
        ) AS "fromName",
        COUNT(*) OVER (PARTITION BY "fromEmail") AS "messageCount",
        "contactId",
        ROW_NUMBER() OVER (
          PARTITION BY "fromEmail"
          ORDER BY "sentAt" DESC
        ) AS rn
      FROM "EmailMessage"
      WHERE
        "userId" = ${userId}
        AND "isOutbound" = false
        AND (
          "fromEmail" ILIKE ${'%' + q + '%'}
          OR "fromName" ILIKE ${'%' + q + '%'}
        )
    ) sub
    WHERE sub.rn = 1
    ORDER BY sub."messageCount" DESC
    LIMIT 8
  `

  if (rows.length === 0) return Response.json({ senders: [] })

  const emails = rows.map((r) => r.fromEmail)

  // Query 2: one query to find the linked contactId (and name) for all emails at once.
  // We want the contactId that is NOT null, one per fromEmail.
  const linkedRows = await prisma.$queryRaw<
    { fromEmail: string; contactId: string; firstName: string; lastName: string }[]
  >`
    SELECT DISTINCT ON (em."fromEmail")
      em."fromEmail",
      em."contactId",
      c."firstName",
      c."lastName"
    FROM "EmailMessage" em
    JOIN "Contact" c ON c.id = em."contactId"
    WHERE
      em."userId" = ${userId}
      AND em."fromEmail" = ANY(${emails})
      AND em."contactId" IS NOT NULL
    ORDER BY em."fromEmail", em."sentAt" DESC
  `

  const linkedMap = new Map<string, { contactId: string; name: string }>()
  for (const row of linkedRows) {
    linkedMap.set(row.fromEmail, {
      contactId: row.contactId,
      name: `${row.firstName} ${row.lastName}`.trim(),
    })
  }

  const results = rows.map((r) => {
    const linked = linkedMap.get(r.fromEmail)
    return {
      fromEmail: r.fromEmail,
      fromName: r.fromName ?? null,
      messageCount: Number(r.messageCount),
      alreadyLinked: !!linked,
      linkedContactId: linked?.contactId ?? null,
      linkedContactName: linked?.name ?? null,
    }
  })

  return Response.json({ senders: results })
}
