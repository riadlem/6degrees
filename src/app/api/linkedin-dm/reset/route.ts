import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { recomputeScores } from "@/lib/reconnect-score"

export const maxDuration = 300

/**
 * DELETE /api/linkedin-dm/reset
 * Wipes all LinkedIn DM messages and conversation progress records for the current user,
 * then resets the sync record. Use this before reimporting if dates are wrong.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { count } = await prisma.linkedInDMMessage.deleteMany({ where: { userId } })

  // Also clear per-conversation progress so re-upload is treated as a fresh import
  await prisma.linkedInDMConversation.deleteMany({ where: { userId } })

  await prisma.linkedInDMSync.updateMany({
    where: { userId },
    data: { totalMessages: 0, totalChats: 0, importedAt: null },
  })

  // Recompute scores — with no LinkedIn DM messages, scores will be based on email only
  recomputeScores(userId).catch((err) => console.error("recomputeScores failed:", err))

  return Response.json({ ok: true, deleted: count })
}
