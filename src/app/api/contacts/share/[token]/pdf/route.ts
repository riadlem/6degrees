import prisma from "@/lib/prisma"
import { buildSegmentWhere, type SegmentDef } from "@/lib/segment-executor"
import { renderSharePdf, type ContactForPdf } from "@/lib/contacts-share-pdf"

async function resolveContacts(share: {
  userId: string; filterType: string; filterValue: string; level: number
}): Promise<ContactForPdf[]> {
  const sel = {
    id: true, firstName: true, lastName: true,
    position: true, company: true, country: true, profileUrl: true,
    emailAddress: share.level >= 2, phoneNumber: share.level >= 2,
    interactionScore: share.level >= 3, lastInteractionAt: share.level >= 3,
  }
  const orderBy = [{ firstName: "asc" as const }, { lastName: "asc" as const }]

  let contacts: ContactForPdf[]

  if (share.filterType === "ids") {
    const ids: string[] = JSON.parse(share.filterValue)
    contacts = (await prisma.contact.findMany({ where: { id: { in: ids }, userId: share.userId }, select: sel, orderBy })) as ContactForPdf[]
  } else if (share.filterType === "company") {
    contacts = (await prisma.contact.findMany({ where: { userId: share.userId, company: { equals: share.filterValue, mode: "insensitive" } }, select: sel, orderBy })) as ContactForPdf[]
  } else if (share.filterType === "segment") {
    const def = JSON.parse(share.filterValue) as SegmentDef
    const where = await buildSegmentWhere(share.userId, def)
    contacts = (await prisma.contact.findMany({ where, select: sel, orderBy })) as ContactForPdf[]
  } else {
    contacts = []
  }

  if (share.level >= 3 && contacts.length > 0) {
    const ids = contacts.map((c) => c.id!)
    const [emails, was, lis] = await Promise.all([
      prisma.emailMessage.findMany({ where: { contactId: { in: ids } }, orderBy: { sentAt: "desc" }, distinct: ["contactId"], select: { contactId: true, sentAt: true } }),
      prisma.whatsAppMessage.findMany({ where: { contactId: { in: ids } }, orderBy: { sentAt: "desc" }, distinct: ["contactId"], select: { contactId: true, sentAt: true } }),
      prisma.linkedInDMMessage.findMany({ where: { contactId: { in: ids } }, orderBy: { sentAt: "desc" }, distinct: ["contactId"], select: { contactId: true, sentAt: true } }),
    ])
    contacts = contacts.map((c) => ({
      ...c,
      lastEmailAt: emails.find((e) => e.contactId === c.id)?.sentAt?.toISOString() ?? null,
      lastWaAt:    was.find((w) => w.contactId === c.id)?.sentAt?.toISOString() ?? null,
      lastLiAt:    lis.find((l) => l.contactId === c.id)?.sentAt?.toISOString() ?? null,
    }))
  }

  return contacts
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

  const owner = await prisma.user.findUnique({ where: { id: share.userId }, select: { name: true } })
  const contacts = await resolveContacts(share)

  const buffer = await renderSharePdf(contacts, share.name, owner?.name ?? "Unknown", share.level)
  const filename = (share.name ?? "contacts").replace(/[^a-z0-9]/gi, "_") + ".pdf"

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
