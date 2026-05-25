import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { recomputeScores } from "@/lib/reconnect-score"

export const maxDuration = 300

/**
 * DELETE /api/whatsapp/reset
 * Wipes all WhatsApp messages for the current user and resets the sync record.
 * Use this before reimporting if dates are wrong.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { count } = await prisma.whatsAppMessage.deleteMany({ where: { userId } })

  await prisma.whatsAppSync.updateMany({
    where: { userId },
    data: { totalMessages: 0, totalChats: 0, importedAt: null },
  })

  // Recompute scores — with no WA messages, scores will be based on email only
  recomputeScores(userId).catch((err) => console.error("recomputeScores failed:", err))

  return Response.json({ ok: true, deleted: count })
}
