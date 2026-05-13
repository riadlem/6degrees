import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  // Verify contact belongs to user
  const contact = await prisma.contact.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const notes = await prisma.contactNote.findMany({
    where: { contactId: params.id },
    orderBy: { createdAt: "desc" },
  })
  return Response.json(notes)
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const { content } = await request.json()
  if (!content?.trim()) {
    return Response.json({ error: "Content required" }, { status: 400 })
  }

  const note = await prisma.contactNote.create({
    data: { contactId: params.id, content: content.trim() },
  })
  return Response.json(note, { status: 201 })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { noteId } = await request.json()
  // Verify ownership via contact
  const note = await prisma.contactNote.findFirst({
    where: { id: noteId, contact: { userId: session.user.id, id: params.id } },
  })
  if (!note) return new Response("Not found", { status: 404 })

  await prisma.contactNote.delete({ where: { id: noteId } })
  return Response.json({ ok: true })
}
