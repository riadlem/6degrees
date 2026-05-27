/**
 * GET /api/contacts/live
 *
 * A persistent Server-Sent Events stream.  The browser opens this once (via
 * EventSource) and keeps it alive.  Whenever the Chrome extension updates a
 * contact for this user the event is forwarded here in real time so the UI can
 * patch its React Query cache without a manual page refresh.
 *
 * Event shapes (JSON in the `data:` field):
 *   { type: "connected" }
 *   { type: "contact_updated", contactId, photoUrl?, firstName?, … }
 *   { type: "contact_created", contactId }
 *   : keepalive   (SSE comment, every 25 s)
 */

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { contactEvents, type ContactLiveEvent } from "@/lib/contact-events"

// Never statically pre-render this route
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const userId = session.user.id
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          /* stream already closed — ignore */
        }
      }

      // Initial handshake so the client knows the connection is live
      send({ type: "connected" })

      // Forward per-user events emitted by extension/enrich
      const handler = (event: ContactLiveEvent) => send(event)
      contactEvents.on(`user:${userId}`, handler)

      // Keep the connection alive through proxies / load balancers
      const keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"))
        } catch {
          clearInterval(keepaliveTimer)
        }
      }, 25_000)

      // Clean up when the browser closes the tab / navigates away
      request.signal.addEventListener("abort", () => {
        contactEvents.off(`user:${userId}`, handler)
        clearInterval(keepaliveTimer)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",   // disable Nginx response buffering
      Connection:      "keep-alive",
    },
  })
}
