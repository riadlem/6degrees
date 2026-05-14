export const maxDuration = 300

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { ensureMemberAuthorization, fetchConnectionsPage, parseLinkedInDate, connectionKey } from "@/lib/linkedin"

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

// SSE comment — keeps Vercel/proxies from closing an idle stream
function sseKeepAlive(): Uint8Array {
  return new TextEncoder().encode(`: keepalive\n\n`)
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { syncCursor: true, syncTotal: true, lastSyncAt: true },
  })

  return Response.json({
    hasResumable: user?.syncCursor != null,
    cursor: user?.syncCursor ?? null,
    total: user?.syncTotal ?? null,
    lastSyncAt: user?.lastSyncAt ?? null,
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "linkedin" },
  })

  if (!account?.access_token) {
    return Response.json({ error: "LinkedIn account not connected" }, { status: 400 })
  }

  const url = new URL(req.url)
  const restart = url.searchParams.get("restart") === "true"

  const userId = session.user.id
  const accessToken = account.access_token

  const userState = await prisma.user.findUnique({
    where: { id: userId },
    select: { syncCursor: true, syncTotal: true },
  })

  const resuming = !restart && userState?.syncCursor != null
  let pageIndex = resuming ? userState!.syncCursor! : 0
  let total = resuming && userState?.syncTotal ? userState.syncTotal : 0
  let synced = pageIndex * 100
  let failed = 0

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(sse(data)) } catch { /* stream already closed */ }
      }
      const ping = () => {
        try { controller.enqueue(sseKeepAlive()) } catch { /* ignore */ }
      }

      // Heartbeat every 20 s so Vercel / CDN don't treat the stream as idle
      const heartbeat = setInterval(ping, 20_000)

      const saveCursor = async (page: number, t: number) => {
        await prisma.user.update({
          where: { id: userId },
          data: { syncCursor: page, syncTotal: t },
        })
      }

      try {
        ping() // immediate first keepalive so the connection is confirmed open

        if (resuming) {
          send({ type: "status", message: `Resuming from ~contact ${synced + 1}…`, total, resumed: true })
        } else {
          send({ type: "status", message: "Authorising with LinkedIn…" })
        }

        await ensureMemberAuthorization(accessToken)

        send({ type: "status", message: resuming ? `Resuming sync…` : "Fetching connections…", total })

        let hasNext = true

        while (hasNext) {
          ping()
          const page = await fetchConnectionsPage(accessToken, pageIndex)

          if (page.connections.length === 0) {
            if (pageIndex === 0) {
              send({
                type: "error",
                message:
                  "LinkedIn returned no connections. Your DMA export may have expired — " +
                  "request a new one at linkedin.com/mypreferences/d/download-my-data and try again in 24 h.",
              })
            } else {
              await prisma.user.update({
                where: { id: userId },
                data: { syncCursor: null, syncTotal: null, lastSyncAt: new Date() },
              })
              send({ type: "done", synced, failed, total: synced + failed })
            }
            return
          }

          total = Math.max(total, page.total || 0, synced + page.connections.length)
          hasNext = page.hasNext

          if (pageIndex === 0 && !resuming) {
            send({ type: "status", message: `Found ${total} connections, syncing…`, total })
          }

          for (let i = 0; i < page.connections.length; i++) {
            const conn = page.connections[i]
            const key = connectionKey(conn)
            try {
              await prisma.contact.upsert({
                where: { userId_linkedinKey: { userId, linkedinKey: key } },
                update: {
                  position: conn["Position"] || null,
                  company: conn["Company"] || null,
                  profileUrl: conn["URL"] || null,
                  syncedAt: new Date(),
                },
                create: {
                  userId,
                  linkedinKey: key,
                  firstName: conn["First Name"],
                  lastName: conn["Last Name"],
                  position: conn["Position"] || null,
                  company: conn["Company"] || null,
                  connectedOn: parseLinkedInDate(conn["Connected On"]),
                  profileUrl: conn["URL"] || null,
                },
              })
              synced++
            } catch {
              failed++
            }
            if ((i + 1) % 10 === 0 || i === page.connections.length - 1) {
              const current = `${conn["First Name"]} ${conn["Last Name"]}`.trim()
              send({ type: "progress", synced, failed, total, current })
            }
          }

          pageIndex++
          // Save cursor AFTER the page is fully written — cursor = next page to fetch.
          // This ensures resume always starts from an unprocessed page rather than
          // re-syncing contacts that were already saved in the previous run.
          await saveCursor(pageIndex, total)
        }

        await prisma.user.update({
          where: { id: userId },
          data: { syncCursor: null, syncTotal: null, lastSyncAt: new Date() },
        })

        send({ type: "done", synced, failed, total })
      } catch (error) {
        // Cursor intentionally kept so user can resume after fixing the issue
        send({ type: "error", message: error instanceof Error ? error.message : String(error) })
      } finally {
        clearInterval(heartbeat)
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
