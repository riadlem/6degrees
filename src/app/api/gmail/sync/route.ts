import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
  getGmailAccessToken,
  fetchMessageList,
  fetchMessageMetadata,
  fetchGmailProfile,
  fetchHistoryList,
  parseMessageHeaders,
  normalizeEmail,
} from "@/lib/gmail"
import { matchEmailToContact, recordMatchedEmail } from "@/lib/gmail-match"
import { recomputeScores } from "@/lib/reconnect-score"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const gmailSync = await prisma.gmailSync.findUnique({ where: { userId: session.user.id } })
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "gmail" },
    select: { providerAccountId: true },
  })

  return Response.json({
    connected: !!account,
    gmailEmail: gmailSync?.gmailEmail ?? account?.providerAccountId ?? null,
    historyId: gmailSync?.historyId ?? null,
    syncedAt: gmailSync?.syncedAt ?? null,
    totalMessages: gmailSync?.totalMessages ?? 0,
  })
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const incremental = searchParams.get("incremental") === "true"

  const token = await getGmailAccessToken(userId)
  if (!token) {
    return new Response(
      sseEvent({ type: "error", message: "Gmail not connected" }),
      { headers: { "Content-Type": "text/event-stream" } },
    )
  }

  const gmailSync = await prisma.gmailSync.findUnique({ where: { userId } })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        controller.enqueue(encoder.encode(sseEvent(data)))
      }

      let keepaliveTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"))
      }, 20_000)

      function cleanup() {
        if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null }
      }

      try {
        // Fetch user's own Gmail address for outbound detection
        const profile = await fetchGmailProfile(token)
        const userEmail = profile?.emailAddress ?? gmailSync?.gmailEmail ?? ""

        let messageIds: string[] = []

        if (incremental && gmailSync?.historyId) {
          send({ type: "status", message: "Fetching new emails…" })
          let pageToken: string | undefined
          let latestHistoryId = gmailSync.historyId
          do {
            const hist = await fetchHistoryList(token, gmailSync.historyId, pageToken)
            if (hist.historyId) latestHistoryId = hist.historyId
            for (const entry of hist.history ?? []) {
              for (const added of entry.messagesAdded ?? []) {
                messageIds.push(added.message.id)
              }
            }
            pageToken = hist.nextPageToken
          } while (pageToken)

          await prisma.gmailSync.update({ where: { userId }, data: { historyId: latestHistoryId } })
        } else {
          // Full sync: collect all message IDs first
          send({ type: "status", message: "Fetching email list…" })
          let pageToken: string | undefined
          let total = 0
          do {
            const page = await fetchMessageList(token, pageToken)
            const ids = (page.messages ?? []).map((m) => m.id)
            messageIds.push(...ids)
            total = page.resultSizeEstimate ?? messageIds.length
            pageToken = page.nextPageToken
            send({ type: "status", message: `Found ${messageIds.length} emails…`, total })
          } while (pageToken)
        }

        const total = messageIds.length
        send({ type: "status", message: `Processing ${total} emails…`, total })

        let synced = 0
        let failed = 0
        let latestHistoryId: string | undefined

        // Process in batches of 10 to respect rate limits
        const BATCH = 10
        for (let i = 0; i < messageIds.length; i += BATCH) {
          const batch = messageIds.slice(i, i + BATCH)
          await Promise.all(
            batch.map(async (id) => {
              try {
                // Check if already synced
                const existing = await prisma.emailMessage.findUnique({
                  where: { userId_gmailId: { userId, gmailId: id } },
                  select: { id: true },
                })
                if (existing) { synced++; return }

                const msg = await fetchMessageMetadata(token, id)
                if (!msg) { failed++; return }

                const parsed = parseMessageHeaders(msg as Parameters<typeof parseMessageHeaders>[0], userEmail)
                if (!parsed) { failed++; return }

                // Match to contact
                const contactId = await matchEmailToContact(
                  userId,
                  parsed.fromEmail,
                  parsed.fromName,
                  parsed.toEmails,
                  parsed.isOutbound,
                )

                await prisma.emailMessage.upsert({
                  where: { userId_gmailId: { userId, gmailId: parsed.gmailId } },
                  update: { contactId },
                  create: {
                    userId,
                    gmailId: parsed.gmailId,
                    threadId: parsed.threadId,
                    subject: parsed.subject,
                    fromEmail: parsed.fromEmail,
                    fromName: parsed.fromName,
                    toEmails: parsed.toEmails,
                    sentAt: parsed.sentAt,
                    isOutbound: parsed.isOutbound,
                    contactId,
                  },
                })

                if (contactId) {
                  const relevantEmail = parsed.isOutbound
                    ? parsed.toEmails[0]
                    : parsed.fromEmail
                  if (relevantEmail) {
                    await recordMatchedEmail(
                      contactId,
                      normalizeEmail(relevantEmail),
                      parsed.isOutbound ? "gmail_to" : "gmail_from",
                    )
                  }
                }

                synced++
              } catch {
                failed++
              }
            }),
          )

          send({
            type: "progress",
            synced,
            failed,
            total,
            current: `${synced} of ${total}`,
          })

          // Small delay between batches to stay within Gmail quota
          if (i + BATCH < messageIds.length) {
            await new Promise((r) => setTimeout(r, 100))
          }
        }

        // Update sync state
        await prisma.gmailSync.upsert({
          where: { userId },
          update: {
            historyId: latestHistoryId ?? gmailSync?.historyId ?? undefined,
            syncedAt: new Date(),
            totalMessages: synced,
            gmailEmail: userEmail || undefined,
          },
          create: {
            userId,
            historyId: latestHistoryId ?? undefined,
            syncedAt: new Date(),
            totalMessages: synced,
            gmailEmail: userEmail || undefined,
          },
        })

        // Recompute interaction scores
        send({ type: "status", message: "Computing relationship scores…" })
        await recomputeScores(userId)

        send({ type: "done", synced, failed })
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Sync failed" })
      } finally {
        cleanup()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
