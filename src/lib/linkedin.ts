const LINKEDIN_API_BASE = "https://api.linkedin.com/rest"
const LINKEDIN_VERSION = "202312"

const LINKEDIN_HEADERS = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "LinkedIn-Version": LINKEDIN_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
  "Content-Type": "application/json",
})

export interface LinkedInConnection {
  "First Name": string
  "Last Name": string
  "Position": string
  "Company": string
  "Connected On": string
  "URL": string
  "Email Address": string
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

// Must be called before memberSnapshotData will return data.
// 201 = created, 409 = already exists — both are fine.
export async function ensureMemberAuthorization(accessToken: string): Promise<void> {
  const res = await fetch(`${LINKEDIN_API_BASE}/memberAuthorizations`, {
    method: "POST",
    headers: LINKEDIN_HEADERS(accessToken),
    body: JSON.stringify({}),
    cache: "no-store",
  })

  if (!res.ok && res.status !== 409) {
    const body = await res.text().catch(() => "")
    throw new Error(`LinkedIn authorization failed ${res.status}: ${body}`)
  }
}

// LinkedIn paginates elements by page index (0, 1, 2…), not by offset.
async function fetchDomainPage(
  accessToken: string,
  domain: string,
  pageIndex: number
): Promise<LinkedInSnapshotResponse> {
  const url = `${LINKEDIN_API_BASE}/memberSnapshotData?q=criteria&domain=${domain}&start=${pageIndex}&count=1`

  const res = await fetch(url, {
    headers: LINKEDIN_HEADERS(accessToken),
    cache: "no-store",
  })

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") ?? "unknown"
    throw new Error(
      `LinkedIn API rate limit reached (200 calls/day). Retry after ${retryAfter}s.`
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
  await ensureMemberAuthorization(accessToken)

  const connections: LinkedInConnection[] = []
  let pageIndex = 0

  while (true) {
    const data = await fetchDomainPage(accessToken, "CONNECTIONS", pageIndex)

    const element = data.elements?.[0]
    if (!element?.snapshotData?.length) break

    connections.push(...(element.snapshotData as LinkedInConnection[]))

    const hasNext = data.paging?.links?.some((l) => l.rel === "next")
    if (!hasNext) break

    pageIndex += 1
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
