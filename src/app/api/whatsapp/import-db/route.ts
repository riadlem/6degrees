import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { matchChatNameToContact } from "@/lib/whatsapp-match"
import { recomputeScoreForContact } from "@/lib/reconnect-score"

export const maxDuration = 300

const GROUP_MAX_MEMBERS = 15

// The client parses ChatStorage.sqlite in the browser using sql.js (WASM)
// and sends only the extracted message rows as compact JSON.
// This bypasses the 4.5 MB Vercel body limit — the full DB (100–500 MB)
// never leaves the browser.
type ChatPayload = {
  chatName: string
  phone: string | null          // E.164 number for 1:1 chats; null for groups
  isGroup: boolean
  memberCount: number           // unique inbound sender count
  messages: [number, number, string | null][]  // [sentAtMs, isOutbound 0|1, senderPhone|null]
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// Match a phone number to a contact using last-9-digit suffix matching
async function matchPhoneToContact(userId: string, phone: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 7) return null
  const suffix = digits.slice(-9)
  const candidates = await prisma.$queryRaw<{ id: string; phoneNumber: string | null }[]>`
    SELECT id, "phoneNumber" FROM "Contact"
    WHERE "userId" = ${userId}
      AND "phoneNumber" IS NOT NULL
      AND "phoneNumber" != ''
      AND replace(replace(replace("phoneNumber", ' ', ''), '-', ''), '.', '') LIKE ${"%" + suffix}
  `
  for (const c of candidates) {
    if (c.phoneNumber) {
      const cDigits = c.phoneNumber.replace(/\D/g, "")
      if (cDigits.endsWith(suffix)) return c.id
    }
  }
  return null
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

        // Ensure columns exist (idempotent)
        await prisma.$executeRaw`ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "phone" TEXT`.catch(() => {})
        await prisma.$executeRaw`ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "senderName" TEXT`.catch(() => {})
        await prisma.$executeRaw`ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "isGroup" BOOLEAN DEFAULT FALSE`.catch(() => {})

        // ── Phase 1: pre-load existing state in parallel ─────────────────────
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

        // ── Phase 2: match NEW 1:1 chats ─────────────────────────────────────
        const newChatNames = chats
          .filter((c) => !c.isGroup)
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

        // ── Phase 2b: match small group senders by phone ──────────────────────
        type GroupSenderMap = Map<string, string | null>  // phone → contactId
        const groupSenderCache = new Map<string, GroupSenderMap>()

        const newSmallGroups = chats.filter(
          (c) => c.isGroup && c.memberCount <= GROUP_MAX_MEMBERS
        )
        if (newSmallGroups.length > 0) {
          send({ type: "status", message: `Matching senders in ${newSmallGroups.length} group${newSmallGroups.length !== 1 ? "s" : ""}…` })
          for (const chat of newSmallGroups) {
            const uniquePhones = new Set(
              chat.messages
                .filter(([, isOut, phone]) => isOut === 0 && phone)
                .map(([, , phone]) => phone as string)
            )
            if (uniquePhones.size === 0) continue
            const senderMap: GroupSenderMap = new Map()
            const phoneList = [...uniquePhones]
            const MATCH_CONCURRENCY = 4
            for (let i = 0; i < phoneList.length; i += MATCH_CONCURRENCY) {
              const batch = phoneList.slice(i, i + MATCH_CONCURRENCY)
              const results = await Promise.all(
                batch.map((phone) => matchPhoneToContact(userId, phone))
              )
              batch.forEach((phone, j) => senderMap.set(phone, results[j]))
            }
            groupSenderCache.set(chat.chatName, senderMap)
          }
        }

        // ── Phase 3: resolve contactIds + classify chats ─────────────────────
        type ResolvedChat = ChatPayload & {
          groupSenders: GroupSenderMap | null
          alreadyImported: boolean
        }

        function get1to1ContactId(chatName: string): string | null {
          if (chatContactCache.has(chatName)) return chatContactCache.get(chatName)!
          return freshMatches.get(chatName) ?? null
        }

        const resolved: ResolvedChat[] = chats.map((chat) => {
          const existing = existingCountMap.get(chat.chatName) ?? 0
          const alreadyImported = existing >= chat.messages.length
          const groupSenders = chat.isGroup ? (groupSenderCache.get(chat.chatName) ?? null) : null
          return { ...chat, groupSenders, alreadyImported }
        })

        let totalSynced = 0
        const totalMatched = resolved.filter((c) => {
          if (c.isGroup) return c.groupSenders ? [...c.groupSenders.values()].some(Boolean) : false
          return !!get1to1ContactId(c.chatName)
        }).length

        // ── Phase 4: phone backfill for 1:1 chats ────────────────────────────
        await Promise.all(
          resolved
            .filter((c) => !c.isGroup && c.phone)
            .map((c) => {
              const cid = get1to1ContactId(c.chatName)
              if (!cid) return
              return prisma.contact.updateMany({
                where: { id: cid, phoneNumber: null },
                data: { phoneNumber: c.phone! },
              }).catch(() => {})
            })
        )

        // ── Phase 5: instant progress for already-imported chats ─────────────
        for (const chat of resolved.filter((c) => c.alreadyImported)) {
          const matched = chat.isGroup
            ? (chat.groupSenders ? [...chat.groupSenders.values()].some(Boolean) : false)
            : !!get1to1ContactId(chat.chatName)
          send({
            type: "progress",
            file: chat.chatName,
            matched,
            messages: chat.messages.length,
            synced: 0,
            skipped: chat.messages.length,
          })
        }

        // ── Phase 6: insert new messages ──────────────────────────────────────
        const toInsert = resolved.filter((c) => !c.alreadyImported)
        if (toInsert.length > 0) {
          send({ type: "status", message: `Inserting messages for ${toInsert.length} chat${toInsert.length !== 1 ? "s" : ""}…` })
        }

        const INSERT_CONCURRENCY = 5
        for (let i = 0; i < toInsert.length; i += INSERT_CONCURRENCY) {
          const batch = toInsert.slice(i, i + INSERT_CONCURRENCY)
          await Promise.all(
            batch.map(async (chat) => {
              const resolvedContactId = chat.isGroup ? null : get1to1ContactId(chat.chatName)
              const CHUNK = 200
              let synced = 0
              let skipped = 0
              for (let j = 0; j < chat.messages.length; j += CHUNK) {
                const chunk = chat.messages.slice(j, j + CHUNK)
                const result = await prisma.whatsAppMessage.createMany({
                  data: chunk.map(([sentAtMs, isOut, senderPhone]) => {
                    let contactId: string | null = null
                    if (!chat.isGroup) {
                      contactId = resolvedContactId
                    } else if (isOut === 0 && senderPhone && chat.groupSenders) {
                      contactId = chat.groupSenders.get(senderPhone) ?? null
                    }
                    return {
                      userId,
                      contactId,
                      chatName: chat.chatName,
                      sentAt: new Date(sentAtMs),
                      isOutbound: isOut === 1,
                      phone: !chat.isGroup ? (chat.phone ?? null) : null,
                      isGroup: chat.isGroup,
                      senderName: chat.isGroup ? (senderPhone ?? null) : null,
                    }
                  }),
                  skipDuplicates: true,
                })
                synced += result.count
                skipped += chunk.length - result.count
              }
              totalSynced += synced
              const matched = chat.isGroup
                ? (chat.groupSenders ? [...chat.groupSenders.values()].some(Boolean) : false)
                : !!resolvedContactId
              send({
                type: "progress",
                file: chat.chatName,
                matched,
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

        // Recalculate scores for all matched contacts
        const matchedIds = [...new Set(
          resolved.flatMap((c) => {
            if (c.isGroup && c.groupSenders) {
              return [...c.groupSenders.values()].filter((v): v is string => !!v)
            }
            const cid = get1to1ContactId(c.chatName)
            return cid ? [cid] : []
          })
        )]
        if (matchedIds.length > 0) {
          send({ type: "status", message: `Updating scores for ${matchedIds.length} contact${matchedIds.length !== 1 ? "s" : ""}…` })
          await Promise.all(matchedIds.map((id) => recomputeScoreForContact(id).catch(() => {})))
        }

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
