import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { ensureMemberAuthorization, fetchConnectionsPage, parseLinkedInDate, connectionKey } from "@/lib/linkedin"

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
}

// Returns current sync state so the UI can show a "resume" banner.
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

  // Load current sync state
  const userState = await prisma.user.findUnique({
    where: { id: userId },
    select: { syncCursor: true, syncTotal: true },
  })

  const resuming = !restart && userState?.syncCursor != null
  let pageIndex = resuming ? userState!.syncCursor! : 0
  let total = (resuming && userState?.syncTotal) ? userState.syncTotal : 0
  // Approximate how many contacts were processed in prior pages
  let synced = pageIndex * 100
  let failed = 0

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(sse(data)) } catch { /* stream closed */ }
      }

      const saveCursor = async (page: number, t: number) => {
        await prisma.user.update({
          where: { id: userId },
          data: { syncCursor: page, syncTotal: t },
        })
      }

      try {
        await ensureMemberAuthorization(accessToken)

        if (resuming) {
          send({ type: "status", message: `Resuming from contact ~${synced + 1}…`, total, resumed: true })
        } else {
          send({ type: "status", message: "Connecting to LinkedIn…" })
        }

        let hasNext = true

        while (hasNext) {
          // Save cursor BEFORE processing this page so we can resume from it on crash
          await saveCursor(pageIndex, total)

          const page = await fetchConnectionsPage(accessToken, pageIndex)

          if (page.connections.length === 0) break

          // Update total from live response (may change between resumes)
          total = page.total || total
          hasNext = page.hasNext

          if (pageIndex === 0 && !resuming) {
            send({ type: "status", message: `Found ${total} connections, syncing…`, total })
          }

          for (const conn of page.connections) {
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
          }

          send({ type: "progress", synced, failed, total })
          pageIndex++
        }

        // Completed — clear cursor
        await prisma.user.update({
          where: { id: userId },
          data: { syncCursor: null, syncTotal: null, lastSyncAt: new Date() },
        })

        send({ type: "done", synced, failed, total })
      } catch (error) {
        // Keep cursor in DB so user can resume
        send({ type: "error", message: error instanceof Error ? error.message : String(error) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
