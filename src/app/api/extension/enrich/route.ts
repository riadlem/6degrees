import prisma from "@/lib/prisma"
import { emitContactEvent } from "@/lib/contact-events"

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

  const enrichData = {
    // Only overwrite text fields when the scraper actually got a value —
    // null means "scraping failed", not "the field is blank on LinkedIn".
    // Overwriting with null would erase previously-saved data on re-visits.
    ...(headline != null  && { headline }),
    ...(photoUrl != null  && { photoUrl }),
    ...(location != null  && { location }),
    ...(city     != null  && { city }),
    ...(country  != null  && { country }),
    ...(commonConnections != null && { commonConnections }),
    ...(sharedConnections !== undefined && { sharedConnections }),
    ...(position && { position }),
    ...(company  && { company }),
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
