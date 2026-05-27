import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

async function ensureColumns() {
  await prisma.$executeRaw`
    ALTER TABLE "LinkedInDMConversation" ADD COLUMN IF NOT EXISTS "ignored" BOOLEAN NOT NULL DEFAULT FALSE
  `.catch(() => {})
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureColumns()

  const { conversationId } = await req.json() as { conversationId: string }
  if (!conversationId) return Response.json({ error: "conversationId required" }, { status: 400 })

  await prisma.$executeRaw`
    UPDATE "LinkedInDMConversation"
    SET "ignored" = TRUE
    WHERE "userId" = ${userId} AND "conversationId" = ${conversationId}
  `
  return Response.json({ ok: true })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await ensureColumns()

  const { conversationId } = await req.json() as { conversationId: string }
  if (!conversationId) return Response.json({ error: "conversationId required" }, { status: 400 })

  await prisma.$executeRaw`
    UPDATE "LinkedInDMConversation"
    SET "ignored" = FALSE
    WHERE "userId" = ${userId} AND "conversationId" = ${conversationId}
  `
  return Response.json({ ok: true })
}
