import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { parseWhatsAppExport, extractChatName } from "@/lib/whatsapp-parser"
import { matchChatNameToContact, enrichContactFromPhoneBook } from "@/lib/whatsapp-match"
import { recomputeScores } from "@/lib/reconnect-score"

export const maxDuration = 300

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id
  const userName = session.user.name ?? undefined

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return new Response("Invalid form data", { status: 400 })
  }

  const files = formData.getAll("files") as File[]
  if (!files || files.length === 0) {
    return new Response("No files provided", { status: 400 })
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
        send({ type: "status", message: `Processing ${files.length} chat file${files.length !== 1 ? "s" : ""}…` })

        let totalSynced = 0
        let totalChats = 0
        let totalMatched = 0

        for (const file of files) {
          const filename = file.name
          const chatName = extractChatName(filename)
          const text = await file.text()

          const messages = parseWhatsAppExport(text, userName)
          if (messages.length === 0) {
            send({ type: "progress", file: chatName, matched: false, messages: 0, synced: 0, skipped: 0 })
            continue
          }

          const contactId = await matchChatNameToContact(userId, chatName)
          totalChats++
          if (contactId) {
            totalMatched++
            await enrichContactFromPhoneBook(userId, contactId, chatName)
          }

          // Upsert messages in chunks of 200
          let synced = 0
          let skipped = 0
          const CHUNK = 200
          for (let i = 0; i < messages.length; i += CHUNK) {
            const chunk = messages.slice(i, i + CHUNK)
            const result = await prisma.whatsAppMessage.createMany({
              data: chunk.map((m) => ({
                userId,
                contactId: contactId ?? null,
                chatName,
                sentAt: m.sentAt,
                isOutbound: m.isOutbound,
              })),
              skipDuplicates: true,
            })
            synced += result.count
            skipped += chunk.length - result.count
          }

          totalSynced += synced

          send({
            type: "progress",
            file: chatName,
            matched: !!contactId,
            messages: messages.length,
            synced,
            skipped,
          })
        }

        // Update sync record
        await prisma.whatsAppSync.upsert({
          where: { userId },
          update: {
            importedAt: new Date(),
            totalMessages: { increment: totalSynced },
            totalChats: { increment: totalChats },
          },
          create: {
            userId,
            importedAt: new Date(),
            totalMessages: totalSynced,
            totalChats,
          },
        })

        // Recompute scores in the background — don't block the SSE stream
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
