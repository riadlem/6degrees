const LINKEDIN_API_BASE = "https://api.linkedin.com/rest"
const LINKEDIN_VERSION = "202312"

// GET requests must not include Content-Type; only POST needs it.
const LINKEDIN_GET_HEADERS = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "LinkedIn-Version": LINKEDIN_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
})

const LINKEDIN_POST_HEADERS = (accessToken: string) => ({
  ...LINKEDIN_GET_HEADERS(accessToken),
  "Content-Type": "application/json",
})

function fetchWithTimeout(url: string, options: RequestInit, ms = 30_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...options, signal: ctrl.signal })
    .then((r) => { clearTimeout(timer); return r })
    .catch((e) => {
      clearTimeout(timer)
      if (e?.name === "AbortError") throw new Error(`LinkedIn API timed out after ${ms / 1000}s`)
      throw e
    })
}

export interface LinkedInConnection {
  "First Name": string
  "Last Name": string
  "Position": string
  "Company": string
  "Connected On": string
  "URL": string
  "Email Address": string
}

export interface ConnectionsPage {
  connections: LinkedInConnection[]
  total: number
  hasNext: boolean
}

// Must be called before memberSnapshotData will return data.
// 201 = created, 409 = already exists — both are fine.
export async function ensureMemberAuthorization(accessToken: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${LINKEDIN_API_BASE}/memberAuthorizations`,
    {
      method: "POST",
      headers: LINKEDIN_POST_HEADERS(accessToken),
      body: JSON.stringify({}),
      cache: "no-store",
    },
    20_000,
  )

  if (!res.ok && res.status !== 409) {
    const body = await res.text().catch(() => "")
    throw new Error(`LinkedIn authorization failed ${res.status}: ${body}`)
  }
}

// Fetch a single page of connections by 0-based page index.
export async function fetchConnectionsPage(
  accessToken: string,
  pageIndex: number,
): Promise<ConnectionsPage> {
  const offset = pageIndex * 100          // start = item offset, not page index
  const url =
    `${LINKEDIN_API_BASE}/memberSnapshotData` +
    `?q=criteria&domain=CONNECTIONS&start=${offset}&count=100`

  const res = await fetchWithTimeout(
    url,
    { headers: LINKEDIN_GET_HEADERS(accessToken), cache: "no-store" },
    30_000,
  )

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") ?? "unknown"
    throw new Error(`LinkedIn rate limit hit. Retry after ${retryAfter}s.`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`LinkedIn API error ${res.status}: ${body}`)
  }

  const data = await res.json()
  const element = data.elements?.[0]
  const connections = (element?.snapshotData as LinkedInConnection[]) ?? []
  const total: number = data.paging?.total ?? 0
  const hasNext: boolean = (data.paging?.links ?? []).some(
    (l: { rel: string }) => l.rel === "next",
  )

  return { connections, total, hasNext }
}

// Parse LinkedIn's date format: "DD Mon YYYY" or "YYYY-MM-DD"
export function parseLinkedInDate(raw: string): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

// Deterministic key used for upsert de-duplication
export function connectionKey(c: LinkedInConnection): string {
  return [c["First Name"], c["Last Name"], c["Connected On"]].join("|").toLowerCase()
}
