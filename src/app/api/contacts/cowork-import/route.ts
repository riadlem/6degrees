import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import JSZip from "jszip"

// Parse a CSV line respecting double-quoted fields
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === "," && !inQuote) {
      fields.push(cur.trim())
      cur = ""
    } else {
      cur += ch
    }
  }
  fields.push(cur.trim())
  return fields
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]))
  })
}

// Extract the slug from a LinkedIn profile URL
function linkedinSlug(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
  return m ? m[1].toLowerCase() : null
}

// Detect MIME type from magic bytes
function detectMime(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg"
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png"
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif"
  if (buf[0] === 0x52 && buf[1] === 0x49) return "image/webp"
  return "image/jpeg"
}

function toDataUri(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf)
  const mime = detectMime(u8)
  const b64 = Buffer.from(buf).toString("base64")
  return `data:${mime};base64,${b64}`
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const formData = await req.formData()
  const csvFile = formData.get("csv") as File | null
  const photosFile = formData.get("photos") as File | null

  if (!csvFile) return Response.json({ error: "csv file is required" }, { status: 400 })

  const csvText = await csvFile.text()
  const rows = parseCsv(csvText)
  if (rows.length === 0) return Response.json({ error: "CSV has no data rows" }, { status: 400 })

  // Load ZIP photos into a map: filename → ArrayBuffer
  const photoMap = new Map<string, ArrayBuffer>()
  if (photosFile) {
    const zipBuf = await photosFile.arrayBuffer()
    const zip = await JSZip.loadAsync(zipBuf)
    const loads: Promise<void>[] = []
    zip.forEach((relativePath, entry) => {
      if (entry.dir) return
      const filename = relativePath.split("/").pop()!
      loads.push(
        entry.async("arraybuffer").then((buf) => { photoMap.set(filename, buf) })
      )
    })
    await Promise.all(loads)
  }

  let matched = 0
  let updated = 0
  let photos = 0
  const notFound: string[] = []

  for (const row of rows) {
    const slug = linkedinSlug(row.linkedin_url ?? "")

    // Match contact: try linkedin slug, then profileUrl, then name
    let contact: { id: string; linkedinKey: string } | null = null

    if (slug) {
      contact = await prisma.contact.findFirst({
        where: { userId, linkedinKey: { contains: slug, mode: "insensitive" } },
        select: { id: true, linkedinKey: true },
      })
      if (!contact) {
        // Also try matching against stored profileUrl
        contact = await prisma.contact.findFirst({
          where: { userId, profileUrl: { contains: slug, mode: "insensitive" } },
          select: { id: true, linkedinKey: true },
        })
      }
    }

    if (!contact && row.name) {
      const parts = row.name.trim().split(" ")
      const firstName = parts[0]
      const lastName = parts.slice(1).join(" ")
      if (firstName && lastName) {
        contact = await prisma.contact.findFirst({
          where: {
            userId,
            firstName: { equals: firstName, mode: "insensitive" },
            lastName: { equals: lastName, mode: "insensitive" },
          },
          select: { id: true, linkedinKey: true },
        })
      }
    }

    if (!contact) {
      notFound.push(row.name ?? row.linkedin_url ?? "?")
      continue
    }

    matched++

    // Build update data
    const data: Record<string, unknown> = {}

    if (row.city) data.city = row.city
    if (row.country) data.country = row.country
    if (row.shared_contacts) {
      const n = parseInt(row.shared_contacts, 10)
      if (!isNaN(n)) data.commonConnections = n
    }
    if (row.title) {
      data.headline = row.title
      // Use as position only if it's shorter/cleaner (≤ 80 chars)
      if (row.title.length <= 80) data.position = row.title
    }
    if (row.linkedin_url) data.profileUrl = row.linkedin_url

    // Photo
    const photoFilename = row.photo_filename
    if (photoFilename && photoMap.has(photoFilename)) {
      const buf = photoMap.get(photoFilename)!
      data.photoUrl = toDataUri(buf)
      photos++
    }

    if (Object.keys(data).length > 0) {
      await prisma.contact.updateMany({
        where: { id: contact.id, userId },
        data,
      })
      updated++
    }
  }

  return Response.json({
    total: rows.length,
    matched,
    updated,
    photos,
    notFound,
  })
}
