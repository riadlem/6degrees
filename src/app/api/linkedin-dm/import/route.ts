import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { recomputeScores } from "@/lib/reconnect-score"

/** Extract the vanity slug from any linkedin.com/in/... URL, lowercased. */
function extractKey(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
  return m ? decodeURIComponent(m[1]).toLowerCase() : null
}

function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/\p{Mn}/gu, "")
}

type NameVariant = { normFirst: string; normLast: string }

/**
 * Return all (normFirst, normLast) candidate pairs for a chat name.
 * Fixes two bugs from the original implementation:
 *   1. Strip ALL emoji — the old regex only stripped emoji preceded by a space,
 *      so "Hernandez🌺" (no space) leaked through into the key.
 *   2. Compound last names — "Carla de Preval" → generate BOTH candidates:
 *        (carla, preval)     [last word only — some DBs store it trimmed]
 *        (carla, de preval)  [full remainder — handles noble particles de/van/di/…]
 */
function nameVariants(chatName: string): NameVariant[] {
  const cleaned = chatName
    .trim()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}️‍]/gu, "")
    .replace(/[\(\[\{].*?[\)\]\}]/g, "")
    .replace(/\s*[-–—|\/]\s*[A-Z].*/g, "")
    .trim()
    .replace(/\s+/g, " ")

  const parts = cleaned.split(" ").filter(Boolean)
  if (parts.length === 0) return []

  const nf = stripAccents(parts[0]).toLowerCase()

  if (parts.length === 1) return [{ normFirst: nf, normLast: "" }]
  if (parts.length === 2) return [{ normFirst: nf, normLast: stripAccents(parts[1]).toLowerCase() }]

  // 3+ parts: two candidates (last-word-only first — more selective against the DB)
  const variants: NameVariant[] = [
    { normFirst: nf, normLast: stripAccents(parts[parts.length - 1]).toLowerCase() },
  ]
  const fullRest = stripAccents(parts.slice(1).join(" ")).toLowerCase()
  if (fullRest !== variants[0].normLast) variants.push({ normFirst: nf, normLast: fullRest })
  return variants
}

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
// Resolves contacts for ALL conversations with 3-4 DB queries instead of
// one per conversation. Returns Map<conversationId, contactId | null>.
//
// Strategy (in order, stopping when matched):
//   1. URL key → Contact.linkedinKey  (IN query, most reliable)
//   2. URL key → Contact.profileUrl   (catches renamed/changed vanity URLs)
//   3. Exact first+last name           (OR batch query)
//   4. Accent-normalised name          (in-memory after fetching by first char)
//   5. Single first name (unique only)
async function batchResolveContacts(
  userId: string,
  convs: ClientConversation[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()

  // ── Step 1: Batch LinkedIn URL key → linkedinKey match ──────────────────
  const keyToConvIds = new Map<string, string[]>()  // normalised key → [conversationId]
  for (const c of convs) {
    const key = c.profileUrl ? extractKey(c.profileUrl) : null
    if (key) {
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
      for (const convId of keyToConvIds.get(c.linkedinKey.toLowerCase()) ?? []) {
        result.set(convId, c.id)
      }
    }
  }

  // ── Step 2: URL key → Contact.profileUrl fallback ───────────────────────
  // Catches contacts whose vanity key changed after they were imported.
  // Load ALL contacts that have a profileUrl; match keys in-memory.
  const unresolvedWithUrl = convs.filter((c) => !result.has(c.conversationId) && c.profileUrl)
  if (unresolvedWithUrl.length > 0) {
    const contactsWithUrl = await prisma.contact.findMany({
      where: { userId, profileUrl: { not: null } },
      select: { id: true, profileUrl: true },
    })
    const profileKeyMap = new Map<string, string>()  // normalised key → contactId
    for (const c of contactsWithUrl) {
      const k = c.profileUrl ? extractKey(c.profileUrl) : null
      if (k && !profileKeyMap.has(k)) profileKeyMap.set(k, c.id)
    }
    for (const c of unresolvedWithUrl) {
      const key = extractKey(c.profileUrl!)
      if (key && profileKeyMap.has(key)) result.set(c.conversationId, profileKeyMap.get(key)!)
    }
  }

  // ── Step 3: Name matching (accent-normalised + compound surnames) ──────────
  // For each unresolved conversation compute all name variant keys (handles:
  //   • accents on first/last name
  //   • emoji glued to the name without a space
  //   • compound last names like "de Preval", "van der Berg"
  // One DB query per first-char bucket covers all cases.

  const unresolvedByName = convs.filter((c) => !result.has(c.conversationId))

  // convId → ordered list of keys to try (first match wins)
  const convVariantKeys = new Map<string, string[]>()
  const allFirstChars = new Set<string>()

  for (const c of unresolvedByName) {
    const variants = nameVariants(c.chatName)
    if (variants.length === 0) { result.set(c.conversationId, null); continue }
    const keys = variants.map((v) => `${v.normFirst}\0${v.normLast}`)
    convVariantKeys.set(c.conversationId, keys)
    allFirstChars.add(variants[0].normFirst.charAt(0))
  }

  if (allFirstChars.size > 0) {
    const firstChars = [...allFirstChars]
    const pool = await prisma.$queryRaw<{ id: string; firstName: string; lastName: string | null }[]>`
      SELECT id, "firstName", "lastName"
      FROM "Contact"
      WHERE "userId" = ${userId}
        AND LOWER(LEFT("firstName", 1)) = ANY(${firstChars}::text[])
    `
    // Build lookup: normFirst\0normLast → [contactId]
    const lookup = new Map<string, string[]>()
    for (const c of pool) {
      const k = `${stripAccents(c.firstName ?? "").toLowerCase()}\0${stripAccents(c.lastName ?? "").toLowerCase()}`
      if (!lookup.has(k)) lookup.set(k, [])
      lookup.get(k)!.push(c.id)
    }

    for (const [convId, keys] of convVariantKeys) {
      let matched: string | null = null
      for (const key of keys) {
        const hits = lookup.get(key) ?? []
        if (hits.length === 1) { matched = hits[0]; break }
        // ambiguous (2+) → try next variant (might be more specific)
      }
      result.set(convId, matched)
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
