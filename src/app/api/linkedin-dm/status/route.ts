import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const sync = await prisma.linkedInDMSync.findUnique({ where: { userId: session.user.id } })

  return Response.json({
    importedAt: sync?.importedAt ?? null,
    totalMessages: sync?.totalMessages ?? 0,
    totalChats: sync?.totalChats ?? 0,
  })
}
