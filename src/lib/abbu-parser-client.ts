import type { ParsedVcfContact } from "./vcf-parser"

type SqlJs = Awaited<ReturnType<typeof import("sql.js")["default"]>>

let _SQL: SqlJs | null = null
async function getSql(): Promise<SqlJs> {
  if (_SQL) return _SQL
  const initSqlJs = (await import("sql.js")).default
  _SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" })
  return _SQL
}

// Zip entry traversal helper that works with jszip's forEach
async function findAbcddbInZip(file: File): Promise<ArrayBuffer> {
  const JSZip = (await import("jszip")).default
  const zip = await JSZip.loadAsync(file)
  let buf: ArrayBuffer | null = null
  const promises: Promise<void>[] = []
  zip.forEach((relativePath, entry) => {
    if (!entry.dir && relativePath.endsWith(".abcddb") && !buf) {
      promises.push(entry.async("arraybuffer").then((b) => { buf = b }))
    }
  })
  await Promise.all(promises)
  if (!buf) throw new Error(
    "No .abcddb file found inside the ZIP.\nMake sure you right-clicked the .abbu file itself → Compress."
  )
  return buf
}

export async function parseAbcddbFile(file: File): Promise<ParsedVcfContact[]> {
  const buf = file.name.toLowerCase().endsWith(".zip")
    ? await findAbcddbInZip(file)
    : await file.arrayBuffer()
  return parseAbcddbBuffer(buf)
}

export async function parseAbcddbBuffer(buf: ArrayBuffer): Promise<ParsedVcfContact[]> {
  const SQL = await getSql()
  const db = new SQL.Database(new Uint8Array(buf))
  try {
    return extractContacts(db)
  } finally {
    db.close()
  }
}

function colMap(columns: string[]): (row: (string | number | Uint8Array | null)[]) => Record<string, string | number | Uint8Array | null> {
  return (row) => Object.fromEntries(columns.map((c, i) => [c, row[i]]))
}

function queryAll(db: SqlJs["Database"]["prototype"], sql: string): Record<string, string | number | Uint8Array | null>[] {
  try {
    const res = db.exec(sql)
    if (!res.length) return []
    const mapper = colMap(res[0].columns)
    return res[0].values.map(mapper)
  } catch {
    return []
  }
}

function extractContacts(db: SqlJs["Database"]["prototype"]): ParsedVcfContact[] {
  const records = queryAll(db, `
    SELECT Z_PK, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA
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

  const results: ParsedVcfContact[] = []
  for (const r of records) {
    const pk = r.Z_PK as number
    const first = (r.ZFIRSTNAME as string | null)?.trim() ?? ""
    const last = (r.ZLASTNAME as string | null)?.trim() ?? ""
    const fullName = [first, last].filter(Boolean).join(" ")
    if (!fullName) continue

    // ZTHUMBNAILIMAGEDATA comes back as Uint8Array from sql.js
    const thumb = r.ZTHUMBNAILIMAGEDATA as Uint8Array | null
    const photoData = thumb && thumb.length > 100
      ? `data:${detectMime(thumb)};base64,${uint8ToBase64(thumb)}`
      : null

    results.push({
      fullName,
      phone: phoneMap.get(pk) ?? null,
      email: emailMap.get(pk) ?? null,
      birthday: null,
      photoData,
      linkedinUrl: linkedinMap.get(pk) ?? null,
    })
  }
  return results
}

// Detect image MIME type from magic bytes to avoid mislabeling HEIC/PNG as JPEG
function detectMime(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png"
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "image/heic"
  return "image/jpeg" // safe fallback
}

// Chunked to avoid stack overflow on large blobs; no quality change (lossless encoding)
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
