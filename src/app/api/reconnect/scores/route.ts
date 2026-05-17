import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { recomputeScores } from "@/lib/reconnect-score"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  await recomputeScores(session.user.id)
  return Response.json({ ok: true })
}
