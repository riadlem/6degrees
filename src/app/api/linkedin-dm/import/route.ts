import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { matchLinkedInDMToContact } from "@/lib/linkedin-dm-match"
import { recomputeScores } from "@/lib/reconnect-score"

export const maxDuration = 300

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// Pre-parsed conversation shape sent by the client-side parser in settings/page.tsx.
// The browser parses the CSV fully, strips message bodies, and sends only metadata.
// This avoids Vercel's 4.5 MB body limit regardless of export size.
type ClientConversation = {
  conversationId: string
  chatName: string
  profileUrl: string | null
  messages: Array<{
    sentAt: string       // ISO 8601 date string
    isOutbound: boolean
    senderName: string
  }>
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // Accept JSON body (pre-parsed by client-side parser in settings/page.tsx)
  let conversations: ClientConversation[]
  try {
    const body = await req.json()
    if (!body?.conversations || !Array.isArray(body.conversations)) {
      return new Response("Expected { conversations: [] }", { status: 400 })
    }
    conversations = body.conversations
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
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
        send({ type: "status", message: "Processing LinkedIn DM conversations…" })

        let totalSynced = 0
        let totalChats = 0
        let totalMatched = 0

        for (const conv of conversations) {
          const { conversationId, chatName, profileUrl, messages } = conv
          if (!messages || messages.length === 0) {
            send({ type: "progress", file: chatName, matched: false, messages: 0, synced: 0, skipped: 0 })
            continue
          }

          const contactId = await matchLinkedInDMToContact(userId, chatName, profileUrl ?? null)
          totalChats++
          if (contactId) totalMatched++

          // Upsert messages in chunks of 200
          let synced = 0
          let skipped = 0
          const CHUNK = 200
          for (let i = 0; i < messages.length; i += CHUNK) {
            const chunk = messages.slice(i, i + CHUNK)
            const result = await prisma.linkedInDMMessage.createMany({
              data: chunk.map((m) => ({
                userId,
                contactId: contactId ?? null,
                conversationId,
                chatName,
                profileUrl: profileUrl ?? null,
                sentAt: new Date(m.sentAt),
                isOutbound: m.isOutbound,
                senderName: m.senderName,
              })),
              skipDuplicates: true,
            })
            synced += result.count
            skipped += chunk.length - result.count
          }

          totalSynced += synced
          send({ type: "progress", file: chatName, matched: !!contactId, messages: messages.length, synced, skipped })
        }

        // Update sync record
        await prisma.linkedInDMSync.upsert({
          where: { userId },
          update: {
            importedAt: new Date(),
            totalMessages: { increment: totalSynced },
            totalChats: { increment: totalChats },
          },
          create: { userId, importedAt: new Date(), totalMessages: totalSynced, totalChats },
        })

        // Recompute scores in the background
        recomputeScores(userId).catch((err) => console.error("recomputeScores failed:", err))

        send({ type: "done", synced: totalSynced, chats: totalChats, matched: totalMatched })
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Import failed" })
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
