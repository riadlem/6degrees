import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await prisma.account.deleteMany({ where: { userId, provider: "gmail" } })
  await prisma.gmailSync.deleteMany({ where: { userId } })

  return Response.json({ ok: true })
}
