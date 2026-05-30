import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { parseWhatsAppExport, extractChatName } from "@/lib/whatsapp-parser"
import { matchChatNameToContact, enrichContactFromPhoneBook } from "@/lib/whatsapp-match"
import { recomputeScoreForContact } from "@/lib/reconnect-score"

export const maxDuration = 300

const GROUP_MAX_MEMBERS = 15

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
        const matchedContactIds = new Set<string>()

        // Only import messages from the last 4 years — older interactions
        // have negligible score weight and bloat the table unnecessarily.
        const FOUR_YEARS_AGO = new Date(Date.now() - 4 * 365.25 * 24 * 60 * 60 * 1000)

        for (const file of files) {
          const filename = file.name
          const chatName = extractChatName(filename)
          const text = await file.text()

          const allMessages = parseWhatsAppExport(text, userName)
          const messages = allMessages.filter((m) => m.sentAt >= FOUR_YEARS_AGO)
          if (messages.length === 0) {
            send({ type: "progress", file: chatName, matched: false, messages: 0, synced: 0, skipped: 0 })
            continue
          }

          totalChats++

          // Detect group chat: more than one unique inbound sender name
          const uniqueSenders = new Set(messages.filter((m) => !m.isOutbound).map((m) => m.senderName))
          const isGroup = uniqueSenders.size > 1
          const isLargeGroup = isGroup && uniqueSenders.size > GROUP_MAX_MEMBERS

          // Map senderName → contactId
          const senderToContact = new Map<string, string | null>()

          if (!isGroup) {
            // 1:1 chat — match by chatName
            const contactId = await matchChatNameToContact(userId, chatName)
            if (contactId) {
              totalMatched++
              matchedContactIds.add(contactId)
              await enrichContactFromPhoneBook(userId, contactId, chatName)
            }
            senderToContact.set("__1to1__", contactId)
          } else if (!isLargeGroup) {
            // Small group — match each unique sender
            const senderList = [...uniqueSenders]
            const MATCH_CONCURRENCY = 4
            for (let i = 0; i < senderList.length; i += MATCH_CONCURRENCY) {
              const batch = senderList.slice(i, i + MATCH_CONCURRENCY)
              const results = await Promise.all(batch.map((name) => matchChatNameToContact(userId, name)))
              batch.forEach((name, j) => {
                senderToContact.set(name, results[j])
                if (results[j]) {
                  totalMatched++
                  matchedContactIds.add(results[j]!)
                }
              })
            }
          }
          // Large groups: senderToContact stays empty → all contactId = null (score-neutral)

          // Upsert messages in chunks of 200
          let synced = 0
          let skipped = 0
          const CHUNK = 200
          for (let i = 0; i < messages.length; i += CHUNK) {
            const chunk = messages.slice(i, i + CHUNK)
            const result = await prisma.whatsAppMessage.createMany({
              data: chunk.map((m) => {
                let contactId: string | null = null
                if (!isGroup) {
                  contactId = senderToContact.get("__1to1__") ?? null
                } else if (!m.isOutbound) {
                  contactId = senderToContact.get(m.senderName) ?? null
                }
                return {
                  userId,
                  contactId,
                  chatName,
                  sentAt: m.sentAt,
                  isOutbound: m.isOutbound,
                  isGroup,
                  senderName: isGroup ? m.senderName : null,
                }
              }),
              skipDuplicates: true,
            })
            synced += result.count
            skipped += chunk.length - result.count
          }

          totalSynced += synced

          const matchedCount = isGroup
            ? [...senderToContact.values()].filter(Boolean).length
            : (senderToContact.get("__1to1__") ? 1 : 0)

          send({
            type: "progress",
            file: chatName,
            matched: matchedCount > 0,
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

        // Recalculate scores for matched contacts before closing the stream
        if (matchedContactIds.size > 0) {
          send({ type: "status", message: `Updating scores for ${matchedContactIds.size} contact${matchedContactIds.size !== 1 ? "s" : ""}…` })
          await Promise.all([...matchedContactIds].map((id) => recomputeScoreForContact(id).catch(() => {})))
        }

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
