export const maxDuration = 300

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
import {
  buildMatchCache,
  matchEmailCached,
  recordMatchedEmailCached,
  flushMatchCache,
} from "@/lib/gmail-match"
import { isAutomatedEmail } from "@/lib/email-filters"
import { recomputeScores } from "@/lib/reconnect-score"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id
  const [gmailSync, account, matchedContacts] = await Promise.all([
    prisma.gmailSync.findUnique({ where: { userId } }),
    prisma.account.findFirst({
      where: { userId, provider: "gmail" },
      select: { providerAccountId: true },
    }),
    prisma.contact.count({ where: { userId, emailAddress: { not: null } } }),
  ])

  return Response.json({
    connected: !!account,
    gmailEmail: gmailSync?.gmailEmail ?? account?.providerAccountId ?? null,
    historyId: gmailSync?.historyId ?? null,
    syncedAt: gmailSync?.syncedAt ?? null,
    totalMessages: gmailSync?.totalMessages ?? 0,
    matchedContacts,
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
        // Fetch user's own Gmail address and current historyId for outbound detection
        // and incremental sync anchoring. We snapshot historyId BEFORE fetching
        // message IDs so any messages that arrive during the sync are included in
        // the next incremental run.
        const profile = await fetchGmailProfile(token)
        const primaryEmail = profile?.emailAddress ?? gmailSync?.gmailEmail ?? ""
        const profileHistoryId = profile?.historyId ?? undefined

        const knownRows = await prisma.userEmailAddress.findMany({ where: { userId }, select: { email: true } })
        const userEmails = knownRows.map((r) => r.email)
        if (primaryEmail && !userEmails.includes(primaryEmail)) userEmails.push(primaryEmail)

        let messageIds: string[] = []
        let latestHistoryId: string | undefined = profileHistoryId

        if (incremental && gmailSync?.historyId) {
          send({ type: "status", message: "Fetching new emails…" })
          let pageToken: string | undefined
          let incrementalHistoryId = gmailSync.historyId
          do {
            const hist = await fetchHistoryList(token, gmailSync.historyId, pageToken)
            if (hist.historyId) incrementalHistoryId = hist.historyId
            for (const entry of hist.history ?? []) {
              for (const added of entry.messagesAdded ?? []) {
                messageIds.push(added.message.id)
              }
            }
            pageToken = hist.nextPageToken
          } while (pageToken)
          latestHistoryId = incrementalHistoryId

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

        // Preload match cache and known gmailIds to avoid per-message DB round trips
        send({ type: "status", message: "Loading contact index…" })
        const [matchCache, existingGmailIds] = await Promise.all([
          buildMatchCache(userId),
          prisma.emailMessage.findMany({ where: { userId }, select: { gmailId: true } })
            .then((rows) => new Set(rows.map((r) => r.gmailId))),
        ])

        let synced = 0
        let failed = 0
        let processed = 0

        // Process in batches of 20 to respect rate limits
        const BATCH = 20
        for (let i = 0; i < messageIds.length; i += BATCH) {
          const batch = messageIds.slice(i, i + BATCH)
          await Promise.all(
            batch.map(async (id) => {
              try {
                // Skip already-synced messages using preloaded set
                if (existingGmailIds.has(id)) { synced++; processed++; return }

                const msg = await fetchMessageMetadata(token, id)
                if (!msg) { failed++; processed++; return }

                const parsed = parseMessageHeaders(msg as Parameters<typeof parseMessageHeaders>[0], userEmails)
                if (!parsed) { failed++; processed++; return }

                // Skip automated/transactional emails — never store them
                const senderEmail = parsed.isOutbound ? (parsed.toEmails[0] ?? "") : parsed.fromEmail
                if (
                  parsed.listUnsubscribe ||
                  (parsed.precedence && ["bulk", "list", "junk"].includes(parsed.precedence)) ||
                  isAutomatedEmail(senderEmail)
                ) {
                  processed++
                  return
                }

                // Match to contact using in-memory cache (no DB queries)
                const contactId = matchEmailCached(
                  matchCache,
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
                  const relevantEmail = parsed.isOutbound ? parsed.toEmails[0] : parsed.fromEmail
                  if (relevantEmail) {
                    recordMatchedEmailCached(
                      matchCache,
                      contactId,
                      relevantEmail,
                      parsed.isOutbound ? "gmail_to" : "gmail_from",
                    )
                  }
                }

                existingGmailIds.add(id)
                synced++; processed++
              } catch {
                failed++; processed++
              }
            }),
          )

          send({
            type: "progress",
            synced,
            failed,
            processed,
            total,
            current: `${processed} of ${total}`,
          })

          // Periodically persist progress and flush new email mappings
          if (synced > 0 && Math.floor(i / BATCH) % 25 === 0) {
            await Promise.all([
              flushMatchCache(matchCache),
              prisma.gmailSync.upsert({
                where: { userId },
                update: { totalMessages: synced, syncedAt: new Date(), gmailEmail: primaryEmail || undefined },
                create: { userId, totalMessages: synced, syncedAt: new Date(), gmailEmail: primaryEmail || undefined },
              }),
            ])
          }

          // Small delay between batches to stay within Gmail quota
          if (i + BATCH < messageIds.length) {
            await new Promise((r) => setTimeout(r, 50))
          }
        }

        // Flush any remaining new email→contact mappings
        await flushMatchCache(matchCache)

        // Update sync state
        await prisma.gmailSync.upsert({
          where: { userId },
          update: {
            historyId: latestHistoryId ?? gmailSync?.historyId ?? undefined,
            syncedAt: new Date(),
            totalMessages: synced,
            gmailEmail: primaryEmail || undefined,
          },
          create: {
            userId,
            historyId: latestHistoryId ?? undefined,
            syncedAt: new Date(),
            totalMessages: synced,
            gmailEmail: primaryEmail || undefined,
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
