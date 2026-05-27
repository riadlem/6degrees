import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { executeSegment } from "@/lib/segment-executor"

// Re-export SegmentRule so existing consumers (SegmentBuilder) keep working.
export type { SegmentRule } from "@/lib/segment-executor"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json()
  const { combinator = "AND", rules = [] } = body

  const { ids, total } = await executeSegment(session.user.id, { combinator, rules })
  return Response.json({ ids, total })
}
