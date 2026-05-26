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
        const totalConvs = conversations.length

        // ── Resume support ──────────────────────────────────────────────────────
        // Load the set of conversationIds that were fully imported in a prior run.
        // Conversations in this set are skipped entirely — their messages are already
        // in the DB and their LinkedInDMConversation record already exists.
        const doneRows = await prisma.linkedInDMConversation.findMany({
          where: { userId },
          select: { conversationId: true },
        })
        const doneSet = new Set(doneRows.map((r) => r.conversationId))
        const skippedConvs = conversations.filter((c) => doneSet.has(c.conversationId)).length
        const pendingConvs = conversations.filter((c) => !doneSet.has(c.conversationId))

        send({ type: "status", message: `Processing ${pendingConvs.length} conversations (${skippedConvs} already imported)…` })

        let totalSynced = 0
        let totalChats = 0
        let totalMatched = 0
        let convIdx = 0 // index across ALL conversations (for progress display)

        for (const conv of conversations) {
          convIdx++
          const { conversationId, chatName, profileUrl, messages } = conv

          // Skip already-completed conversations
          if (doneSet.has(conversationId)) {
            send({ type: "progress", file: chatName, matched: false, messages: messages?.length ?? 0, synced: 0, skipped: messages?.length ?? 0, convIdx, totalConvs, resumed: true })
            continue
          }

          if (!messages || messages.length === 0) {
            send({ type: "progress", file: chatName, matched: false, messages: 0, synced: 0, skipped: 0, convIdx, totalConvs })
            // Mark as done even if empty so we don't retry it
            await prisma.linkedInDMConversation.upsert({
              where: { userId_conversationId: { userId, conversationId } },
              update: { chatName, profileUrl: profileUrl ?? null, messageCount: 0, importedAt: new Date() },
              create: { userId, conversationId, chatName, profileUrl: profileUrl ?? null, messageCount: 0 },
            })
            continue
          }

          const contactId = await matchLinkedInDMToContact(userId, chatName, profileUrl ?? null)
          totalChats++
          if (contactId) totalMatched++

          // Upsert messages in chunks of 200; emit an intermediate event for large conversations
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

            // For large conversations (multiple chunks), emit intermediate progress so the UI
            // doesn't appear frozen.  Only send every other chunk to avoid flooding.
            if (messages.length > CHUNK && i + CHUNK < messages.length && (i / CHUNK) % 2 === 0) {
              send({ type: "progress", file: chatName, matched: !!contactId, messages: messages.length, synced, skipped, convIdx, totalConvs, partial: true })
            }
          }

          totalSynced += synced

          // ── Mark conversation as fully imported ─────────────────────────────
          // This is the key for resume support: once we write this row, future
          // re-uploads will skip this conversation entirely.
          await prisma.linkedInDMConversation.upsert({
            where: { userId_conversationId: { userId, conversationId } },
            update: {
              chatName,
              profileUrl: profileUrl ?? null,
              contactId: contactId ?? null,
              messageCount: messages.length,
              importedAt: new Date(),
            },
            create: {
              userId,
              conversationId,
              chatName,
              profileUrl: profileUrl ?? null,
              contactId: contactId ?? null,
              messageCount: messages.length,
            },
          })

          send({ type: "progress", file: chatName, matched: !!contactId, messages: messages.length, synced, skipped, convIdx, totalConvs })
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

        send({ type: "done", synced: totalSynced, chats: totalChats, matched: totalMatched, skippedConvs })
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
