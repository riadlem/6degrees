import prisma from "@/lib/prisma"
import { buildSegmentWhere, type SegmentDef } from "@/lib/segment-executor"
import { generateVcf, type ContactForVcf } from "@/lib/vcf-generator"

async function resolveContacts(share: {
  userId: string; filterType: string; filterValue: string; level: number
}): Promise<ContactForVcf[]> {
  const sel = {
    firstName: true, lastName: true, position: true, company: true,
    country: true, profileUrl: true, photoUrl: true,
    emailAddress: share.level >= 2, phoneNumber: share.level >= 2, phones: share.level >= 2,
  }
  const orderBy = [{ firstName: "asc" as const }, { lastName: "asc" as const }]

  if (share.filterType === "ids") {
    const ids: string[] = JSON.parse(share.filterValue)
    return (await prisma.contact.findMany({ where: { id: { in: ids }, userId: share.userId }, select: sel, orderBy })) as ContactForVcf[]
  }
  if (share.filterType === "company") {
    return (await prisma.contact.findMany({ where: { userId: share.userId, company: { equals: share.filterValue, mode: "insensitive" } }, select: sel, orderBy })) as ContactForVcf[]
  }
  if (share.filterType === "segment") {
    const def = JSON.parse(share.filterValue) as SegmentDef
    const where = await buildSegmentWhere(share.userId, def)
    return (await prisma.contact.findMany({ where, select: sel, orderBy })) as ContactForVcf[]
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

  const contacts = await resolveContacts(share)
  const vcf = generateVcf(contacts, share.level)
  const filename = (share.name ?? "contacts").replace(/[^a-z0-9]/gi, "_") + ".vcf"

  return new Response(vcf, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
