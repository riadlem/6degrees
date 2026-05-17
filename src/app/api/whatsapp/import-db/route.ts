import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { parseWhatsAppDatabase } from "@/lib/whatsapp-db-parser"
import { matchChatNameToContact } from "@/lib/whatsapp-match"
import { recomputeScores } from "@/lib/reconnect-score"

export const maxDuration = 300

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return new Response("Invalid form data", { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) return new Response("No file provided", { status: 400 })

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
        send({ type: "status", message: "Reading database…" })

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        send({ type: "status", message: "Parsing chats…" })
        let chats: Awaited<ReturnType<typeof parseWhatsAppDatabase>>
        try {
          chats = parseWhatsAppDatabase(buffer)
        } catch (err) {
          send({
            type: "error",
            message: `Could not read database: ${err instanceof Error ? err.message : "unknown error"}. Make sure you uploaded ChatStorage.sqlite.`,
          })
          return
        }

        send({ type: "status", message: `Found ${chats.length} chats — matching contacts…` })

        let totalSynced = 0
        let totalMatched = 0

        for (const chat of chats) {
          const contactId = await matchChatNameToContact(userId, chat.chatName)
          if (contactId) totalMatched++

          const CHUNK = 200
          let synced = 0
          let skipped = 0
          for (let i = 0; i < chat.messages.length; i += CHUNK) {
            const chunk = chat.messages.slice(i, i + CHUNK)
            const result = await prisma.whatsAppMessage.createMany({
              data: chunk.map((m) => ({
                userId,
                contactId: contactId ?? null,
                chatName: chat.chatName,
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

        send({ type: "status", message: "Computing relationship scores…" })
        await recomputeScores(userId)

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
