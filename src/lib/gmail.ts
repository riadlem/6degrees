import prisma from "@/lib/prisma"

export const GMAIL_SCOPES = "https://www.googleapis.com/auth/gmail.readonly"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

export async function getGmailAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "gmail" },
  })
  if (!account?.access_token) return null

  const nowSec = Math.floor(Date.now() / 1000)
  if (account.expires_at && account.expires_at > nowSec + 60) {
    return account.access_token
  }

  if (!account.refresh_token) return null

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  })

  if (!res.ok) return null
  const data = await res.json()

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: data.expires_in ? nowSec + data.expires_in : null,
    },
  })

  return data.access_token as string
}

export async function fetchMessageList(
  token: string,
  pageToken?: string,
): Promise<{ messages: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number }> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
  url.searchParams.set("q", "in:sent OR in:inbox")
  url.searchParams.set("maxResults", "100")
  if (pageToken) url.searchParams.set("pageToken", pageToken)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Gmail list error: ${res.status}`)
  return res.json()
}

export async function fetchMessageMetadata(
  token: string,
  msgId: string,
): Promise<{ id: string; payload: { headers: { name: string; value: string }[] } } | null> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}`)
  url.searchParams.set("format", "metadata")
  url.searchParams.set("metadataHeaders", "From")
  url.searchParams.set("metadataHeaders", "To")
  url.searchParams.set("metadataHeaders", "Cc")
  url.searchParams.set("metadataHeaders", "Subject")
  url.searchParams.set("metadataHeaders", "Date")
  url.searchParams.set("metadataHeaders", "Message-ID")

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Gmail message error: ${res.status}`)
  return res.json()
}

export async function fetchGmailProfile(token: string): Promise<{ emailAddress: string } | null> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}

export async function fetchHistoryList(
  token: string,
  startHistoryId: string,
  pageToken?: string,
): Promise<{ history?: { messagesAdded?: { message: { id: string } }[] }[]; nextPageToken?: string; historyId?: string }> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history")
  url.searchParams.set("startHistoryId", startHistoryId)
  url.searchParams.set("historyTypes", "messageAdded")
  if (pageToken) url.searchParams.set("pageToken", pageToken)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Gmail history error: ${res.status}`)
  return res.json()
}

type ParsedEmail = { name: string | null; email: string }

export function parseNameEmail(raw: string): ParsedEmail {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/)
  if (match) return { name: match[1].trim() || null, email: match[2].trim().toLowerCase() }
  return { name: null, email: raw.trim().toLowerCase() }
}

export function normalizeEmail(email: string): string {
  const lower = email.toLowerCase().trim()
  // Strip Gmail +alias
  return lower.replace(/(\+[^@]*)(@gmail\.com)$/, "$2")
}

type ParsedMessage = {
  gmailId: string
  threadId: string
  subject: string | null
  fromEmail: string
  fromName: string | null
  toEmails: string[]
  sentAt: Date
  isOutbound: boolean
}

export function parseMessageHeaders(
  msg: { id: string; threadId?: string; payload: { headers: { name: string; value: string }[] } },
  userEmails: string | string[],
): ParsedMessage | null {
  const h = (name: string) =>
    msg.payload.headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? ""

  const from = h("From")
  const to = h("To")
  const subject = h("Subject") || null
  const dateStr = h("Date")

  if (!from || !dateStr) return null

  const sentAt = new Date(dateStr)
  if (isNaN(sentAt.getTime())) return null

  const { email: fromEmail, name: fromName } = parseNameEmail(from)
  const toEmails = to
    .split(",")
    .map((t) => parseNameEmail(t.trim()).email)
    .filter(Boolean)

  const emailList = Array.isArray(userEmails) ? userEmails : [userEmails]
  const isOutbound = emailList.some((e) => normalizeEmail(fromEmail) === normalizeEmail(e))

  return {
    gmailId: msg.id,
    threadId: msg.threadId ?? msg.id,
    subject,
    fromEmail: normalizeEmail(fromEmail),
    fromName,
    toEmails,
    sentAt,
    isOutbound,
  }
}
