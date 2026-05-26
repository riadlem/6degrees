import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { recomputeScores } from "@/lib/reconnect-score"

export const maxDuration = 300

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// Pre-parsed conversation shape sent by the client-side parser in settings/page.tsx.
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

// ─── Batch contact resolution ─────────────────────────────────────────────────
// Resolves contacts for ALL conversations with just 2-3 DB queries instead of
// one per conversation. Returns Map<conversationId, contactId | null>.
async function batchResolveContacts(
  userId: string,
  convs: ClientConversation[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()

  // ── Step 1: Batch LinkedIn URL key match (1 query) ──────────────────────
  const keyToConvIds = new Map<string, string[]>()
  for (const c of convs) {
    const m = c.profileUrl?.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
    if (m) {
      const key = m[1]
      if (!keyToConvIds.has(key)) keyToConvIds.set(key, [])
      keyToConvIds.get(key)!.push(c.conversationId)
    }
  }
  if (keyToConvIds.size > 0) {
    const contacts = await prisma.contact.findMany({
      where: { userId, linkedinKey: { in: [...keyToConvIds.keys()] } },
      select: { id: true, linkedinKey: true },
    })
    for (const c of contacts) {
      for (const convId of keyToConvIds.get(c.linkedinKey) ?? []) {
        result.set(convId, c.id)
      }
    }
  }

  // ── Step 2: Batch name match for URL-unresolved conversations (1 query) ─
  const unresolved = convs.filter((c) => !result.has(c.conversationId))

  type NameEntry = { firstName: string; lastName: string; convIds: string[] }
  const twoWordMap  = new Map<string, NameEntry>()  // firstName\0lastName → entry
  const oneWordMap  = new Map<string, NameEntry>()  // firstName → entry

  for (const c of unresolved) {
    const cleaned = c.chatName
      .trim()
      .replace(/[\(\[\{].*?[\)\]\}]/g, "")
      .replace(/\s*[-–—|\/]\s*[A-Z].*/g, "")
      .replace(/\s+[\p{Emoji_Presentation}\p{Extended_Pictographic}].*/gu, "")
      .trim()
    const parts = cleaned.split(/\s+/).filter(Boolean)
    if (parts.length === 0) { result.set(c.conversationId, null); continue }

    if (parts.length >= 2) {
      const firstName = parts[0]
      const lastName  = parts[parts.length - 1]
      const key = `${firstName.toLowerCase()}\0${lastName.toLowerCase()}`
      if (!twoWordMap.has(key)) twoWordMap.set(key, { firstName, lastName, convIds: [] })
      twoWordMap.get(key)!.convIds.push(c.conversationId)
    } else {
      const firstName = parts[0]
      const key = firstName.toLowerCase()
      if (!oneWordMap.has(key)) oneWordMap.set(key, { firstName, lastName: "", convIds: [] })
      oneWordMap.get(key)!.convIds.push(c.conversationId)
    }
  }

  // Two-word names batch
  if (twoWordMap.size > 0) {
    const pairs = [...twoWordMap.values()]
    const contacts = await prisma.contact.findMany({
      where: {
        userId,
        OR: pairs.map(({ firstName, lastName }) => ({
          firstName: { equals: firstName, mode: "insensitive" as const },
          lastName:  { equals: lastName,  mode: "insensitive" as const },
        })),
      },
      select: { id: true, firstName: true, lastName: true },
    })
    // Group: lowerfirst\0lowerlast → [contactId, ...]
    const nameHits = new Map<string, string[]>()
    for (const c of contacts) {
      const k = `${(c.firstName ?? "").toLowerCase()}\0${(c.lastName ?? "").toLowerCase()}`
      if (!nameHits.has(k)) nameHits.set(k, [])
      nameHits.get(k)!.push(c.id)
    }
    for (const [key, { convIds }] of twoWordMap) {
      const hits = nameHits.get(key) ?? []
      const contactId = hits.length === 1 ? hits[0] : null  // discard ambiguous
      for (const convId of convIds) result.set(convId, contactId)
    }
  }

  // Single-word names batch
  if (oneWordMap.size > 0) {
    const names = [...oneWordMap.values()]
    const contacts = await prisma.contact.findMany({
      where: {
        userId,
        OR: names.map(({ firstName }) => ({
          firstName: { equals: firstName, mode: "insensitive" as const },
        })),
      },
      select: { id: true, firstName: true },
    })
    const nameHits = new Map<string, string[]>()
    for (const c of contacts) {
      const k = (c.firstName ?? "").toLowerCase()
      if (!nameHits.has(k)) nameHits.set(k, [])
      nameHits.get(k)!.push(c.id)
    }
    for (const [key, { convIds }] of oneWordMap) {
      const hits = nameHits.get(key) ?? []
      const contactId = hits.length === 1 ? hits[0] : null
      for (const convId of convIds) result.set(convId, contactId)
    }
  }

  // Ensure every conversation has an entry (null = unmatched)
  for (const c of convs) {
    if (!result.has(c.conversationId)) result.set(c.conversationId, null)
  }

  return result
}

// ─── Concurrency-limited parallel runner ────────────────────────────────────
// Processes `items` in parallel, at most `concurrency` at a time.
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

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
      }, 15_000)  // every 15s — faster than Vercel's idle timeout

      function cleanup() {
        if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null }
      }

      try {
        const totalConvs = conversations.length

        // ── Resume: load already-completed conversations ──────────────────────
        const doneRows = await prisma.linkedInDMConversation.findMany({
          where: { userId },
          select: { conversationId: true },
        })
        const doneSet = new Set(doneRows.map((r) => r.conversationId))
        const pending = conversations.filter((c) => !doneSet.has(c.conversationId))
        const skippedConvs = totalConvs - pending.length

        send({
          type: "status",
          message: `Resolving contacts for ${pending.length} conversations${skippedConvs > 0 ? ` (${skippedConvs} already imported, skipping)` : ""}…`,
        })

        // ── Batch contact resolution (2-3 DB queries for ALL conversations) ──
        const contactMap = await batchResolveContacts(userId, pending)
        const resolvedCount = [...contactMap.values()].filter(Boolean).length
        send({
          type: "status",
          message: `Processing ${pending.length} conversations (${resolvedCount} matched to contacts)…`,
        })

        // ── Shared counters (written atomically since JS is single-threaded) ─
        let totalSynced  = 0
        let totalChats   = 0
        let totalMatched = 0
        let completedIdx = 0

        const CHUNK = 500  // messages per createMany call

        // ── Process conversations in parallel (concurrency 8) ────────────────
        await runWithConcurrency(pending, 8, async (conv) => {
          const { conversationId, chatName, profileUrl, messages } = conv
          const convIdx = ++completedIdx  // approximate — parallel so order varies

          if (!messages || messages.length === 0) {
            await prisma.linkedInDMConversation.upsert({
              where: { userId_conversationId: { userId, conversationId } },
              update: { chatName, profileUrl: profileUrl ?? null, messageCount: 0, importedAt: new Date() },
              create: { userId, conversationId, chatName, profileUrl: profileUrl ?? null, messageCount: 0 },
            })
            send({ type: "progress", file: chatName, matched: false, messages: 0, synced: 0, skipped: 0, convIdx, totalConvs })
            return
          }

          const contactId = contactMap.get(conversationId) ?? null
          totalChats++
          if (contactId) totalMatched++

          // Insert messages in chunks
          let synced  = 0
          let skipped = 0
          for (let i = 0; i < messages.length; i += CHUNK) {
            const chunk = messages.slice(i, i + CHUNK)
            const result = await prisma.linkedInDMMessage.createMany({
              data: chunk.map((m) => ({
                userId,
                contactId,
                conversationId,
                chatName,
                profileUrl: profileUrl ?? null,
                sentAt: new Date(m.sentAt),
                isOutbound: m.isOutbound,
                senderName: m.senderName,
              })),
              skipDuplicates: true,
            })
            synced  += result.count
            skipped += chunk.length - result.count
          }
          totalSynced += synced

          // Mark conversation as fully imported (enables resume on next upload)
          await prisma.linkedInDMConversation.upsert({
            where: { userId_conversationId: { userId, conversationId } },
            update: { chatName, profileUrl: profileUrl ?? null, contactId, messageCount: messages.length, importedAt: new Date() },
            create: { userId, conversationId, chatName, profileUrl: profileUrl ?? null, contactId, messageCount: messages.length },
          })

          send({ type: "progress", file: chatName, matched: !!contactId, messages: messages.length, synced, skipped, convIdx, totalConvs })
        })

        // Update sync aggregate
        await prisma.linkedInDMSync.upsert({
          where: { userId },
          update: { importedAt: new Date(), totalMessages: { increment: totalSynced }, totalChats: { increment: totalChats } },
          create: { userId, importedAt: new Date(), totalMessages: totalSynced, totalChats },
        })

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
