import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { buildSegmentWhere, type SegmentDef } from "@/lib/segment-executor"

// ── Selects per level ─────────────────────────────────────────────────────────

const SELECT_L1 = {
  id: true, firstName: true, lastName: true,
  position: true, company: true, country: true,
  profileUrl: true, photoUrl: true, commonConnections: true,
} as const

const SELECT_L2 = {
  ...SELECT_L1,
  emailAddress: true, phoneNumber: true, phones: true,
} as const

const SELECT_L3 = {
  ...SELECT_L2,
  interactionScore: true, lastInteractionAt: true,
} as const

function selectForLevel(level: number) {
  if (level >= 3) return SELECT_L3
  if (level >= 2) return SELECT_L2
  return SELECT_L1
}

// ── Resolve contacts from share ───────────────────────────────────────────────

async function resolveContacts(share: { userId: string; filterType: string; filterValue: string; level: number }) {
  const sel = selectForLevel(share.level)
  const orderBy = [{ firstName: "asc" as const }, { lastName: "asc" as const }]

  if (share.filterType === "ids") {
    const ids: string[] = JSON.parse(share.filterValue)
    return prisma.contact.findMany({
      where: { id: { in: ids }, userId: share.userId },
      select: sel,
      orderBy,
    })
  }

  if (share.filterType === "company") {
    const company = share.filterValue
    return prisma.contact.findMany({
      where: { userId: share.userId, company: { equals: company, mode: "insensitive" } },
      select: sel,
      orderBy,
    })
  }

  if (share.filterType === "segment") {
    const def = JSON.parse(share.filterValue) as SegmentDef
    const where = await buildSegmentWhere(share.userId, def)
    return prisma.contact.findMany({ where, select: sel, orderBy })
  }

  return []
}

// ── GET — public data ─────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const share = await prisma.contactShare.findFirst({
    where: { token: params.token, enabled: true },
    select: { userId: true, name: true, level: true, filterType: true, filterValue: true },
  })
  if (!share) return new Response("Not found", { status: 404 })

  const owner = await prisma.user.findUnique({
    where: { id: share.userId },
    select: { name: true },
  })

  const rawContacts = await resolveContacts(share)

  // Level 3: fetch per-channel last interaction dates
  let channelDates: Record<string, { lastEmailAt: Date | null; lastWaAt: Date | null; lastLiAt: Date | null }> = {}
  if (share.level >= 3 && rawContacts.length > 0) {
    const ids = rawContacts.map((c) => c.id)
    const [emails, was, lis] = await Promise.all([
      prisma.emailMessage.findMany({
        where: { contactId: { in: ids } },
        orderBy: { sentAt: "desc" },
        distinct: ["contactId"],
        select: { contactId: true, sentAt: true },
      }),
      prisma.whatsAppMessage.findMany({
        where: { contactId: { in: ids } },
        orderBy: { sentAt: "desc" },
        distinct: ["contactId"],
        select: { contactId: true, sentAt: true },
      }),
      prisma.linkedInDMMessage.findMany({
        where: { contactId: { in: ids } },
        orderBy: { sentAt: "desc" },
        distinct: ["contactId"],
        select: { contactId: true, sentAt: true },
      }),
    ])
    for (const id of ids) {
      channelDates[id] = {
        lastEmailAt: emails.find((e) => e.contactId === id)?.sentAt ?? null,
        lastWaAt:    was.find((w) => w.contactId === id)?.sentAt ?? null,
        lastLiAt:    lis.find((l) => l.contactId === id)?.sentAt ?? null,
      }
    }
  }

  const contacts = rawContacts.map((c) => ({
    ...c,
    ...(share.level >= 3 ? channelDates[c.id] ?? { lastEmailAt: null, lastWaAt: null, lastLiAt: null } : {}),
  }))

  return Response.json({
    name: share.name,
    ownerName: owner?.name ?? "Unknown",
    level: share.level,
    filterType: share.filterType,
    contactCount: contacts.length,
    contacts,
  })
}

// ── PATCH — toggle enabled (owner only) ──────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: { token: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const share = await prisma.contactShare.findFirst({
    where: { token: params.token, userId: session.user.id },
  })
  if (!share) return new Response("Not found", { status: 404 })

  const { enabled } = await req.json()
  await prisma.contactShare.update({ where: { id: share.id }, data: { enabled } })
  return Response.json({ ok: true })
}
