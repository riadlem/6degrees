export type ParsedLIDMConversation = {
  conversationId: string
  chatName: string        // the OTHER person's display name
  profileUrl: string | null  // the OTHER person's LinkedIn URL
  messages: ParsedLIDMMessage[]
}

export type ParsedLIDMMessage = {
  conversationId: string
  chatName: string
  profileUrl: string | null  // conversation partner's LinkedIn URL
  sentAt: Date
  isOutbound: boolean
  senderName: string
}

// ---------------------------------------------------------------------------
// CSV parser — handles BOM, quoted multi-line fields, and escaped quotes ("")
// ---------------------------------------------------------------------------

function parseCSV(text: string): string[][] {
  // Strip UTF-8 BOM if present
  const input = text.startsWith("﻿") ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: doubled quote → literal quote character
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          // Closing quote
          inQuotes = false
          i++
        }
      } else {
        field += ch
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === ',') {
        row.push(field)
        field = ""
        i++
      } else if (ch === '\r') {
        // CR or CRLF — end of record
        row.push(field)
        field = ""
        rows.push(row)
        row = []
        if (input[i + 1] === '\n') i++
        i++
      } else if (ch === '\n') {
        row.push(field)
        field = ""
        rows.push(row)
        row = []
        i++
      } else {
        field += ch
        i++
      }
    }
  }

  // Flush last field/row
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

// ---------------------------------------------------------------------------
// Raw row shape (indexed by header position)
// ---------------------------------------------------------------------------

interface RawMessage {
  conversationId: string
  conversationTitle: string
  from: string
  senderProfileUrl: string
  sentAt: Date
}

function parseDate(raw: string): Date | null {
  if (!raw || !raw.trim()) return null
  // "2024-01-15 10:23:45 UTC" → replace " UTC" suffix with "Z" for ISO parsing
  const normalized = raw.trim().replace(/\s+UTC$/i, "Z").replace(" ", "T")
  const d = new Date(normalized)
  return isNaN(d.getTime()) ? null : d
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseLinkedInDMExport(csvText: string): ParsedLIDMConversation[] {
  const rows = parseCSV(csvText)
  if (rows.length < 2) return []

  // Find the header row — first row containing "CONVERSATION ID"
  let headerIndex = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((cell) => cell.trim().toUpperCase() === "CONVERSATION ID")) {
      headerIndex = i
      break
    }
  }
  if (headerIndex === -1) return []

  const headers = rows[headerIndex].map((h) => h.trim().toUpperCase())

  const col = (name: string): number => headers.indexOf(name)
  const COL_CONV_ID    = col("CONVERSATION ID")
  const COL_CONV_TITLE = col("CONVERSATION TITLE")
  const COL_FROM       = col("FROM")
  const COL_PROFILE    = col("SENDER PROFILE URL")
  const COL_DATE       = col("DATE")

  if (COL_CONV_ID === -1 || COL_FROM === -1 || COL_DATE === -1) return []

  // Parse raw messages
  const rawMessages: RawMessage[] = []
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    // Skip completely empty rows
    if (row.every((cell) => cell.trim() === "")) continue

    const sentAt = parseDate(COL_DATE !== -1 ? (row[COL_DATE] ?? "") : "")
    if (!sentAt) continue

    rawMessages.push({
      conversationId:    (row[COL_CONV_ID]    ?? "").trim(),
      conversationTitle: (COL_CONV_TITLE !== -1 ? (row[COL_CONV_TITLE] ?? "") : "").trim(),
      from:              (row[COL_FROM]        ?? "").trim(),
      senderProfileUrl:  (COL_PROFILE !== -1 ? (row[COL_PROFILE] ?? "") : "").trim(),
      sentAt,
    })
  }

  if (rawMessages.length === 0) return []

  // ---------------------------------------------------------------------------
  // Auto-detect the exporting user
  //
  // Primary signal: SENDER PROFILE URL that appears in the most *distinct*
  // conversations. Tie-break: most messages overall.
  // Fallback (no profile URLs): FROM name that appears in the most distinct
  // conversations.
  // ---------------------------------------------------------------------------

  // Count by profile URL
  const urlConvSet = new Map<string, Set<string>>()  // url → set of convIds
  const urlMsgCount = new Map<string, number>()       // url → total messages

  for (const msg of rawMessages) {
    const url = msg.senderProfileUrl
    if (!url) continue
    if (!urlConvSet.has(url)) urlConvSet.set(url, new Set())
    urlConvSet.get(url)!.add(msg.conversationId)
    urlMsgCount.set(url, (urlMsgCount.get(url) ?? 0) + 1)
  }

  let userProfileUrl: string | null = null

  if (urlConvSet.size > 0) {
    let bestUrl = ""
    let bestConvCount = 0
    let bestMsgCount = 0

    for (const [url, convSet] of urlConvSet.entries()) {
      const convCount = convSet.size
      const msgCount  = urlMsgCount.get(url) ?? 0
      if (
        convCount > bestConvCount ||
        (convCount === bestConvCount && msgCount > bestMsgCount)
      ) {
        bestUrl       = url
        bestConvCount = convCount
        bestMsgCount  = msgCount
      }
    }

    userProfileUrl = bestUrl || null
  }

  // Fallback: detect user by FROM name when no profile URLs are present
  let userFromName: string | null = null

  if (!userProfileUrl) {
    const nameConvSet = new Map<string, Set<string>>()
    const nameMsgCount = new Map<string, number>()

    for (const msg of rawMessages) {
      const name = msg.from
      if (!name) continue
      if (!nameConvSet.has(name)) nameConvSet.set(name, new Set())
      nameConvSet.get(name)!.add(msg.conversationId)
      nameMsgCount.set(name, (nameMsgCount.get(name) ?? 0) + 1)
    }

    let bestName = ""
    let bestConvCount = 0
    let bestMsgCount = 0

    for (const [name, convSet] of nameConvSet.entries()) {
      const convCount = convSet.size
      const msgCount  = nameMsgCount.get(name) ?? 0
      if (
        convCount > bestConvCount ||
        (convCount === bestConvCount && msgCount > bestMsgCount)
      ) {
        bestName      = name
        bestConvCount = convCount
        bestMsgCount  = msgCount
      }
    }

    userFromName = bestName || null
  }

  // Helper: is a message authored by the detected user?
  function isFromUser(msg: RawMessage): boolean {
    if (userProfileUrl) {
      return msg.senderProfileUrl === userProfileUrl
    }
    return userFromName !== null && msg.from === userFromName
  }

  // ---------------------------------------------------------------------------
  // Group messages by conversationId
  // ---------------------------------------------------------------------------

  const convMap = new Map<string, RawMessage[]>()
  for (const msg of rawMessages) {
    if (!msg.conversationId) continue
    if (!convMap.has(msg.conversationId)) convMap.set(msg.conversationId, [])
    convMap.get(msg.conversationId)!.push(msg)
  }

  const conversations: ParsedLIDMConversation[] = []

  for (const [conversationId, msgs] of convMap.entries()) {
    // Determine the non-user participant
    let chatName: string | null = null
    let partnerProfileUrl: string | null = null

    for (const msg of msgs) {
      if (!isFromUser(msg)) {
        if (!chatName && msg.from) chatName = msg.from
        if (!partnerProfileUrl && msg.senderProfileUrl) partnerProfileUrl = msg.senderProfileUrl
        if (chatName && partnerProfileUrl) break
      }
    }

    // Skip conversations where we can't identify the other person
    if (!chatName) continue

    const messages: ParsedLIDMMessage[] = msgs.map((msg) => ({
      conversationId,
      chatName:   chatName!,
      profileUrl: partnerProfileUrl,
      sentAt:     msg.sentAt,
      isOutbound: isFromUser(msg),
      senderName: msg.from,
    }))

    conversations.push({
      conversationId,
      chatName,
      profileUrl: partnerProfileUrl,
      messages,
    })
  }

  return conversations
}
