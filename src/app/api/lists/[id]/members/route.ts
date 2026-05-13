import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const list = await prisma.contactList.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!list) return new Response("Not found", { status: 404 })

  const { contactIds } = await request.json() as { contactIds: string[] }
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return Response.json({ error: "contactIds array required" }, { status: 400 })
  }

  // Verify all contacts belong to this user
  const validContacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, userId: session.user.id },
    select: { id: true },
  })
  const validIds = validContacts.map((c) => c.id)

  await prisma.contactListMember.createMany({
    data: validIds.map((contactId) => ({ listId: params.id, contactId })),
    skipDuplicates: true,
  })

  return Response.json({ added: validIds.length })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const list = await prisma.contactList.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!list) return new Response("Not found", { status: 404 })

  const { contactId } = await request.json()
  await prisma.contactListMember.deleteMany({
    where: { listId: params.id, contactId },
  })
  return Response.json({ ok: true })
}
