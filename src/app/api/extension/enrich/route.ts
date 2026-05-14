import prisma from "@/lib/prisma"

// This endpoint is called from the Chrome extension (chrome-extension:// origin).
// Security is token-based, so a permissive CORS origin is safe.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
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
    industry,
    degree,
    commonConnections,
    sharedConnections,
    experience,
    education,
  } = body

  // firstName/lastName from scraper — fall back to humanizing the URL slug
  const slug = extractSlug(profileUrl)
  const fallback = humanizeSlug(slug)
  const firstName: string = body.firstName || fallback.firstName
  const lastName: string = body.lastName || fallback.lastName

  // Derive position / company from first experience entry
  const topRole = Array.isArray(experience) && experience.length > 0 ? experience[0] : null

  const enrichData = {
    ...(headline !== undefined && { headline }),
    ...(photoUrl !== undefined && { photoUrl }),
    ...(location !== undefined && { location }),
    ...(city !== undefined && { city }),
    ...(country !== undefined && { country }),
    ...(industry !== undefined && { industry }),
    ...(commonConnections !== undefined && { commonConnections }),
    ...(sharedConnections !== undefined && { sharedConnections }),
    ...(experience !== undefined && { experience }),
    ...(education !== undefined && { education }),
    profileUrl,
    ...(topRole?.title && { position: topRole.title }),
    ...(topRole?.company && { company: topRole.company }),
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
      },
      select: { id: true },
    })
    action = "created"
  }

  return Response.json({ ok: true, action, contactId: contact.id }, { headers: CORS })
}
