import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: { contactId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const { days } = body as { days?: number }
  if (!days || ![7, 15].includes(days)) {
    return Response.json({ error: "days must be 7 or 15" }, { status: 400 })
  }

  const contact = await prisma.contact.findFirst({
    where: { id: params.contactId, userId },
    select: { id: true },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  // Ensure snoozedUntil column exists (may not be migrated yet)
  await prisma.$executeRaw`ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3)`

  const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  await prisma.$executeRaw`UPDATE "Contact" SET "snoozedUntil" = ${snoozedUntil} WHERE id = ${params.contactId}`

  return Response.json({ snoozedUntil })
}
