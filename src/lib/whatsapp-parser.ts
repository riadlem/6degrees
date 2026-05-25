export type ParsedWAMessage = {
  senderName: string
  sentAt: Date
  isOutbound: boolean
}

// System messages to skip — never attributed to a contact
const SYSTEM_PATTERNS = [
  /^Messages and calls are end-to-end encrypted/,
  /^.+ added .+/,
  /^.+ left$/,
  /^.+ was added$/,
  /^.+ changed (the|their)/,
  /^.+ created group/,
  /^‎/, // left-to-right mark prefix (WhatsApp system messages in some locales)
  /^<Media omitted>$/,
  /^ /, // narrow no-break space (some locale system messages)
]

// Format 1: [DD/MM/YYYY, HH:MM:SS] Name: message  — European / iOS French
const FORMAT_1 = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s+(.+?):\s/i

// Format 2: MM/DD/YY, HH:MM AM/PM - Name: message  — American / Android
const FORMAT_2 = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*-\s*(.+?):\s/i

// Format 3: DD.MM.YY, HH:MM - Name: message  — European dot format
const FORMAT_3 = /^(\d{1,2}\.\d{1,2}\.\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.+?):\s/i

const OUTBOUND_NAMES = new Set(["me", "you", "io", "ich", "yo", "moi"])

function isOutboundSender(name: string, userName?: string): boolean {
  const lower = name.toLowerCase().trim()
  if (OUTBOUND_NAMES.has(lower)) return true
  if (userName && lower === userName.toLowerCase().trim()) return true
  return false
}

/**
 * Parse a date in DD/MM/YYYY (or DD/MM/YY) order.
 * Formats 1 and 3 always use this order (European).
 */
function parseDMY(datePart: string, timePart: string): Date | null {
  // Split on slash or dot
  const parts = datePart.split(/[\/.]/)
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  // Re-assemble as MM/DD/YYYY so JS Date constructor parses it correctly
  const parsed = new Date(`${m}/${d}/${y} ${timePart}`)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Parse a date in MM/DD/YYYY (or MM/DD/YY) order.
 * Format 2 (American/Android) uses this order.
 */
function parseMDY(datePart: string, timePart: string): Date | null {
  const parts = datePart.split(/\//)
  if (parts.length !== 3) return null
  const [m, d, y] = parts
  const parsed = new Date(`${m}/${d}/${y} ${timePart}`)
  return isNaN(parsed.getTime()) ? null : parsed
}

export function parseWhatsAppExport(text: string, userName?: string): ParsedWAMessage[] {
  const lines = text.split(/\r?\n/)
  const messages: ParsedWAMessage[] = []

  for (const line of lines) {
    if (!line.trim()) continue

    let match: RegExpMatchArray | null = null
    let datePart = ""
    let timePart = ""
    let sender = ""
    let isDMY = true // FORMAT_1 and FORMAT_3 are DD/MM; FORMAT_2 is MM/DD

    match = line.match(FORMAT_1)
    if (match) {
      ;[, datePart, timePart, sender] = match
      isDMY = true
    } else {
      match = line.match(FORMAT_2)
      if (match) {
        ;[, datePart, timePart, sender] = match
        isDMY = false // American format: MM/DD/YY
      } else {
        match = line.match(FORMAT_3)
        if (match) {
          ;[, datePart, timePart, sender] = match
          isDMY = true // dot format is always DD.MM.YY
        }
      }
    }

    if (!match || !sender) continue

    // Skip system messages
    const restOfLine = line.slice(match[0].length)
    if (SYSTEM_PATTERNS.some((p) => p.test(restOfLine) || p.test(sender))) continue
    if (SYSTEM_PATTERNS.some((p) => p.test(line))) continue

    const sentAt = isDMY
      ? parseDMY(datePart.trim(), timePart.trim())
      : parseMDY(datePart.trim(), timePart.trim())
    if (!sentAt) continue

    messages.push({
      senderName: sender.trim(),
      sentAt,
      isOutbound: isOutboundSender(sender, userName),
    })
  }

  return messages
}

export function extractChatName(filename: string): string {
  // Remove directory path if present
  const base = filename.split(/[/\\]/).pop() ?? filename
  // Remove extension
  let name = base.replace(/\.[^.]+$/, "")
  // Strip "WhatsApp Chat with " prefix (various locales)
  name = name
    .replace(/^WhatsApp Chat with\s+/i, "")
    .replace(/^Chat WhatsApp avec\s+/i, "")
    .replace(/^WhatsApp-Chat mit\s+/i, "")
  return name.trim()
}
