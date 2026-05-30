import { notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { buildSegmentWhere, type SegmentDef } from "@/lib/segment-executor"
import ShareView from "./ShareView"

type Props = { params: { token: string } }

export async function generateMetadata({ params }: Props) {
  const share = await prisma.contactShare.findFirst({
    where: { token: params.token, enabled: true },
    select: { name: true, user: { select: { name: true } } },
  })
  if (!share) return { title: "Not found" }
  return {
    title: `${share.name ?? "Shared contacts"} — 6Degrees`,
    description: `A contact list shared by ${share.user.name}`,
  }
}

const SELECT_L1 = {
  id: true, firstName: true, lastName: true,
  position: true, company: true, country: true,
  profileUrl: true, photoUrl: true, commonConnections: true,
} as const

export default async function ContactSharePage({ params }: Props) {
  const share = await prisma.contactShare.findFirst({
    where: { token: params.token, enabled: true },
    include: { user: { select: { name: true } } },
  })
  if (!share) notFound()

  const sel = share.level >= 3
    ? { ...SELECT_L1, emailAddress: true, phoneNumber: true, interactionScore: true, lastInteractionAt: true }
    : share.level >= 2
    ? { ...SELECT_L1, emailAddress: true, phoneNumber: true }
    : SELECT_L1

  const orderBy = [{ firstName: "asc" as const }, { lastName: "asc" as const }]

  type RawContact = {
    id: string; firstName: string; lastName: string; position: string | null; company: string | null;
    country?: string | null; profileUrl?: string | null; photoUrl?: string | null; commonConnections?: number | null;
    emailAddress?: string | null; phoneNumber?: string | null;
    interactionScore?: number | null; lastInteractionAt?: Date | null;
  }

  let rawContacts: RawContact[] = []

  if (share.filterType === "ids") {
    const ids: string[] = JSON.parse(share.filterValue)
    rawContacts = await prisma.contact.findMany({ where: { id: { in: ids }, userId: share.userId }, select: sel, orderBy }) as RawContact[]
  } else if (share.filterType === "company") {
    rawContacts = await prisma.contact.findMany({ where: { userId: share.userId, company: { equals: share.filterValue, mode: "insensitive" } }, select: sel, orderBy }) as RawContact[]
  } else if (share.filterType === "segment") {
    try {
      const def = JSON.parse(share.filterValue) as SegmentDef
      const where = await buildSegmentWhere(share.userId, def)
      rawContacts = await prisma.contact.findMany({ where, select: sel, orderBy }) as RawContact[]
    } catch {
      rawContacts = []
    }
  }

  // Level 3: enrich with per-channel last dates
  let contacts = rawContacts.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    position: c.position ?? null,
    company: c.company ?? null,
    country: c.country ?? null,
    profileUrl: c.profileUrl ?? null,
    photoUrl: c.photoUrl ?? null,
    commonConnections: c.commonConnections ?? null,
    emailAddress: c.emailAddress ?? null,
    phoneNumber: c.phoneNumber ?? null,
    interactionScore: c.interactionScore ?? null,
    lastInteractionAt: c.lastInteractionAt?.toISOString() ?? null,
    lastEmailAt: null as string | null,
    lastWaAt: null as string | null,
    lastLiAt: null as string | null,
  }))

  if (share.level >= 3 && contacts.length > 0) {
    const ids = contacts.map((c) => c.id)
    const [emails, was, lis] = await Promise.all([
      prisma.emailMessage.findMany({ where: { contactId: { in: ids } }, orderBy: { sentAt: "desc" }, distinct: ["contactId"], select: { contactId: true, sentAt: true } }),
      prisma.whatsAppMessage.findMany({ where: { contactId: { in: ids } }, orderBy: { sentAt: "desc" }, distinct: ["contactId"], select: { contactId: true, sentAt: true } }),
      prisma.linkedInDMMessage.findMany({ where: { contactId: { in: ids } }, orderBy: { sentAt: "desc" }, distinct: ["contactId"], select: { contactId: true, sentAt: true } }),
    ])
    contacts = contacts.map((c) => ({
      ...c,
      lastEmailAt: emails.find((e) => e.contactId === c.id)?.sentAt.toISOString() ?? null,
      lastWaAt:    was.find((w) => w.contactId === c.id)?.sentAt.toISOString() ?? null,
      lastLiAt:    lis.find((l) => l.contactId === c.id)?.sentAt.toISOString() ?? null,
    }))
  }

  return (
    <ShareView
      token={params.token}
      name={share.name}
      ownerName={share.user.name ?? "Unknown"}
      level={share.level}
      contacts={contacts}
    />
  )
}
