import prisma from "@/lib/prisma"
import { emitContactEvent } from "@/lib/contact-events"

// Ensure the linkedinDegree column exists (added after initial schema deploy)
let _colReady: Promise<void> | null = null
function ensureLinkedinDegreeCol() {
  if (_colReady) return _colReady
  _colReady = prisma.$executeRaw`
    ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "linkedinDegree" TEXT
  `.then(() => {}).catch(() => {})
  return _colReady
}

// This endpoint is called from the Chrome extension (chrome-extension:// origin).
// Security is token-based, so a permissive CORS origin is safe.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

// Used by the extension popup to verify a token is valid before saving.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return Response.json({ ok: false }, { status: 401, headers: CORS })

  const user = await prisma.user.findUnique({
    where: { extensionToken: token },
    select: { id: true },
  })
  if (!user) return Response.json({ ok: false }, { status: 401, headers: CORS })

  return Response.json({ ok: true }, { headers: CORS })
}

function extractSlug(profileUrl: string): string {
  const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/)
  return match ? match[1].toLowerCase() : profileUrl.toLowerCase()
}

// Convert a URL slug to a best-effort first/last name pair.
// "jean-luc-picard-42" → { firstName: "Jean-Luc", lastName: "Picard" }
function humanizeSlug(slug: string): { firstName: string; lastName: string } {
  const parts = slug
    .split("-")
    .filter((p) => p.length > 0 && !/^\d+$/.test(p)) // strip trailing numbers
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))

  if (parts.length === 0) return { firstName: slug, lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] }
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return new Response("Unauthorized", { status: 401, headers: CORS })

  const user = await prisma.user.findUnique({
    where: { extensionToken: token },
    select: { id: true },
  })
  if (!user) return new Response("Invalid token", { status: 401, headers: CORS })

  await ensureLinkedinDegreeCol()

  const body = await req.json().catch(() => null)
  if (!body?.profileUrl) {
    return Response.json({ error: "profileUrl is required" }, { status: 400, headers: CORS })
  }

  const {
    profileUrl,
    headline,
    photoUrl,
    location,
    city,
    country,
    degree,
    commonConnections,
    sharedConnections,
    addLabels,
  } = body

  const pendingReview: boolean = !!body.pendingReview

  // position / company — sent directly by the extension (parsed from headline)
  const position: string | null = body.position ?? null
  const company: string  | null = body.company  ?? null

  // firstName/lastName from scraper — fall back to humanizing the URL slug
  const slug = extractSlug(profileUrl)
  const fallback = humanizeSlug(slug)
  const firstName: string = body.firstName || fallback.firstName
  const lastName: string  = body.lastName  || fallback.lastName

  // Normalise degree: extension sends "1st"/"2nd"/"3rd" or bare "1"/"2"/"3"
  const normDegree = degree
    ? String(degree).match(/([123])/)?.[1] ?? null
    : null

  // Normalise city/country: translate French country names to English and
  // promote city→country when the city field contains a country name.
  const FR_COUNTRY: Record<string, string> = {
    "royaume-uni": "United Kingdom", "royaume uni": "United Kingdom",
    "états-unis": "United States", "etats-unis": "United States",
    "etats unis": "United States", "états unis": "United States",
    "usa": "United States",
    "allemagne": "Germany", "espagne": "Spain", "italie": "Italy",
    "pays-bas": "Netherlands", "belgique": "Belgium", "suisse": "Switzerland",
    "autriche": "Austria", "chine": "China", "japon": "Japan",
    "russie": "Russia", "pologne": "Poland",
    "grèce": "Greece", "grece": "Greece",
    "danemark": "Denmark", "norvège": "Norway", "norvege": "Norway",
    "suède": "Sweden", "suede": "Sweden",
    "finlande": "Finland", "irlande": "Ireland", "turquie": "Turkey",
    "maroc": "Morocco", "australie": "Australia",
    "brésil": "Brazil", "bresil": "Brazil",
    "mexique": "Mexico", "inde": "India",
    "égypte": "Egypt", "egypte": "Egypt",
    "afrique du sud": "South Africa",
    "emirats arabes unis": "United Arab Emirates",
    "émirats arabes unis": "United Arab Emirates",
    "arabie saoudite": "Saudi Arabia",
    "sénégal": "Senegal", "senegal": "Senegal",
    "côte d'ivoire": "Ivory Coast", "cote d'ivoire": "Ivory Coast",
    "cameroun": "Cameroon",
  }
  function normCountryName(v: string | null | undefined): string | null {
    if (!v) return v ?? null
    return FR_COUNTRY[v.trim().toLowerCase()] ?? v.trim()
  }
  // Resolve city/country:
  //   1. Translate French country names in `country` to English
  //   2. If `city` itself is a country name, promote it to `country` and clear `city`
  let resolvedCity:    string | null | undefined = city    != null ? city    : undefined
  let resolvedCountry: string | null | undefined = country != null ? normCountryName(country) : undefined
  if (city != null) {
    const cityAsCountry = FR_COUNTRY[city.toLowerCase()]
    if (cityAsCountry) {
      resolvedCity    = null                    // clear the wrongly-stored city
      resolvedCountry = resolvedCountry ?? cityAsCountry
    }
  }

  const enrichData = {
    // Only overwrite text fields when the scraper actually got a value —
    // null means "scraping failed", not "the field is blank on LinkedIn".
    // Overwriting with null would erase previously-saved data on re-visits.
    ...(headline != null  && { headline }),
    ...(photoUrl != null  && { photoUrl }),
    ...(location != null  && { location }),
    // city/country use resolved values (French names normalised + city↔country swap)
    ...(resolvedCity    !== undefined && { city:    resolvedCity }),
    ...(resolvedCountry !== undefined && { country: resolvedCountry }),
    ...(commonConnections != null && { commonConnections }),
    ...(sharedConnections !== undefined && { sharedConnections }),
    ...(position && { position }),
    ...(company  && { company }),
    // Always update linkedinDegree when we have a value (scrape can change: 2→1 after connecting)
    ...(normDegree != null && { linkedinDegree: normDegree }),
    profileUrl,
    extensionSyncedAt: new Date(),
  }

  // Look up by:
  //   1. profileUrl containing the slug  — matches DMA-synced contacts (key = "first|last|date")
  //   2. linkedinKey = slug              — matches contacts previously created by the extension
  const existing = await prisma.contact.findFirst({
    where: {
      userId: user.id,
      OR: [
        { profileUrl: { contains: `/in/${slug}`, mode: "insensitive" } },
        { linkedinKey: slug },
      ],
    },
    select: { id: true },
  })

  let contact
  let action: "updated" | "created"

  if (existing) {
    contact = await prisma.contact.update({
      where: { id: existing.id },
      data: enrichData,
      select: { id: true },
    })
    action = "updated"
  } else {
    contact = await prisma.contact.create({
      data: {
        userId: user.id,
        linkedinKey: slug,
        firstName,
        lastName,
        ...enrichData,
        headline:
          degree === "1st" || !degree
            ? (headline ?? null)
            : `[${degree}°] ${headline ?? ""}`.trim() || null,
        ...(pendingReview && { outreachStatus: "pending_review", outreachUpdatedAt: new Date() }),
      },
      select: { id: true },
    })
    action = "created"
  }

  // Auto-link any EventSpeaker records that match this contact (by LinkedIn key or name)
  // so that visiting a speaker's LinkedIn profile immediately reflects in the Events page.
  try {
    await prisma.eventSpeaker.updateMany({
      where: {
        userId: user.id,
        contactId: null,
        OR: [
          { linkedinKey: slug },
          {
            firstName: { equals: firstName, mode: "insensitive" },
            lastName:  { equals: lastName,  mode: "insensitive" },
          },
        ],
      },
      data: { contactId: contact.id },
    })
  } catch { /* non-critical */ }

  // Apply labels (e.g. "Followed") — create if needed, then assign
  if (Array.isArray(addLabels) && addLabels.length > 0) {
    for (const name of addLabels as string[]) {
      if (!name?.trim()) continue
      try {
        const label = await prisma.label.upsert({
          where: { userId_name: { userId: user.id, name: name.trim() } },
          update: {},
          create: { userId: user.id, name: name.trim(), color: "blue" },
        })
        await prisma.contactLabel.upsert({
          where: { contactId_labelId: { contactId: contact.id, labelId: label.id } },
          update: {},
          create: { contactId: contact.id, labelId: label.id },
        })
      } catch { /* ignore duplicate / constraint errors */ }
    }
  }

  // Broadcast to any open browser tabs so they can patch their caches live
  if (action === "updated") {
    emitContactEvent(user.id, {
      type: "contact_updated",
      contactId: contact.id,
      // Only include fields that were actually present in the payload
      ...(photoUrl     != null && { photoUrl }),
      ...(firstName              && { firstName }),
      ...(lastName               && { lastName }),
      ...(headline     != null && { headline }),
      ...(position               && { position }),
      ...(company                && { company }),
      ...(location     != null && { location }),
      ...(city         != null && { city }),
      ...(country      != null && { country }),
      ...(commonConnections != null && { commonConnections }),
    })
  } else {
    // New contact — tell the list to refetch so the card appears
    emitContactEvent(user.id, { type: "contact_created", contactId: contact.id })
  }

  return Response.json({ ok: true, action, contactId: contact.id }, { headers: CORS })
}
