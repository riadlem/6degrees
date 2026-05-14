export const maxDuration = 300

import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { parseLinkedInDate, connectionKey, type LinkedInConnection } from "@/lib/linkedin"

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
  let synced = 0
  let failed = 0

  // 50 batches of 10 run concurrently → 500 upserts per tick (~10 ticks for 5k contacts).
  const BATCH_SIZE = 10
  const PARALLEL   = 50

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(sse(data)) } catch { /* closed */ }
      }

      send({ type: "status", message: `Importing ${total} connections from CSV…`, total })

      const stride = BATCH_SIZE * PARALLEL
      for (let i = 0; i < connections.length; i += stride) {
        // Build up to PARALLEL batches and run them all at once
        const batches: LinkedInConnection[][] = []
        for (let p = 0; p < PARALLEL; p++) {
          const start = i + p * BATCH_SIZE
          if (start >= connections.length) break
          batches.push(connections.slice(start, start + BATCH_SIZE))
        }

        const upsert = (conn: LinkedInConnection) => {
          const key = connectionKey(conn)
          return prisma.contact.upsert({
            where: { userId_linkedinKey: { userId, linkedinKey: key } },
            update: {
              position: conn["Position"] || null,
              company:  conn["Company"]  || null,
              profileUrl: conn["URL"]    || null,
              syncedAt: new Date(),
            },
            create: {
              userId,
              linkedinKey: key,
              firstName:   conn["First Name"],
              lastName:    conn["Last Name"],
              position:    conn["Position"]   || null,
              company:     conn["Company"]    || null,
              connectedOn: parseLinkedInDate(conn["Connected On"]),
              profileUrl:  conn["URL"]        || null,
            },
          })
        }

        const groupResults = await Promise.all(
          batches.map((batch) => Promise.allSettled(batch.map(upsert)))
        )

        for (const results of groupResults) {
          synced += results.filter((r) => r.status === "fulfilled").length
          failed  += results.filter((r) => r.status === "rejected").length
        }

        const lastBatch = batches[batches.length - 1]
        const last = lastBatch[lastBatch.length - 1]
        const current = `${last["First Name"]} ${last["Last Name"]}`.trim()
        send({ type: "progress", synced, failed, total, current })
      }

      await prisma.user.update({
        where: { id: userId },
        data: { lastSyncAt: new Date() },
      })

      send({ type: "done", synced, failed, total })
      controller.close()
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
