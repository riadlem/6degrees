import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { recomputeScores } from "@/lib/reconnect-score"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }
      try {
        await recomputeScores(userId, {
          onProgress: (done, total) => send({ done, total }),
        })
        send({ ok: true })
      } catch {
        send({ error: true })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
