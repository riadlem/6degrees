export const maxDuration = 300

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
  getGmailAccessToken,
  fetchMessageList,
  fetchMessageMetadata,
  fetchMessageMinimal,
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
import { getCachedMatchCache, setCachedMatchCache } from "@/lib/match-cache-store"
import { isAutomatedEmail } from "@/lib/email-filters"
import { recomputeScores } from "@/lib/reconnect-score"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const [accounts, gmailSyncs, matchedContacts] = await Promise.all([
    prisma.account.findMany({ where: { userId, provider: "gmail" }, select: { providerAccountId: true } }),
    prisma.gmailSync.findMany({ where: { userId } }),
    prisma.contact.count({ where: { userId, emailAddress: { not: null } } }),
  ])

  // Build per-account status
  const accountStatuses = accounts.map((a) => {
    const sync = gmailSyncs.find((s) => s.gmailEmail === a.providerAccountId)
    return {
      gmailEmail: a.providerAccountId,
      historyId: sync?.historyId ?? null,
      syncedAt: sync?.syncedAt ?? null,
      totalMessages: sync?.totalMessages ?? 0,
    }
  })

  const latestSyncedAt = accountStatuses
    .map((a) => a.syncedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null

  return Response.json({
    connected: accounts.length > 0,
    accounts: accountStatuses,
    // Legacy single-account fields (still used by GmailSyncContext)
    gmailEmail: accountStatuses[0]?.gmailEmail ?? null,
    historyId: accountStatuses[0]?.historyId ?? null,
    syncedAt: latestSyncedAt,
    totalMessages: accountStatuses.reduce((s, a) => s + a.totalMessages, 0),
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
  // force=true is the only way to run a full scan when historyId already exists.
  // All other calls default to incremental if we have a saved historyId.
  const force = searchParams.get("force") === "true"
  const emailParam = searchParams.get("email")

  // Get all gmail accounts (or just the one specified)
  const allAccounts = await prisma.account.findMany({
    where: { userId, provider: "gmail", ...(emailParam ? { providerAccountId: emailParam } : {}) },
    select: { providerAccountId: true },
  })

  if (allAccounts.length === 0) {
    return new Response(
      sseEvent({ type: "error", message: "Gmail not connected" }),
      { headers: { "Content-Type": "text/event-stream" } },
    )
  }

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
        for (const account of allAccounts) {
          const currentEmail = account.providerAccountId

          const token = await getGmailAccessToken(userId, currentEmail)
          if (!token) {
            send({ type: "error", message: `Could not get access token for ${currentEmail}` })
            continue
          }

          const gmailSync = await prisma.gmailSync.findFirst({ where: { userId, gmailEmail: currentEmail } })

          // Bootstrap: if historyId is missing but emails are already indexed,
          // recover the anchor from the newest indexed message (1 API call) rather than
          // re-scanning thousands of messages. force=true bypasses this.
          if (!gmailSync?.historyId && !force) {
            const newestMsg = await prisma.emailMessage.findFirst({
              where: { userId },
              orderBy: { sentAt: "desc" },
              select: { gmailId: true },
            })
            if (newestMsg) {
              send({ type: "status", message: `[${currentEmail}] Anchoring to existing index…` })
              const msgData = await fetchMessageMinimal(token, newestMsg.gmailId)
              if (msgData?.historyId) {
                await prisma.gmailSync.upsert({
                  where: { userId_gmailEmail: { userId, gmailEmail: currentEmail } },
                  update: { historyId: msgData.historyId },
                  create: { userId, gmailEmail: currentEmail, historyId: msgData.historyId },
                })
                const indexed = await prisma.emailMessage.count({ where: { userId } })
                send({ type: "done", mode: "bootstrapped", historyId: msgData.historyId, synced: 0, inserted: 0, failed: 0, scanned: 0, indexed })
                continue
              }
            }
          }

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

          // Persist the profile historyId immediately as an anchor. This guarantees
          // that even if the sync times out or errors mid-way, the next run will use
          // incremental mode and won't re-scan from scratch.
          if (profileHistoryId) {
            await prisma.gmailSync.upsert({
              where: { userId_gmailEmail: { userId, gmailEmail: currentEmail } },
              update: { historyId: profileHistoryId, gmailEmail: primaryEmail || currentEmail },
              create: { userId, gmailEmail: primaryEmail || currentEmail, historyId: profileHistoryId },
            })
          }

          // Use incremental if we have a historyId anchor, unless force=true was passed.
          const useIncremental = !!gmailSync?.historyId && !force

          if (useIncremental) {
            send({ type: "status", message: `[${currentEmail}] Fetching new emails…` })
            let pageToken: string | undefined
            let incrementalHistoryId = gmailSync!.historyId as string
            do {
              const hist = await fetchHistoryList(token, gmailSync!.historyId as string, pageToken)
              if (hist.historyId) incrementalHistoryId = hist.historyId
              for (const entry of hist.history ?? []) {
                for (const added of entry.messagesAdded ?? []) {
                  messageIds.push(added.message.id)
                }
              }
              pageToken = hist.nextPageToken
            } while (pageToken)
            latestHistoryId = incrementalHistoryId

            await prisma.gmailSync.update({ where: { userId_gmailEmail: { userId, gmailEmail: currentEmail } }, data: { historyId: latestHistoryId } })
          } else {
            // Full sync: collect all message IDs first
            send({ type: "status", message: `[${currentEmail}] Fetching email list…` })
            let pageToken: string | undefined
            let total = 0
            do {
              const page = await fetchMessageList(token, pageToken)
              const ids = (page.messages ?? []).map((m) => m.id)
              messageIds.push(...ids)
              total = page.resultSizeEstimate ?? messageIds.length
              pageToken = page.nextPageToken
              send({ type: "status", message: `[${currentEmail}] Found ${messageIds.length} emails…`, total })
            } while (pageToken)
          }

          const total = messageIds.length
          send({ type: "status", message: `[${currentEmail}] Processing ${total} emails…`, total })

          // Preload match cache and known gmailIds to avoid per-message DB round trips.
          // Use the in-process singleton cache to skip the DB rebuild on warm instances.
          send({ type: "status", message: "Loading contact index…" })
          const [cachedOrNull, existingGmailIds] = await Promise.all([
            Promise.resolve(getCachedMatchCache(userId)),
            prisma.emailMessage.findMany({ where: { userId }, select: { gmailId: true } })
              .then((rows) => new Set(rows.map((r) => r.gmailId))),
          ])
          const matchCache = cachedOrNull ?? await buildMatchCache(userId)
          if (!cachedOrNull) setCachedMatchCache(userId, matchCache)

          const baseCount = existingGmailIds.size
          // Tell the UI how many messages are already indexed so the counter starts there
          send({
            type: "status",
            message: `${baseCount.toLocaleString()} already indexed — scanning for new…`,
            baseCount,
            total,
            historyId: latestHistoryId ?? null,
          })

          let synced = 0
          let inserted = 0  // genuinely new messages (not already in DB)
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

                  // Every message response includes historyId — track the highest
                  // seen so we have a reliable incremental-sync anchor even if the
                  // profile call didn't return one.
                  if (msg.historyId) {
                    if (!latestHistoryId || BigInt(msg.historyId) > BigInt(latestHistoryId)) {
                      latestHistoryId = msg.historyId
                    }
                  }

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
                  inserted++; synced++; processed++
                } catch {
                  failed++; processed++
                }
              }),
            )

            send({
              type: "progress",
              synced,
              inserted,
              failed,
              processed,
              total,
              baseCount,
              current: `${(baseCount + inserted).toLocaleString()}`,
            })

            // Periodically persist progress and flush new email mappings
            if (synced > 0 && Math.floor(i / BATCH) % 25 === 0) {
              await Promise.all([
                flushMatchCache(matchCache),
                prisma.gmailSync.upsert({
                  where: { userId_gmailEmail: { userId, gmailEmail: currentEmail } },
                  update: { totalMessages: synced, syncedAt: new Date(), gmailEmail: primaryEmail || currentEmail, ...(latestHistoryId ? { historyId: latestHistoryId } : {}) },
                  create: { userId, gmailEmail: primaryEmail || currentEmail, totalMessages: synced, syncedAt: new Date(), historyId: latestHistoryId ?? undefined },
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

          // If we still have no historyId (e.g. all messages were skipped so none
          // were fetched, and the pre-sync profile call didn't return one), do one
          // final profile call as a guaranteed fallback.
          if (!latestHistoryId) {
            const fallbackProfile = await fetchGmailProfile(token)
            latestHistoryId = fallbackProfile?.historyId ?? undefined
          }

          // Update sync state
          await prisma.gmailSync.upsert({
            where: { userId_gmailEmail: { userId, gmailEmail: currentEmail } },
            update: {
              historyId: latestHistoryId ?? gmailSync?.historyId ?? undefined,
              syncedAt: new Date(),
              totalMessages: synced,
              gmailEmail: primaryEmail || currentEmail,
            },
            create: {
              userId,
              gmailEmail: primaryEmail || currentEmail,
              historyId: latestHistoryId ?? undefined,
              syncedAt: new Date(),
              totalMessages: synced,
            },
          })

          // Persist the updated match cache (it now includes any newly-matched emails)
          setCachedMatchCache(userId, matchCache)

          send({
            type: "done",
            synced,
            inserted,
            failed,
            mode: useIncremental ? "incremental" : "full",
            historyId: latestHistoryId ?? null,
            scanned: total,
          })
        }

        // Recompute interaction scores after all accounts are synced
        send({ type: "status", message: "Computing relationship scores…" })
        await recomputeScores(userId)

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
