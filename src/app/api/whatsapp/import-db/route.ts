import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { matchChatNameToContact } from "@/lib/whatsapp-match"
import { recomputeScores } from "@/lib/reconnect-score"

export const maxDuration = 300

// The client parses ChatStorage.sqlite in the browser using sql.js (WASM)
// and sends only the extracted message rows as compact JSON.
// This bypasses the 4.5 MB Vercel body limit — the full DB (100–500 MB)
// never leaves the browser.
type ChatPayload = {
  chatName: string
  phone: string | null          // E.164 number from ZCONTACTJID, e.g. "+33612345678"
  messages: [number, number][]  // [sentAtMs, isOutbound 0|1]
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  let body: { chats: ChatPayload[] }
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }

  const { chats } = body
  if (!Array.isArray(chats) || chats.length === 0) {
    return new Response("chats array is required", { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        controller.enqueue(encoder.encode(sseEvent(data)))
      }

      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"))
      }, 20_000)

      try {
        send({ type: "status", message: `Processing ${chats.length} chats…` })

        // Ensure phone column exists (added after initial schema; idempotent)
        await prisma.$executeRaw`
          ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "phone" TEXT
        `.catch(() => {})

        // ── Phase 1: pre-load existing state in parallel ─────────────────────
        // Three queries run simultaneously:
        //   a) chatName → contactId for already-matched chats
        //   b) chatNames that were previously unmatched
        //   c) existing message count per chat (to skip re-inserts on re-import)
        const [existingMappings, unmatchedRows, countRows] = await Promise.all([
          prisma.whatsAppMessage.findMany({
            where: { userId, contactId: { not: null } },
            select: { chatName: true, contactId: true },
            distinct: ["chatName"],
          }),
          prisma.whatsAppMessage.findMany({
            where: { userId, contactId: null },
            select: { chatName: true },
            distinct: ["chatName"],
          }),
          prisma.$queryRaw<{ chatName: string; cnt: bigint }[]>`
            SELECT "chatName", COUNT(*) AS cnt
            FROM "WhatsAppMessage"
            WHERE "userId" = ${userId}
            GROUP BY "chatName"
          `.catch(() => [] as { chatName: string; cnt: bigint }[]),
        ])

        const chatContactCache = new Map(
          existingMappings.map((m) => [m.chatName, m.contactId as string])
        )
        const unmatchedSet = new Set(unmatchedRows.map((m) => m.chatName))
        const existingCountMap = new Map(
          countRows.map((r) => [r.chatName, Number(r.cnt)])
        )

        // ── Phase 2: match NEW chats in parallel batches of 4 ───────────────
        const newChatNames = chats
          .map((c) => c.chatName)
          .filter((name) => !chatContactCache.has(name) && !unmatchedSet.has(name))

        const freshMatches = new Map<string, string | null>()

        if (newChatNames.length > 0) {
          send({ type: "status", message: `Matching ${newChatNames.length} new contact${newChatNames.length !== 1 ? "s" : ""}…` })
          const MATCH_CONCURRENCY = 4
          for (let i = 0; i < newChatNames.length; i += MATCH_CONCURRENCY) {
            const batch = newChatNames.slice(i, i + MATCH_CONCURRENCY)
            send({ type: "status", message: `Matching: ${batch.join(", ")}…` })
            const results = await Promise.all(
              batch.map((name) => matchChatNameToContact(userId, name))
            )
            batch.forEach((name, j) => freshMatches.set(name, results[j]))
          }
        }

        // ── Phase 3: resolve contactIds + classify chats ─────────────────────
        type ResolvedChat = ChatPayload & { contactId: string | null; alreadyImported: boolean }
        const resolved: ResolvedChat[] = chats.map((chat) => {
          let contactId: string | null
          if (chatContactCache.has(chat.chatName)) {
            contactId = chatContactCache.get(chat.chatName)!
          } else if (freshMatches.has(chat.chatName)) {
            contactId = freshMatches.get(chat.chatName) ?? null
          } else {
            contactId = null
          }
          const existing = existingCountMap.get(chat.chatName) ?? 0
          // Fast-path: skip DB inserts if we already have at least as many rows
          const alreadyImported = existing >= chat.messages.length
          return { ...chat, contactId, alreadyImported }
        })

        let totalSynced = 0
        let totalMatched = resolved.filter((c) => c.contactId).length

        // ── Phase 4: phone backfill — all matched chats with a phone, in // ──
        const phoneUpdates = resolved.filter((c) => c.contactId && c.phone)
        if (phoneUpdates.length > 0) {
          await Promise.all(
            phoneUpdates.map((c) =>
              prisma.contact.updateMany({
                where: { id: c.contactId!, phoneNumber: null },
                data: { phoneNumber: c.phone! },
              }).catch(() => {})
            )
          )
        }

        // ── Phase 5: send instant progress for already-imported chats ────────
        for (const chat of resolved.filter((c) => c.alreadyImported)) {
          send({
            type: "progress",
            file: chat.chatName,
            matched: !!chat.contactId,
            messages: chat.messages.length,
            synced: 0,
            skipped: chat.messages.length,
          })
        }

        // ── Phase 6: insert new messages in parallel batches of 5 ────────────
        const toInsert = resolved.filter((c) => !c.alreadyImported)
        if (toInsert.length > 0) {
          send({ type: "status", message: `Inserting messages for ${toInsert.length} chat${toInsert.length !== 1 ? "s" : ""}…` })
        }

        const INSERT_CONCURRENCY = 5
        for (let i = 0; i < toInsert.length; i += INSERT_CONCURRENCY) {
          const batch = toInsert.slice(i, i + INSERT_CONCURRENCY)
          await Promise.all(
            batch.map(async (chat) => {
              const CHUNK = 200
              let synced = 0
              let skipped = 0
              for (let j = 0; j < chat.messages.length; j += CHUNK) {
                const chunk = chat.messages.slice(j, j + CHUNK)
                const result = await prisma.whatsAppMessage.createMany({
                  data: chunk.map(([sentAtMs, isOut]) => ({
                    userId,
                    contactId: chat.contactId ?? null,
                    chatName: chat.chatName,
                    sentAt: new Date(sentAtMs),
                    isOutbound: isOut === 1,
                    phone: chat.phone ?? null,
                  })),
                  skipDuplicates: true,
                })
                synced += result.count
                skipped += chunk.length - result.count
              }
              totalSynced += synced
              send({
                type: "progress",
                file: chat.chatName,
                matched: !!chat.contactId,
                messages: chat.messages.length,
                synced,
                skipped,
              })
            })
          )
        }

        await prisma.whatsAppSync.upsert({
          where: { userId },
          update: {
            importedAt: new Date(),
            totalMessages: { increment: totalSynced },
            totalChats: { increment: chats.length },
          },
          create: {
            userId,
            importedAt: new Date(),
            totalMessages: totalSynced,
            totalChats: chats.length,
          },
        })

        // Recompute scores in the background — don't block the SSE stream
        recomputeScores(userId).catch((err) => console.error("recomputeScores failed:", err))

        send({ type: "done", synced: totalSynced, chats: chats.length, matched: totalMatched })
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Import failed" })
      } finally {
        clearInterval(keepalive)
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
