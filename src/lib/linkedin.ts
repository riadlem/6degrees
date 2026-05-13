const LINKEDIN_API_BASE = "https://api.linkedin.com/rest"
const LINKEDIN_VERSION = "202312"

export interface LinkedInConnection {
  "First Name": string
  "Last Name": string
  "Position": string
  "Company": string
  "Connected On": string
}

export interface LinkedInSnapshotResponse {
  elements: Array<{
    snapshotDomain: string
    snapshotData: unknown[]
  }>
  paging: {
    total: number
    start: number
    count: number
    links: Array<{ rel: string; href: string }>
  }
}

async function fetchDomainPage(
  accessToken: string,
  domain: string,
  start: number,
  count: number
): Promise<LinkedInSnapshotResponse> {
  const url = `${LINKEDIN_API_BASE}/memberSnapshotData?q=criteria&domain=${domain}&start=${start}&count=${count}`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "Content-Type": "application/json",
    },
    // Don't cache — fresh data every sync
    cache: "no-store",
  })

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") ?? "unknown"
    throw new Error(
      `LinkedIn API rate limit reached (200 calls/day). Retry after ${retryAfter}s.`
    )
  }

  if (res.status === 404) {
    throw new Error(
      "LinkedIn has no exported data available yet. Go to linkedin.com → Settings → Data Privacy → Get a copy of your data, request your data, wait for the email confirmation, then try syncing again."
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`LinkedIn API error ${res.status}: ${body}`)
  }

  return res.json()
}

export async function fetchAllConnections(
  accessToken: string
): Promise<LinkedInConnection[]> {
  const connections: LinkedInConnection[] = []
  let start = 0
  const count = 100

  while (true) {
    const data = await fetchDomainPage(accessToken, "CONNECTIONS", start, count)

    const element = data.elements?.[0]
    if (!element?.snapshotData?.length) break

    connections.push(...(element.snapshotData as LinkedInConnection[]))

    const hasNext = data.paging?.links?.some((l) => l.rel === "next")
    if (!hasNext) break

    start += count
  }

  return connections
}

// Parse LinkedIn's date format: "DD Mon YYYY" or "YYYY-MM-DD"
export function parseLinkedInDate(raw: string): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

// Deterministic key used for upsert de-duplication
export function connectionKey(c: LinkedInConnection): string {
  return [c["First Name"], c["Last Name"], c["Connected On"]]
    .join("|")
    .toLowerCase()
}
