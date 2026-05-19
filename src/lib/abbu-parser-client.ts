import type { ParsedVcfContact } from "./vcf-parser"

type SqlJs = Awaited<ReturnType<typeof import("sql.js")["default"]>>
// Minimal interface for a JSZip entry (avoids importing jszip types at module level)
type ZipEntry = { async(type: "uint8array"): Promise<Uint8Array>; _data?: unknown }

let _SQL: SqlJs | null = null
async function getSql(): Promise<SqlJs> {
  if (_SQL) return _SQL
  const initSqlJs = (await import("sql.js")).default
  _SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" })
  return _SQL
}

// Normalize UUID to uppercase-no-hyphens for consistent key lookup
function normalizeUuid(s: string): string {
  return s.replace(/-/g, "").toUpperCase()
}

export async function parseAbcddbFile(file: File): Promise<ParsedVcfContact[]> {
  if (file.name.toLowerCase().endsWith(".zip")) {
    return parseAbbuZip(file)
  }
  return parseAbcddbBuffer(await file.arrayBuffer())
}

async function parseAbbuZip(file: File): Promise<ParsedVcfContact[]> {
  const JSZip = (await import("jszip")).default
  const zip = await JSZip.loadAsync(file)

  let dbEntry: ZipEntry | null = null
  // Map normalized UUID (no hyphens, uppercase) → zip entry for .abcdp images
  const imageEntries = new Map<string, ZipEntry>()

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return
    if (relativePath.endsWith(".abcddb") && !dbEntry) {
      dbEntry = entry as ZipEntry
      return
    }
    if (relativePath.endsWith(".abcdp")) {
      // Filename is the contact UUID: e.g. "AddressBook.abbu/Images/XXXX-YYYY.abcdp"
      const fname = relativePath.split("/").pop()?.replace(/\.abcdp$/i, "") ?? ""
      if (fname) imageEntries.set(normalizeUuid(fname), entry as ZipEntry)
    }
  })

  if (!dbEntry) throw new Error(
    "No .abcddb file found inside the ZIP.\nMake sure you right-clicked the .abbu file itself → Compress."
  )

  const dbBuffer = await (dbEntry as ZipEntry).async("uint8array")
  return parseAbcddbBuffer(dbBuffer.buffer as ArrayBuffer, imageEntries)
}

export async function parseAbcddbBuffer(
  buf: ArrayBuffer,
  imageEntries?: Map<string, ZipEntry>,
): Promise<ParsedVcfContact[]> {
  const SQL = await getSql()
  const db = new SQL.Database(new Uint8Array(buf))
  try {
    return await extractContacts(db, imageEntries)
  } finally {
    db.close()
  }
}

function colMap(
  columns: string[],
): (row: (string | number | Uint8Array | null)[]) => Record<string, string | number | Uint8Array | null> {
  return (row) => Object.fromEntries(columns.map((c, i) => [c, row[i]]))
}

function queryAll(
  db: SqlJs["Database"]["prototype"],
  sql: string,
): Record<string, string | number | Uint8Array | null>[] {
  try {
    const res = db.exec(sql)
    if (!res.length) return []
    const mapper = colMap(res[0].columns)
    return res[0].values.map(mapper)
  } catch {
    return []
  }
}

async function extractContacts(
  db: SqlJs["Database"]["prototype"],
  imageEntries?: Map<string, ZipEntry>,
): Promise<ParsedVcfContact[]> {
  // Include ZUNIQUEID to look up full-res photos in the Images/ folder
  const records = queryAll(db, `
    SELECT Z_PK, ZUNIQUEID, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA
    FROM ZABCDRECORD
    WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL
  `)

  // phone map: prefer Mobile/iPhone labels
  const phoneMap = new Map<number, string>()
  const phonePri = new Map<number, number>()
  for (const p of queryAll(db, "SELECT ZOWNER, ZFULLNUMBER, ZLABEL FROM ZABCDPHONENUMBER")) {
    const num = p.ZFULLNUMBER as string | null
    if (!num) continue
    const owner = p.ZOWNER as number
    const label = (p.ZLABEL as string | null) ?? ""
    const isMobile = label.includes("Mobile") || label.includes("iPhone") || label.includes("Cell")
    const pri = isMobile ? 2 : 1
    if (pri > (phonePri.get(owner) ?? 0)) { phoneMap.set(owner, num); phonePri.set(owner, pri) }
  }

  // email map: first email per contact
  const emailMap = new Map<number, string>()
  for (const e of queryAll(db, "SELECT ZOWNER, ZADDRESS FROM ZABCDEMAILADDRESS ORDER BY ZOWNER")) {
    const owner = e.ZOWNER as number
    const addr = e.ZADDRESS as string | null
    if (addr && !emailMap.has(owner)) emailMap.set(owner, addr.toLowerCase())
  }

  // LinkedIn URL map
  const linkedinMap = new Map<number, string>()
  for (const u of queryAll(db, "SELECT ZOWNER, ZURL, ZLABEL FROM ZABCDURL")) {
    const owner = u.ZOWNER as number
    const url = (u.ZURL as string | null) ?? ""
    const label = ((u.ZLABEL as string | null) ?? "").toLowerCase()
    if (!url || linkedinMap.has(owner)) continue
    if (url.includes("linkedin.com/in/") || label.includes("linkedin")) {
      const m = url.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
      if (m) linkedinMap.set(owner, `https://www.linkedin.com/in/${m[1]}`)
    }
  }

  // Build base results (without photos yet — photo extraction may be async)
  const results: ParsedVcfContact[] = []
  const uuids: (string | null)[] = []

  for (const r of records) {
    const pk = r.Z_PK as number
    const first = (r.ZFIRSTNAME as string | null)?.trim() ?? ""
    const last = (r.ZLASTNAME as string | null)?.trim() ?? ""
    const fullName = [first, last].filter(Boolean).join(" ")
    if (!fullName) continue

    // Fall back to inline thumbnail if no Images/ entry is found
    const thumb = r.ZTHUMBNAILIMAGEDATA as Uint8Array | null
    const thumbMime = thumb && thumb.length > 100 ? detectMime(thumb) : null
    const thumbPhoto = thumbMime ? `data:${thumbMime};base64,${uint8ToBase64(thumb!)}` : null

    results.push({
      fullName,
      phone: phoneMap.get(pk) ?? null,
      email: emailMap.get(pk) ?? null,
      birthday: null,
      photoData: thumbPhoto,
      linkedinUrl: linkedinMap.get(pk) ?? null,
    })

    const rawUuid = (r.ZUNIQUEID as string | null) ?? null
    uuids.push(rawUuid ? normalizeUuid(rawUuid) : null)
  }

  // Enrich with full-res photos from Images/ folder (ZIP path only)
  if (imageEntries && imageEntries.size > 0) {
    // Process in parallel batches of 20 to avoid blocking the main thread
    const PHOTO_BATCH = 20
    const MAX_BYTES = 400 * 1024 // skip photos > 400 KB to bound memory usage

    for (let i = 0; i < results.length; i += PHOTO_BATCH) {
      await Promise.all(
        results.slice(i, i + PHOTO_BATCH).map(async (contact, j) => {
          const uuid = uuids[i + j]
          if (!uuid) return
          const entry = imageEntries.get(uuid)
          if (!entry) return
          try {
            const bytes = await entry.async("uint8array")
            const mime = bytes.length > 100 && bytes.length <= MAX_BYTES ? detectMime(bytes) : null
            if (mime) contact.photoData = `data:${mime};base64,${uint8ToBase64(bytes)}`
          } catch { /* skip broken entries */ }
        })
      )
    }
  }

  return results
}

// Detect MIME type from magic bytes; returns null for unrecognised formats
// (prevents plist/NSArchive wrappers from being stored as broken images)
function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length < 8) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png"
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "image/heic"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif"
  return null // not a recognised image — discard
}

// Chunked to avoid call-stack overflow on large blobs — lossless encoding, no quality change
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
