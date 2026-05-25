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

        // ── Phase 1: pre-load existing matches in one query each ────────────
        // Re-imports skip the expensive per-chat matching pipeline entirely.
        const [existingMappings, unmatchedRows] = await Promise.all([
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
        ])

        const chatContactCache = new Map(
          existingMappings.map((m) => [m.chatName, m.contactId as string])
        )
        const unmatchedSet = new Set(unmatchedRows.map((m) => m.chatName))

        // ── Phase 2: match NEW chats in parallel batches ─────────────────────
        // Only chats not yet in the DB need the matching pipeline.
        // Batch concurrency = 4 keeps DB connection pressure manageable.
        const newChatNames = chats
          .map((c) => c.chatName)
          .filter((name) => !chatContactCache.has(name) && !unmatchedSet.has(name))

        const freshMatches = new Map<string, string | null>()

        if (newChatNames.length > 0) {
          send({ type: "status", message: `Matching ${newChatNames.length} new contact${newChatNames.length !== 1 ? "s" : ""}…` })
          const MATCH_CONCURRENCY = 4
          for (let i = 0; i < newChatNames.length; i += MATCH_CONCURRENCY) {
            const batch = newChatNames.slice(i, i + MATCH_CONCURRENCY)
            // Show which names are being processed in this batch
            send({ type: "status", message: `Matching: ${batch.join(", ")}…` })
            const results = await Promise.all(
              batch.map((name) => matchChatNameToContact(userId, name))
            )
            batch.forEach((name, j) => freshMatches.set(name, results[j]))
          }
        }

        // ── Phase 3: insert messages for each chat ───────────────────────────
        let totalSynced = 0
        let totalMatched = 0

        for (const chat of chats) {
          let contactId: string | null
          if (chatContactCache.has(chat.chatName)) {
            contactId = chatContactCache.get(chat.chatName)!
          } else if (freshMatches.has(chat.chatName)) {
            contactId = freshMatches.get(chat.chatName) ?? null
          } else {
            // Previously unmatched — skip re-matching (use Re-match button)
            contactId = null
          }
          if (contactId) totalMatched++

          const CHUNK = 200
          let synced = 0
          let skipped = 0
          for (let i = 0; i < chat.messages.length; i += CHUNK) {
            const chunk = chat.messages.slice(i, i + CHUNK)
            const result = await prisma.whatsAppMessage.createMany({
              data: chunk.map(([sentAtMs, isOut]) => ({
                userId,
                contactId: contactId ?? null,
                chatName: chat.chatName,
                sentAt: new Date(sentAtMs),
                isOutbound: isOut === 1,
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
            matched: !!contactId,
            messages: chat.messages.length,
            synced,
            skipped,
          })
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
