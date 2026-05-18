import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const contacts = await prisma.contact.findMany({
    where: { userId, outreachStatus: "lkd_pending" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      emailAddress: true,
      company: true,
      outreachUpdatedAt: true,
    },
    orderBy: { outreachUpdatedAt: "desc" },
  })

  return Response.json(contacts)
}

// Mark one or more contacts as done (clears lkd_pending status)
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const { contactId } = body as { contactId?: string }
  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 })

  await prisma.contact.updateMany({
    where: { id: contactId, userId },
    data: { outreachStatus: null, outreachUpdatedAt: null },
  })

  return Response.json({ ok: true })
}
