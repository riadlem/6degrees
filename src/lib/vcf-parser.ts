export type ParsedVcfContact = {
  fullName: string
  phone: string | null
  email: string | null
  birthday: string | null   // "YYYY-MM-DD"
  photoData: string | null  // "data:image/jpeg;base64,..."
  linkedinUrl: string | null
}

export function parseVcf(text: string): ParsedVcfContact[] {
  // Unfold continuation lines (RFC 6350: CRLF + space/tab)
  const unfolded = text.replace(/\r?\n[ \t]/g, "")
  const lines = unfolded.split(/\r?\n/)

  const results: ParsedVcfContact[] = []
  let inCard = false
  let cardLines: string[] = []

  for (const line of lines) {
    const upper = line.toUpperCase().trim()
    if (upper === "BEGIN:VCARD") {
      inCard = true
      cardLines = []
    } else if (upper === "END:VCARD" && inCard) {
      inCard = false
      const contact = parseVcard(cardLines)
      if (contact) results.push(contact)
    } else if (inCard) {
      cardLines.push(line)
    }
  }

  return results
}

function parseVcard(lines: string[]): ParsedVcfContact | null {
  let fullName: string | null = null
  let phone: string | null = null
  let email: string | null = null
  let birthday: string | null = null
  let photoData: string | null = null
  let linkedinUrl: string | null = null
  let phonePriority = 0 // 0=none, 1=any TEL, 2=CELL/MOBILE

  for (const line of lines) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue

    const prop = line.slice(0, colonIdx).toUpperCase()
    const value = line.slice(colonIdx + 1).trim()
    if (!value) continue

    const propBase = prop.split(";")[0]

    if (propBase === "FN") {
      fullName = decodeVcardText(value)
    } else if (propBase === "TEL") {
      const isCell = /TYPE=(?:CELL|MOBILE|IPHONE)/i.test(prop)
      if (isCell && phonePriority < 2) {
        phone = normalizePhone(value)
        phonePriority = 2
      } else if (!isCell && phonePriority < 1) {
        phone = normalizePhone(value)
        phonePriority = 1
      }
    } else if (propBase === "EMAIL") {
      if (!email) email = value.toLowerCase().trim()
    } else if (propBase === "BDAY") {
      birthday = parseBday(value)
    } else if (propBase === "PHOTO") {
      // Skip URL-type photos
      if (/VALUE=URI/i.test(prop)) continue
      const mimeMatch = /TYPE=(\w+)/i.exec(prop)
      const mime = mimeMatch ? `image/${mimeMatch[1].toLowerCase()}` : "image/jpeg"
      // value is base64 data; must be a reasonable photo size
      if (value.length > 100) {
        photoData = `data:${mime};base64,${value.replace(/\s/g, "")}`
      }
    } else if (propBase === "X-SOCIALPROFILE") {
      // X-SOCIALPROFILE;type=linkedin:https://www.linkedin.com/in/username
      if (/TYPE=LINKEDIN/i.test(prop) && !linkedinUrl) {
        linkedinUrl = extractLinkedInUrl(value)
      }
    } else if (propBase === "URL") {
      // URL:https://www.linkedin.com/in/username  or  URL;type=LinkedIn:...
      if (!linkedinUrl) {
        const isLinkedInTyped = /TYPE=LINKEDIN/i.test(prop)
        if (isLinkedInTyped || value.toLowerCase().includes("linkedin.com/in/")) {
          linkedinUrl = extractLinkedInUrl(value)
        }
      }
    }
  }

  if (!fullName || fullName.length < 1) return null
  return { fullName, phone, email, birthday, photoData, linkedinUrl }
}

function decodeVcardText(value: string): string {
  // Unescape vCard text escapes: \n \, \; \\
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim()
}

function normalizePhone(phone: string): string {
  // Keep leading + and digits
  const stripped = phone.replace(/[^\d+]/g, "")
  return stripped || phone.trim()
}

function extractLinkedInUrl(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  // Normalize to https://www.linkedin.com/in/... form
  const match = v.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
  if (match) return `https://www.linkedin.com/in/${match[1]}`
  return null
}

function parseBday(value: string): string | null {
  // --MMDD (no year) — skip
  if (value.startsWith("--")) return null
  // YYYYMMDD
  const compact = value.replace(/-/g, "")
  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return null
}
