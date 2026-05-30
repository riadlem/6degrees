import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // Ensure snoozedUntil column exists (may not be in DB yet if migration hasn't run)
  await prisma.$executeRaw`ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3)`

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? ""
  const now = new Date()

  // Build where clause per tab
  // Note: Prisma notIn silently drops NULL rows in SQL — always OR the null case
  const DONE_STATUSES = ["responded", "meeting_booked", "meeting_done", "lkd_pending", "ignored"]

  const where: Prisma.ContactWhereInput = (() => {
    if (status === "lkd_pending") return { userId, outreachStatus: "lkd_pending" }
    if (status === "meeting_booked") return { userId, outreachStatus: "meeting_booked" }
    if (status === "meeting_done") return { userId, outreachStatus: "meeting_done" }
    if (status === "responded") return { userId, outreachStatus: "responded" }
    if (status === "drafted") return { userId, interactionScore: { gt: 0.1 }, outreachStatus: "drafted" }
    if (status === "sent") return { userId, interactionScore: { gt: 0.1 }, outreachStatus: "sent" }
    if (status === "pending_review") return { userId, outreachStatus: "pending_review" }
    if (status === "lapsed") return {
      userId,
      driftScore: { gt: 0.5 },
      OR: [
        { outreachStatus: null },
        { outreachStatus: { notIn: DONE_STATUSES } },
      ],
    }
    if (status === "ignored_list") return { userId, outreachStatus: "ignored" }
    if (status === "not_contacted") return {
      userId,
      OR: [
        // Auto-surfaced by interaction score with no explicit status
        { interactionScore: { gt: 0.1 }, outreachStatus: null },
        // Explicitly pinned to Reconnect (regardless of score)
        { outreachStatus: "not_contacted" },
      ],
    }
    // "All" tab: exclude done + blocked + lkd_pending; always include manually-pinned contacts
    return {
      userId,
      OR: [
        {
          interactionScore: { gt: 0.1 },
          OR: [{ outreachStatus: null }, { outreachStatus: { notIn: DONE_STATUSES } }],
        },
        { outreachStatus: "not_contacted" },
      ],
    }
  })()

  const [rawContacts, blockedCount] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        company: true,
        photoUrl: true,
        emailAddress: true,
        lastInteractionAt: true,
        interactionScore: true,
        driftScore: true,
        outreachStatus: true,
        outreachUpdatedAt: true,
        snoozedUntil: true,
        labels: { select: { label: { select: { id: true, name: true, color: true } } } },
      },
      orderBy: status === "pending_review" || status === "ignored_list"
        ? { outreachUpdatedAt: "desc" }
        : status === "lapsed"
          ? { driftScore: "desc" }
          : { interactionScore: "desc" },
      take: 200,
    }),
    prisma.contact.count({ where: { userId, outreachStatus: "ignored" } }),
  ])

  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

  // Filter out actively snoozed contacts
  let contacts = rawContacts.filter((c) => {
    if (c.snoozedUntil && c.snoozedUntil > now) return false
    return true
  })

  // For "All" tab: deprioritized contacts (within 90 days) go to the bottom
  if (status === "") {
    const normal: typeof contacts = []
    const deprioritized: typeof contacts = []
    for (const c of contacts) {
      const isActive =
        c.outreachStatus === "deprioritized" &&
        c.outreachUpdatedAt != null &&
        now.getTime() - new Date(c.outreachUpdatedAt).getTime() < NINETY_DAYS_MS
      if (isActive) deprioritized.push(c)
      else normal.push(c)
    }
    contacts = [...normal, ...deprioritized]
  }

  return Response.json({
    contacts,
    total: contacts.length,
    blockedCount,
  })
}
