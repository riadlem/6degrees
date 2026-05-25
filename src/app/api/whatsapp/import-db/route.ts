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
        send({ type: "status", message: `Matching ${chats.length} chats to contacts…` })

        let totalSynced = 0
        let totalMatched = 0

        // Pre-load already-matched chats in one query so re-imports don't
        // re-run the expensive per-chat matching (4–5 DB queries each).
        const existingMappings = await prisma.whatsAppMessage.findMany({
          where: { userId, contactId: { not: null } },
          select: { chatName: true, contactId: true },
          distinct: ["chatName"],
        })
        const chatContactCache = new Map(
          existingMappings.map((m) => [m.chatName, m.contactId as string])
        )

        // Also pre-load chats that exist but were never matched (contactId = null)
        // so we don't re-run matching for deliberately-unmatched chats either.
        const unmatchedChats = await prisma.whatsAppMessage.findMany({
          where: { userId, contactId: null },
          select: { chatName: true },
          distinct: ["chatName"],
        })
        const unmatchedSet = new Set(unmatchedChats.map((m) => m.chatName))

        for (const chat of chats) {
          // Use cached match if this chat was already imported; only run the
          // expensive matching algorithm for genuinely new (never-seen) chats.
          let contactId: string | null
          if (chatContactCache.has(chat.chatName)) {
            contactId = chatContactCache.get(chat.chatName)!
          } else if (unmatchedSet.has(chat.chatName)) {
            // Previously imported but unmatched — skip re-matching (user can
            // use the manual "Re-match" button on the WhatsApp page instead).
            contactId = null
          } else {
            // New chat: run the full matching pipeline
            send({ type: "status", message: `Matching ${chat.chatName}…` })
            contactId = await matchChatNameToContact(userId, chat.chatName)
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
