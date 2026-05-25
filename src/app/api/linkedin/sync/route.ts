export const maxDuration = 300

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { ensureMemberAuthorization, fetchConnectionsPage, parseLinkedInDate, connectionKey } from "@/lib/linkedin"

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function sseKeepAlive(): Uint8Array {
  return new TextEncoder().encode(`: keepalive\n\n`)
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
}

const THIRTY_DAYS_MS    = 30 * 24 * 60 * 60 * 1000
const MIN_SYNC_INTERVAL = 4  * 60 * 60 * 1000   // 4 hours between syncs

/** Random sleep: avoids mechanical page-fetch patterns that trigger LinkedIn bot detection. */
const sleep  = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const jitter = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { syncCursor: true, syncTotal: true, lastSyncAt: true },
  })

  return Response.json({
    hasResumable: (user?.syncCursor ?? 0) > 0,
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
  const resume  = url.searchParams.get("resume")  === "true"
  // Default (no params) = quick sync: fetch newest connections, stop at 30-day cutoff.
  // The LinkedIn DMA API returns connections newest-first, so this is safe and fast.
  const quickSync = !restart && !resume

  const userId = session.user.id
  const accessToken = account.access_token

  const userState = await prisma.user.findUnique({
    where: { id: userId },
    select: { syncCursor: true, syncTotal: true, lastSyncAt: true },
  })

  // Enforce minimum interval for quick syncs to avoid triggering LinkedIn bot detection.
  // Full restart (restart=true) and resume bypasses this — the user explicitly requested it.
  if (quickSync && userState?.lastSyncAt) {
    const elapsed = Date.now() - new Date(userState.lastSyncAt).getTime()
    if (elapsed < MIN_SYNC_INTERVAL) {
      const waitMins = Math.ceil((MIN_SYNC_INTERVAL - elapsed) / 60_000)
      return Response.json(
        { error: `Please wait ${waitMins} more minute${waitMins !== 1 ? "s" : ""} before syncing again.` },
        { status: 429 },
      )
    }
  }

  const resuming = resume && (userState?.syncCursor ?? 0) > 0
  let pageIndex = resuming ? userState!.syncCursor! : 0
  let total     = resuming && userState?.syncTotal ? userState.syncTotal : 0
  let synced    = resuming ? pageIndex * 100 : 0
  let failed    = 0

  // 30-day cutoff for quick sync
  const cutoffDate = quickSync ? new Date(Date.now() - THIRTY_DAYS_MS) : null

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(sse(data)) } catch { /* stream already closed */ }
      }
      const ping = () => {
        try { controller.enqueue(sseKeepAlive()) } catch { /* ignore */ }
      }

      const heartbeat = setInterval(ping, 20_000)

      const saveCursor = async (page: number, t: number) => {
        await prisma.user.update({ where: { id: userId }, data: { syncCursor: page, syncTotal: t } })
      }

      try {
        ping()

        if (quickSync) {
          send({ type: "status", message: "Syncing recent connections (last 30 days)…" })
        } else if (resuming) {
          send({ type: "status", message: `Resuming from ~contact ${synced + 1}…`, total, resumed: true })
        } else {
          send({ type: "status", message: "Authorising with LinkedIn…" })
        }

        await ensureMemberAuthorization(accessToken)

        if (quickSync) {
          send({ type: "status", message: "Fetching recent connections…" })
        } else {
          send({ type: "status", message: resuming ? "Resuming sync…" : "Fetching connections…", total })
          if (!resuming) await saveCursor(0, 0)
        }

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
              if (!quickSync) {
                await prisma.user.update({
                  where: { id: userId },
                  data: { syncCursor: null, syncTotal: null, lastSyncAt: new Date() },
                })
              } else {
                await prisma.user.update({ where: { id: userId }, data: { lastSyncAt: new Date() } })
              }
              send({ type: "done", synced, failed, total: synced + failed, mode: quickSync ? "quick" : "full" })
            }
            return
          }

          total = Math.max(total, page.total || 0, synced + page.connections.length)
          hasNext = page.hasNext

          if (!quickSync && pageIndex === 0 && !resuming) {
            send({ type: "status", message: `Found ${total} connections, syncing…`, total })
          }

          let hitCutoff = false

          for (let i = 0; i < page.connections.length; i++) {
            const conn = page.connections[i]
            if (!conn["First Name"] && !conn["Last Name"]) { synced++; continue }

            // Quick sync: stop when we reach connections older than 30 days.
            // The DMA API returns connections newest-first, so once we hit the cutoff
            // all subsequent connections will also be older — safe to stop entirely.
            if (cutoffDate) {
              const connectedOn = parseLinkedInDate(conn["Connected On"])
              if (connectedOn && connectedOn < cutoffDate) {
                hitCutoff = true
                break
              }
            }

            const key = connectionKey(conn)
            try {
              await prisma.contact.upsert({
                where: { userId_linkedinKey: { userId, linkedinKey: key } },
                update: {
                  position:   conn["Position"]   || null,
                  company:    conn["Company"]     || null,
                  profileUrl: conn["URL"]         || null,
                  syncedAt:   new Date(),
                },
                create: {
                  userId,
                  linkedinKey:  key,
                  firstName:    conn["First Name"],
                  lastName:     conn["Last Name"],
                  position:     conn["Position"]   || null,
                  company:      conn["Company"]     || null,
                  connectedOn:  parseLinkedInDate(conn["Connected On"]),
                  profileUrl:   conn["URL"]         || null,
                },
              })
              synced++
            } catch {
              failed++
            }

            if ((i + 1) % 10 === 0 || i === page.connections.length - 1) {
              const current = `${conn["First Name"]} ${conn["Last Name"]}`.trim()
              send({ type: "progress", synced, failed, total: quickSync ? synced + failed : total, current })
            }
          }

          if (hitCutoff) {
            // Quick sync complete: found the 30-day boundary, no more pages needed
            hasNext = false
          } else {
            pageIndex++
            if (!quickSync) await saveCursor(pageIndex, total)
            // Pace between pages: random 2–5s to avoid mechanical request patterns.
            // This is the primary mitigation against LinkedIn bot detection.
            if (hasNext) await sleep(jitter(2_000, 5_000))
          }
        }

        if (!quickSync) {
          await prisma.user.update({
            where: { id: userId },
            data: { syncCursor: null, syncTotal: null, lastSyncAt: new Date() },
          })
        } else {
          await prisma.user.update({ where: { id: userId }, data: { lastSyncAt: new Date() } })
        }

        send({ type: "done", synced, failed, total: quickSync ? synced + failed : total, mode: quickSync ? "quick" : "full" })
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : String(error) })
      } finally {
        clearInterval(heartbeat)
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
