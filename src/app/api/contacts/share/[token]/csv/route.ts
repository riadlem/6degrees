import prisma from "@/lib/prisma"
import { buildSegmentWhere, type SegmentDef } from "@/lib/segment-executor"

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return ""
  const s = String(v)
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",")
}

async function resolveContacts(share: {
  userId: string; filterType: string; filterValue: string; level: number
}) {
  const sel = {
    id: true, firstName: true, lastName: true, position: true, company: true,
    country: true, profileUrl: true, commonConnections: true,
    emailAddress: share.level >= 2, phoneNumber: share.level >= 2,
    interactionScore: share.level >= 3, lastInteractionAt: share.level >= 3,
  }
  const orderBy = [{ firstName: "asc" as const }, { lastName: "asc" as const }]

  if (share.filterType === "ids") {
    const ids: string[] = JSON.parse(share.filterValue)
    return prisma.contact.findMany({ where: { id: { in: ids }, userId: share.userId }, select: sel, orderBy })
  }
  if (share.filterType === "company") {
    return prisma.contact.findMany({ where: { userId: share.userId, company: { equals: share.filterValue, mode: "insensitive" } }, select: sel, orderBy })
  }
  if (share.filterType === "segment") {
    const def = JSON.parse(share.filterValue) as SegmentDef
    const where = await buildSegmentWhere(share.userId, def)
    return prisma.contact.findMany({ where, select: sel, orderBy })
  }
  return []
}

export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const share = await prisma.contactShare.findFirst({
    where: { token: params.token, enabled: true },
    select: { userId: true, name: true, level: true, filterType: true, filterValue: true },
  })
  if (!share) return new Response("Not found", { status: 404 })

  const rawContacts = await resolveContacts(share)

  type ContactRow = typeof rawContacts[number] & {
    lastEmailAt?: Date | null
    lastWaAt?: Date | null
    lastLiAt?: Date | null
  }
  let contacts: ContactRow[] = rawContacts

  if (share.level >= 3 && contacts.length > 0) {
    const ids = contacts.map((c) => c.id)
    const [emails, was, lis] = await Promise.all([
      prisma.emailMessage.findMany({ where: { contactId: { in: ids } }, orderBy: { sentAt: "desc" }, distinct: ["contactId"], select: { contactId: true, sentAt: true } }),
      prisma.whatsAppMessage.findMany({ where: { contactId: { in: ids } }, orderBy: { sentAt: "desc" }, distinct: ["contactId"], select: { contactId: true, sentAt: true } }),
      prisma.linkedInDMMessage.findMany({ where: { contactId: { in: ids } }, orderBy: { sentAt: "desc" }, distinct: ["contactId"], select: { contactId: true, sentAt: true } }),
    ])
    contacts = contacts.map((c) => ({
      ...c,
      lastEmailAt: emails.find((e) => e.contactId === c.id)?.sentAt ?? null,
      lastWaAt:    was.find((w) => w.contactId === c.id)?.sentAt ?? null,
      lastLiAt:    lis.find((l) => l.contactId === c.id)?.sentAt ?? null,
    }))
  }

  const fmtDate = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-GB") : ""

  const L1_HEADERS = ["First Name", "Last Name", "Title", "Company", "Country", "LinkedIn URL", "Mutual Connections"]
  const L2_HEADERS = [...L1_HEADERS, "Email", "Phone"]
  const L3_HEADERS = [...L2_HEADERS, "Interaction Score", "Last Contact", "Last WhatsApp", "Last LinkedIn DM", "Last Email"]

  const headers = share.level >= 3 ? L3_HEADERS : share.level >= 2 ? L2_HEADERS : L1_HEADERS

  const rows = contacts.map((c) => {
    const base = [c.firstName, c.lastName, c.position, c.company, c.country, c.profileUrl, c.commonConnections]
    if (share.level < 2) return base
    const l2 = [...base, (c as {emailAddress?: string | null}).emailAddress, (c as {phoneNumber?: string | null}).phoneNumber]
    if (share.level < 3) return l2
    const r = c as ContactRow
    return [
      ...l2,
      (c as {interactionScore?: number | null}).interactionScore,
      fmtDate((c as {lastInteractionAt?: Date | null}).lastInteractionAt),
      fmtDate(r.lastWaAt),
      fmtDate(r.lastLiAt),
      fmtDate(r.lastEmailAt),
    ]
  })

  const csv = [csvRow(headers), ...rows.map(csvRow)].join("\n")
  const filename = (share.name ?? "contacts").replace(/[^a-z0-9]/gi, "_") + ".csv"

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
