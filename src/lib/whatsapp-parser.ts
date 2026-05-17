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
  /^ /, // narrow no-break space (some locale system messages)
]

// Format 1: [DD/MM/YYYY, HH:MM:SS] Name: message
const FORMAT_1 = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s+(.+?):\s/i

// Format 2: MM/DD/YY, HH:MM AM/PM - Name: message
const FORMAT_2 = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*-\s*(.+?):\s/i

// Format 3: DD.MM.YY, HH:MM - Name: message (European dot format)
const FORMAT_3 = /^(\d{1,2}\.\d{1,2}\.\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.+?):\s/i

const OUTBOUND_NAMES = new Set(["me", "you", "io", "ich", "yo", "moi"])

function isOutboundSender(name: string, userName?: string): boolean {
  const lower = name.toLowerCase().trim()
  if (OUTBOUND_NAMES.has(lower)) return true
  if (userName && lower === userName.toLowerCase().trim()) return true
  return false
}

function parseDate(datePart: string, timePart: string): Date | null {
  try {
    // Normalize separators and try parsing
    const combined = `${datePart} ${timePart}`.replace(/\./g, "/")
    const d = new Date(combined)
    if (!isNaN(d.getTime())) return d

    // Try DD/MM/YYYY → MM/DD/YYYY swap for ambiguous dates
    const parts = datePart.split(/[\/\.]/)
    if (parts.length === 3) {
      const [a, b, c] = parts
      const swapped = new Date(`${b}/${a}/${c} ${timePart}`)
      if (!isNaN(swapped.getTime())) return swapped
    }
    return null
  } catch {
    return null
  }
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

    match = line.match(FORMAT_1)
    if (match) {
      ;[, datePart, timePart, sender] = match
    } else {
      match = line.match(FORMAT_2)
      if (match) {
        ;[, datePart, timePart, sender] = match
      } else {
        match = line.match(FORMAT_3)
        if (match) {
          ;[, datePart, timePart, sender] = match
        }
      }
    }

    if (!match || !sender) continue

    // Skip system messages
    const restOfLine = line.slice(match[0].length)
    if (SYSTEM_PATTERNS.some((p) => p.test(restOfLine) || p.test(sender))) continue
    if (SYSTEM_PATTERNS.some((p) => p.test(line))) continue

    const sentAt = parseDate(datePart.trim(), timePart.trim())
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
