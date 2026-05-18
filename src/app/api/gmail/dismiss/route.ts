import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { normalizeEmail } from "@/lib/gmail"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : null
  if (!email) return new Response("Missing email", { status: 400 })

  await prisma.dismissedEmail.upsert({
    where: { userId_email: { userId, email } },
    update: {},
    create: { userId, email, reason: body.reason ?? "manual" },
  })

  return Response.json({ ok: true })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : null
  if (!email) return new Response("Missing email", { status: 400 })

  await prisma.dismissedEmail.deleteMany({ where: { userId, email } })

  return Response.json({ ok: true })
}
