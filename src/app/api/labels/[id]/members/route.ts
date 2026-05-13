import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

async function getLabel(id: string, userId: string) {
  return prisma.label.findFirst({ where: { id, userId } })
}

// Add contactIds to this label
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const label = await getLabel(params.id, session.user.id)
  if (!label) return new Response("Not found", { status: 404 })

  const { contactIds } = await req.json() as { contactIds: string[] }
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return Response.json({ error: "contactIds required" }, { status: 400 })
  }

  await prisma.contactLabel.createMany({
    data: contactIds.map((contactId) => ({ contactId, labelId: params.id })),
    skipDuplicates: true,
  })

  return Response.json({ ok: true })
}

// Remove contactIds from this label
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const label = await getLabel(params.id, session.user.id)
  if (!label) return new Response("Not found", { status: 404 })

  const { contactIds } = await req.json() as { contactIds: string[] }

  await prisma.contactLabel.deleteMany({
    where: { labelId: params.id, contactId: { in: contactIds } },
  })

  return Response.json({ ok: true })
}
