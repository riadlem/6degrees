import Database from "better-sqlite3"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"
import type { ParsedVcfContact } from "./vcf-parser"

export function parseAbcddb(buffer: Buffer): ParsedVcfContact[] {
  const tmpPath = path.join(os.tmpdir(), `contacts-${Date.now()}-${Math.random().toString(36).slice(2)}.abcddb`)
  try {
    fs.writeFileSync(tmpPath, buffer)
    const db = new Database(tmpPath, { readonly: true })
    const results = extractContacts(db)
    db.close()
    return results
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

function extractContacts(db: Database.Database): ParsedVcfContact[] {
  type RecordRow = { Z_PK: number; ZFIRSTNAME: string | null; ZLASTNAME: string | null; ZTHUMBNAILIMAGEDATA: Buffer | null }
  type PhoneRow = { ZOWNER: number; ZFULLNUMBER: string; ZLABEL: string | null }
  type EmailRow = { ZOWNER: number; ZADDRESS: string }
  type UrlRow = { ZOWNER: number; ZURL: string; ZLABEL: string | null }

  const records = db.prepare(
    `SELECT Z_PK, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA
     FROM ZABCDRECORD
     WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL`
  ).all() as RecordRow[]

  // phone map: prefer mobile/iPhone labels
  const phoneMap = new Map<number, string>()
  const phonePriorityMap = new Map<number, number>()
  try {
    const phones = db.prepare(`SELECT ZOWNER, ZFULLNUMBER, ZLABEL FROM ZABCDPHONENUMBER`).all() as PhoneRow[]
    for (const p of phones) {
      if (!p.ZFULLNUMBER) continue
      const isMobile = p.ZLABEL && (
        p.ZLABEL.includes("Mobile") || p.ZLABEL.includes("iPhone") || p.ZLABEL.includes("Cell")
      )
      const priority = isMobile ? 2 : 1
      if (priority > (phonePriorityMap.get(p.ZOWNER) ?? 0)) {
        phoneMap.set(p.ZOWNER, p.ZFULLNUMBER)
        phonePriorityMap.set(p.ZOWNER, priority)
      }
    }
  } catch { /* table may not exist */ }

  // email map: first email per contact
  const emailMap = new Map<number, string>()
  try {
    const emails = db.prepare(`SELECT ZOWNER, ZADDRESS FROM ZABCDEMAILADDRESS ORDER BY ZOWNER`).all() as EmailRow[]
    for (const e of emails) {
      if (!emailMap.has(e.ZOWNER) && e.ZADDRESS) {
        emailMap.set(e.ZOWNER, e.ZADDRESS.toLowerCase())
      }
    }
  } catch { /* table may not exist */ }

  // LinkedIn URL map
  const linkedinMap = new Map<number, string>()
  try {
    const urls = db.prepare(`SELECT ZOWNER, ZURL, ZLABEL FROM ZABCDURL`).all() as UrlRow[]
    for (const u of urls) {
      if (!u.ZURL || linkedinMap.has(u.ZOWNER)) continue
      const isLinkedIn = u.ZURL.includes("linkedin.com/in/") ||
        (u.ZLABEL && u.ZLABEL.toLowerCase().includes("linkedin"))
      if (isLinkedIn) {
        const m = u.ZURL.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
        if (m) linkedinMap.set(u.ZOWNER, `https://www.linkedin.com/in/${m[1]}`)
      }
    }
  } catch { /* table may not exist */ }

  const results: ParsedVcfContact[] = []
  for (const r of records) {
    const firstName = r.ZFIRSTNAME?.trim() ?? ""
    const lastName = r.ZLASTNAME?.trim() ?? ""
    const fullName = [firstName, lastName].filter(Boolean).join(" ")
    if (!fullName) continue

    const thumbBuf = r.ZTHUMBNAILIMAGEDATA
    const thumbMime = thumbBuf && thumbBuf.length > 100 ? detectMime(thumbBuf) : null
    const photoData = thumbMime
      ? `data:${thumbMime};base64,${Buffer.from(thumbBuf!).toString("base64")}`
      : null

    results.push({
      fullName,
      phone: phoneMap.get(r.Z_PK) ?? null,
      email: emailMap.get(r.Z_PK) ?? null,
      birthday: null,
      photoData,
      linkedinUrl: linkedinMap.get(r.Z_PK) ?? null,
    })
  }

  return results
}

function detectMime(buf: Buffer): string | null {
  if (buf.length < 8) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png"
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "image/heic"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif"
  return null
}
