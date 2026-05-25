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
  // WhatsApp encryption key-change notifications
  /\bcode de sécurité avec .+ a changé\b/i,
  /\bsecurity code with .+ changed\b/i,
  /\bvotre code de sécurité\b/i,
  /\byour security code\b/i,
  /\ben savoir plus\b/i,               // "En savoir plus" footer on WA system bubbles
  /\btap to learn more\b/i,
]

// OTP / security-code messages — automated, never count as real interaction.
// These are typically SMS-forwarded 2FA codes or app verification codes.
const OTP_PATTERNS = [
  /\bne partagez pas\b/i,              // FR: "Ne partagez pas ce code"
  /\bdo not share\b/i,                 // EN: "Do not share this code"
  /\bpas le partager\b/i,
  /\bcode de vérification\b/i,
  /\bcode de verification\b/i,
  /\bverification code\b/i,
  /\bcode de sécurité\b/i,
  /\bsecurity code\b/i,
  /\bone.?time\s*(pass|code|password|pin)\b/i,
  /\bvotre code\b.*\d{4,8}/i,          // "votre code est 123456"
  /\byour code\b.*\d{4,8}/i,
  /\bcode\b.*\b(whatsapp|google|apple|facebook|instagram|telegram)\b/i,
  /^G-\d{4,8}\b/,                      // Google SMS codes ("G-123456 is your …")
  /^\d{4,8}\s+is your\b/i,             // "123456 is your code"
  /^\d{4,8}\s+est\b/i,                 // "123456 est votre code"
  /^\s*\d{4,8}\s*$/,                   // message is only a numeric code
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

    // Skip system messages and automated OTP/security-code messages
    const restOfLine = line.slice(match[0].length)
    if (SYSTEM_PATTERNS.some((p) => p.test(restOfLine) || p.test(sender))) continue
    if (SYSTEM_PATTERNS.some((p) => p.test(line))) continue
    if (OTP_PATTERNS.some((p) => p.test(restOfLine))) continue

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
  // Strip "WhatsApp Chat with " prefix — all known locale variants
  name = name
    .replace(/^WhatsApp Chat with\s+/i, "")        // English
    .replace(/^Discussion WhatsApp avec\s+/i, "")   // French Android (most common)
    .replace(/^Chat WhatsApp avec\s+/i, "")         // French (alternate)
    .replace(/^WhatsApp-Chat mit\s+/i, "")          // German
    .replace(/^Conversa do WhatsApp com\s+/i, "")   // Portuguese
    .replace(/^Chat de WhatsApp con\s+/i, "")       // Spanish
    .replace(/^Chat WhatsApp con\s+/i, "")          // Italian
  return name.trim()
}
