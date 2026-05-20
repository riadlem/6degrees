import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

type CoworkRow = {
  name?: string
  city?: string
  country?: string
  shared_contacts?: string
  title?: string
  linkedin_url?: string
  photo_filename?: string
}

function linkedinSlug(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
  return m ? m[1].toLowerCase() : null
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json() as { rows?: CoworkRow[] }
  const rows = body.rows
  if (!rows?.length) return Response.json({ error: "rows array is required" }, { status: 400 })

  // ── 1. Extract slugs and name pairs from all rows ────────────────────────
  const slugs = rows.map((r) => linkedinSlug(r.linkedin_url ?? "")).filter(Boolean) as string[]
  const namePairs = rows
    .filter((r) => r.name)
    .map((r) => {
      const parts = r.name!.trim().split(" ")
      return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
    })
    .filter((p) => p.firstName && p.lastName)

  // ── 2. Single query: match by linkedinKey slug ───────────────────────────
  const bySlug = slugs.length
    ? await prisma.contact.findMany({
        where: { userId, linkedinKey: { in: slugs, mode: "insensitive" } },
        select: { id: true, linkedinKey: true, profileUrl: true },
      })
    : []

  // Also try profileUrl contains slug (contacts imported via CSV without linkedinKey match)
  const profileMatches = slugs.length
    ? await prisma.contact.findMany({
        where: {
          userId,
          profileUrl: { in: slugs.map((s) => `https://www.linkedin.com/in/${s}`), mode: "insensitive" },
          NOT: { id: { in: bySlug.map((c) => c.id) } },
        },
        select: { id: true, linkedinKey: true, profileUrl: true },
      })
    : []

  // ── 3. Single query: fallback match by first+last name ───────────────────
  const byName = namePairs.length
    ? await prisma.contact.findMany({
        where: {
          userId,
          NOT: { id: { in: [...bySlug, ...profileMatches].map((c) => c.id) } },
          OR: namePairs.map((p) => ({
            firstName: { equals: p.firstName, mode: "insensitive" as const },
            lastName:  { equals: p.lastName,  mode: "insensitive" as const },
          })),
        },
        select: { id: true, firstName: true, lastName: true },
      })
    : []

  // ── 4. Build lookup maps ─────────────────────────────────────────────────
  const slugToId = new Map<string, string>()
  for (const c of [...bySlug, ...profileMatches]) {
    if (c.linkedinKey) slugToId.set(c.linkedinKey.toLowerCase(), c.id)
    if (c.profileUrl) {
      const s = linkedinSlug(c.profileUrl)
      if (s) slugToId.set(s, c.id)
    }
  }

  const nameToId = new Map<string, string>()
  for (const c of byName) {
    nameToId.set(`${c.firstName.toLowerCase()}|${c.lastName.toLowerCase()}`, c.id)
  }

  // ── 5. Match each row to a contact ID ────────────────────────────────────
  const matched: { contactId: string; row: CoworkRow }[] = []
  const notFound: string[] = []

  for (const row of rows) {
    const slug = linkedinSlug(row.linkedin_url ?? "")
    let contactId = slug ? slugToId.get(slug) : undefined

    if (!contactId && row.name) {
      const parts = row.name.trim().split(" ")
      const key = `${parts[0].toLowerCase()}|${parts.slice(1).join(" ").toLowerCase()}`
      contactId = nameToId.get(key)
    }

    if (contactId) {
      matched.push({ contactId, row })
    } else {
      notFound.push(row.name ?? row.linkedin_url ?? "?")
    }
  }

  // ── 6. Bulk update in a transaction ─────────────────────────────────────
  const now = new Date()
  const matches: { contactId: string; photoFilename: string }[] = []

  await prisma.$transaction(
    matched.map(({ contactId, row }) => {
      const data: Record<string, unknown> = { coworkEnrichedAt: now }
      if (row.city)            data.city = row.city
      if (row.country)         data.country = row.country
      if (row.shared_contacts) { const n = parseInt(row.shared_contacts, 10); if (!isNaN(n)) data.commonConnections = n }
      if (row.title)           { data.headline = row.title; if (row.title.length <= 80) data.position = row.title }
      if (row.linkedin_url)    data.profileUrl = row.linkedin_url
      if (row.photo_filename)  matches.push({ contactId, photoFilename: row.photo_filename })
      return prisma.contact.updateMany({ where: { id: contactId, userId }, data })
    })
  )

  return Response.json({
    total: rows.length,
    matched: matched.length,
    updated: matched.length,
    notFound,
    matches,
  })
}
