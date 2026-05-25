export const maxDuration = 300

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { parseLinkedInDate, connectionKey, type LinkedInConnection } from "@/lib/linkedin"
import { stripEdgeEmoji } from "@/lib/utils"
import { invalidateMatchCache } from "@/lib/match-cache-store"

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
}

// Parse a single CSV line, handling quoted fields with embedded commas.
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // Handle escaped double-quotes ("")
      if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
      else { inQuote = !inQuote }
    } else if (ch === "," && !inQuote) {
      result.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

// Parse LinkedIn's Connections.csv export.
// The file starts with some preamble lines before the actual header row.
function parseConnectionsCsv(text: string): LinkedInConnection[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const headerIdx = lines.findIndex((l) => l.includes("First Name"))
  if (headerIdx === -1) return []
  const headers = parseCsvLine(lines[headerIdx])
  return lines
    .slice(headerIdx + 1)
    .map((l) => {
      const vals = parseCsvLine(l)
      return Object.fromEntries(headers.map((h, i) => [h.trim(), vals[i] ?? ""])) as unknown as LinkedInConnection
    })
    .filter((r) => r["First Name"])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const userId = session.user.id

  // Parse multipart/form-data to get the uploaded CSV file
  let csvText: string
  try {
    const formData = await req.formData()
    const file = formData.get("file")
    if (!file || typeof file === "string") {
      return Response.json({ error: "No file uploaded" }, { status: 400 })
    }
    csvText = await (file as File).text()
  } catch {
    return Response.json({ error: "Could not read uploaded file" }, { status: 400 })
  }

  const connections = parseConnectionsCsv(csvText)
  if (connections.length === 0) {
    return Response.json({ error: "No connections found in this file. Make sure you uploaded Connections.csv from your LinkedIn data export." }, { status: 400 })
  }

  const total = connections.length
  let synced  = 0
  let skipped = 0
  let failed  = 0

  // One INSERT ... ON CONFLICT DO NOTHING per chunk → ~10 DB calls for 5k contacts.
  // This reduces round trips from O(n) to O(n/CHUNK), bypassing per-row latency.
  const CHUNK = 500

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(sse(data)) } catch { /* closed */ }
      }

      send({ type: "status", message: `Importing ${total} connections from CSV…`, total })

      for (let i = 0; i < connections.length; i += CHUNK) {
        const chunk = connections.slice(i, i + CHUNK)
        try {
          const result = await prisma.contact.createMany({
            data: chunk.map((conn) => ({
              userId,
              linkedinKey: connectionKey(conn),
              firstName:   stripEdgeEmoji(conn["First Name"] ?? ""),
              lastName:    stripEdgeEmoji(conn["Last Name"] ?? ""),
              position:    conn["Position"]    || null,
              company:     conn["Company"]     || null,
              connectedOn: parseLinkedInDate(conn["Connected On"]),
              profileUrl:  conn["URL"]         || null,
            })),
            skipDuplicates: true,
          })
          synced  += result.count
          skipped += chunk.length - result.count
        } catch {
          failed += chunk.length
        }

        const last = chunk[chunk.length - 1]
        const current = `${last["First Name"]} ${last["Last Name"]}`.trim()
        send({ type: "progress", synced, skipped, failed, total, current })
      }

      await prisma.user.update({
        where: { id: userId },
        data: { lastSyncAt: new Date() },
      })

      // CSV import adds new contacts — invalidate the Gmail match cache so
      // the next Gmail sync will match against the freshly-imported contacts.
      if (synced > 0) invalidateMatchCache(userId)

      send({ type: "done", synced, skipped, failed, total })
      controller.close()
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
