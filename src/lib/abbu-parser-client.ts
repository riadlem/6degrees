import type { ParsedVcfContact } from "./vcf-parser"
import { postDiagnostics } from "./abbu-parser-diag"

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

export async function parseAbcddbFile(
  file: File,
  onStatus?: (msg: string) => void,
): Promise<ParsedVcfContact[]> {
  if (file.name.toLowerCase().endsWith(".zip")) {
    return parseAbbuZip(file, onStatus)
  }
  onStatus?.(`Reading database (${(file.size / 1024 / 1024).toFixed(1)} MB)…`)
  return parseAbcddbBuffer(await file.arrayBuffer(), undefined, onStatus)
}

async function parseAbbuZip(
  file: File,
  onStatus?: (msg: string) => void,
): Promise<ParsedVcfContact[]> {
  onStatus?.(`Opening ZIP archive (${(file.size / 1024 / 1024).toFixed(1)} MB)…`)
  const JSZip = (await import("jszip")).default
  const zip = await JSZip.loadAsync(file)

  // Collect ALL .abcddb entries — modern macOS stores contacts in per-source
  // sub-databases under Sources/[UUID]/AddressBook-v22.abcddb, not just the root one
  const dbEntries: { path: string; entry: ZipEntry }[] = []
  // Map normalized UUID → zip entry for .abcdp images (all sources share the same Images folder)
  const imageEntries = new Map<string, ZipEntry>()

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return
    if (relativePath.endsWith(".abcddb")) {
      dbEntries.push({ path: relativePath, entry: entry as ZipEntry })
      return
    }
    if (relativePath.endsWith(".abcdp")) {
      const fname = relativePath.split("/").pop()?.replace(/\.abcdp$/i, "") ?? ""
      if (fname) imageEntries.set(normalizeUuid(fname), entry as ZipEntry)
    }
  })

  if (dbEntries.length === 0) throw new Error(
    "No .abcddb file found inside the ZIP.\nMake sure you right-clicked the .abbu file itself → Compress."
  )

  onStatus?.(`Found ${dbEntries.length} database file(s), ${imageEntries.size} photos — scanning…`)

  // Try every database; merge contacts across all sources (dedup by name)
  const allContacts: ParsedVcfContact[] = []
  const seenNames = new Set<string>()

  for (const { path, entry } of dbEntries) {
    const shortName = path.split("/").filter(Boolean).slice(-2).join("/")
    try {
      const raw = await entry.async("uint8array")
      onStatus?.(`Reading ${shortName} (${(raw.byteLength / 1024).toFixed(0)} KB)…`)
      // Use raw.slice() to get a fresh Uint8Array with byteOffset=0 (avoids JSZip buffer-view issues)
      const contacts = await parseAbcddbBuffer(raw.slice().buffer, imageEntries, onStatus)
      let added = 0
      for (const c of contacts) {
        if (!seenNames.has(c.fullName)) {
          seenNames.add(c.fullName)
          allContacts.push(c)
          added++
        }
      }
      if (added > 0) onStatus?.(`  → ${added} contacts from ${shortName}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err)
      onStatus?.(`  → skipped ${shortName}: ${msg}`)
    }
  }

  return allContacts
}

export async function parseAbcddbBuffer(
  buf: ArrayBuffer,
  imageEntries?: Map<string, ZipEntry>,
  onStatus?: (msg: string) => void,
): Promise<ParsedVcfContact[]> {
  const SQL = await getSql()
  const db = new SQL.Database(new Uint8Array(buf))
  try {
    return await extractContacts(db, imageEntries, onStatus)
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

// Like queryAll but throws on SQL error instead of silently returning []
function queryRequired(
  db: SqlJs["Database"]["prototype"],
  sql: string,
): Record<string, string | number | Uint8Array | null>[] {
  const res = db.exec(sql)
  if (!res.length) return []
  const mapper = colMap(res[0].columns)
  return res[0].values.map(mapper)
}

function listTables(db: SqlJs["Database"]["prototype"]): string[] {
  try {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    if (!res.length) return []
    return res[0].values.map((row) => String(row[0]))
  } catch {
    return []
  }
}

async function extractContacts(
  db: SqlJs["Database"]["prototype"],
  imageEntries?: Map<string, ZipEntry>,
  onStatus?: (msg: string) => void,
): Promise<ParsedVcfContact[]> {
  // List tables for diagnostics
  const tables = listTables(db)
  const hasZabcdrecord = tables.some((t) => t === "ZABCDRECORD")

  if (!hasZabcdrecord) {
    const tableList = tables.length > 0 ? tables.join(", ") : "(none found)"
    postDiagnostics({ event: "parse_error", tables, error: `ZABCDRECORD not found. Tables: ${tableList}` })
    throw new Error(
      `Database does not contain a ZABCDRECORD table.\n` +
      `Tables found: ${tableList}\n\n` +
      `This may not be a valid AddressBook .abcddb file. ` +
      `Make sure you compressed the .abbu bundle itself (not a file inside it).`
    )
  }

  // Probe which columns exist (schema varies across macOS versions)
  const sampleRow = queryAll(db, "SELECT * FROM ZABCDRECORD LIMIT 1")
  const availableColumns = sampleRow.length > 0 ? Object.keys(sampleRow[0]) : []

  // Build SELECT list based on what's actually in the schema
  const wantedColumns = ["Z_PK", "ZFIRSTNAME", "ZLASTNAME", "ZTHUMBNAILIMAGEDATA"].filter(
    (col) => availableColumns.length === 0 || availableColumns.includes(col)
  )
  // Z_PK is mandatory; if missing, fall back to rowid
  const selectList = wantedColumns.length >= 2
    ? wantedColumns.join(", ")
    : "rowid AS Z_PK, ZFIRSTNAME, ZLASTNAME"

  let records: Record<string, string | number | Uint8Array | null>[]
  try {
    records = queryRequired(db, `
      SELECT ${selectList}
      FROM ZABCDRECORD
      WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL
    `)
  } catch (err) {
    // Try without WHERE clause — some builds store nulls differently
    try {
      records = queryRequired(db, `SELECT ${selectList} FROM ZABCDRECORD`)
    } catch (err2) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const err2Msg = err2 instanceof Error ? err2.message : String(err2)
      postDiagnostics({
        event: "parse_error",
        tables,
        zabcdrecordColumns: availableColumns,
        error: `Query failed: ${errMsg} / fallback: ${err2Msg}`,
      })
      throw new Error(
        `Failed to read contacts from ZABCDRECORD.\n` +
        `Error: ${errMsg}\n` +
        `Fallback error: ${err2Msg}\n` +
        `Available columns: ${availableColumns.join(", ") || "(could not determine)"}`
      )
    }
  }

  onStatus?.(`Found ${records.length.toLocaleString()} contact records — loading details…`)

  // ZUNIQUEID links contacts to Images/ folder entries — query separately so
  // a missing column (schema varies across macOS versions) doesn't wipe out contacts
  const uuidMap = new Map<number, string>()
  if (imageEntries && imageEntries.size > 0) {
    for (const r of queryAll(db, "SELECT Z_PK, ZUNIQUEID FROM ZABCDRECORD")) {
      const uuid = r.ZUNIQUEID as string | null
      if (uuid) uuidMap.set(r.Z_PK as number, normalizeUuid(uuid))
    }
    if (uuidMap.size > 0) {
      onStatus?.(`Mapped ${uuidMap.size} photo UUIDs — will load full-res photos from archive…`)
    }
  }

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

  // Build base results (without full-res photos yet — async extraction follows)
  const results: ParsedVcfContact[] = []
  const resultPks: number[] = []

  for (const r of records) {
    const pk = r.Z_PK as number
    const first = (r.ZFIRSTNAME as string | null)?.trim() ?? ""
    const last = (r.ZLASTNAME as string | null)?.trim() ?? ""
    const fullName = [first, last].filter(Boolean).join(" ")
    if (!fullName) continue

    // Use inline thumbnail as initial photo (may be overwritten by Images/ entry below)
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
    resultPks.push(pk)
  }

  if (results.length === 0 && records.length > 0) {
    // Records exist but all were filtered out (all had null/empty names)
    postDiagnostics({
      event: "zero_contacts",
      tables,
      zabcdrecordColumns: availableColumns,
      zabcdrecordRowCount: records.length,
      error: `${records.length} rows in ZABCDRECORD but all had empty/null names`,
    })
  } else if (results.length === 0) {
    postDiagnostics({
      event: "zero_contacts",
      tables,
      zabcdrecordColumns: availableColumns,
      zabcdrecordRowCount: 0,
      error: "ZABCDRECORD exists but returned 0 rows matching the WHERE clause",
    })
  }

  const thumbCount = results.filter((r) => r.photoData).length
  onStatus?.(
    `Parsed ${results.length.toLocaleString()} contacts` +
    (phoneMap.size > 0 ? ` · ${phoneMap.size} phones` : "") +
    (emailMap.size > 0 ? ` · ${emailMap.size} emails` : "") +
    (thumbCount > 0 ? ` · ${thumbCount} thumbnails` : "") +
    (imageEntries && imageEntries.size > 0 ? ` — loading ${Math.min(uuidMap.size, imageEntries.size)} full-res photos…` : "")
  )

  // Enrich with full-res photos from Images/ folder (ZIP path only)
  if (imageEntries && imageEntries.size > 0 && uuidMap.size > 0) {
    const PHOTO_BATCH = 20
    const MAX_BYTES = 400 * 1024
    let photosLoaded = 0

    for (let i = 0; i < results.length; i += PHOTO_BATCH) {
      await Promise.all(
        results.slice(i, i + PHOTO_BATCH).map(async (contact, j) => {
          const uuid = uuidMap.get(resultPks[i + j])
          if (!uuid) return
          const entry = imageEntries.get(uuid)
          if (!entry) return
          try {
            const bytes = await entry.async("uint8array")
            const mime = bytes.length > 100 && bytes.length <= MAX_BYTES ? detectMime(bytes) : null
            // Only store browser-renderable formats — HEIC is not supported in Chrome/Firefox
            if (mime && mime !== "image/heic") {
              contact.photoData = `data:${mime};base64,${uint8ToBase64(bytes)}`
              photosLoaded++
            }
          } catch { /* skip broken entries */ }
        })
      )
      if (i % (PHOTO_BATCH * 5) === 0 && i > 0) {
        onStatus?.(`Loading photos… ${photosLoaded} loaded (${Math.round((i / results.length) * 100)}%)`)
      }
    }

    const finalPhotoCount = results.filter((r) => r.photoData).length
    onStatus?.(`Photos done — ${finalPhotoCount} total (${thumbCount} thumbnails + ${photosLoaded} full-res)`)
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
