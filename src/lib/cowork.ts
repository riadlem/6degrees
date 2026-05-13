// Cowork enrichment service — included with Claude Max.
// Enriches LinkedIn contacts with profile photos and mutual connection counts.
// Configure COWORK_API_KEY and COWORK_API_URL in .env when ready to integrate.

export interface CoworkProfile {
  photoUrl?: string
  commonConnections?: number
  location?: string
  industry?: string
  headline?: string
  profileUrl?: string
}

export async function enrichContact(
  linkedinKey: string,
  firstName: string,
  lastName: string,
  company?: string | null
): Promise<CoworkProfile> {
  const apiUrl = process.env.COWORK_API_URL
  const apiKey = process.env.COWORK_API_KEY

  if (!apiUrl || !apiKey) {
    // Cowork not configured yet — return empty enrichment
    return {}
  }

  try {
    const res = await fetch(`${apiUrl}/enrich`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ linkedinKey, firstName, lastName, company }),
    })

    if (!res.ok) return {}
    return res.json()
  } catch {
    return {}
  }
}

export async function enrichBatch(
  contacts: Array<{
    linkedinKey: string
    firstName: string
    lastName: string
    company?: string | null
  }>
): Promise<Map<string, CoworkProfile>> {
  const apiUrl = process.env.COWORK_API_URL
  const apiKey = process.env.COWORK_API_KEY

  if (!apiUrl || !apiKey) return new Map()

  try {
    const res = await fetch(`${apiUrl}/enrich/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contacts }),
    })

    if (!res.ok) return new Map()
    const results: Array<{ linkedinKey: string } & CoworkProfile> =
      await res.json()

    return new Map(results.map((r) => [r.linkedinKey, r]))
  } catch {
    return new Map()
  }
}
