import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// CORS headers — endpoint is called from the Chrome extension (no cookie session)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

// Extract the slug from a LinkedIn profile URL
function slugFromUrl(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
  return m ? m[1].toLowerCase() : null
}

async function resolveUserId(request: Request): Promise<string | null> {
  // Try Bearer token first (Chrome extension)
  const auth = request.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (token) {
    const user = await prisma.user.findUnique({
      where: { extensionToken: token } as { extensionToken: string },
      select: { id: true },
    }).catch(() => null)
    return (user as { id: string } | null)?.id ?? null
  }
  // Fall back to session cookie (Settings page use)
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request)
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS })

  let body: { follows?: unknown[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS })
  }

  const follows = body.follows
  if (!Array.isArray(follows) || follows.length === 0) {
    return Response.json({ error: "follows array required" }, { status: 400, headers: CORS })
  }

  type FollowInput = { profileUrl?: string; firstName?: string; lastName?: string; headline?: string | null }
  const valid: FollowInput[] = (follows as FollowInput[]).filter(
    (f) => typeof f.profileUrl === "string" && f.profileUrl.includes("linkedin.com/in/")
  )
  if (valid.length === 0) {
    return Response.json({ error: "No valid LinkedIn profile URLs" }, { status: 400 })
  }

  // Load existing contacts for this user that have a profileUrl matching any of the follows
  const urls = valid.map((f) => f.profileUrl as string)
  const existing = await prisma.contact.findMany({
    where: { userId, profileUrl: { in: urls } },
    select: { id: true, profileUrl: true, linkedinKey: true },
  })
  const byUrl = new Map(existing.map((c) => [c.profileUrl, c]))

  let created = 0, updated = 0, skipped = 0

  for (const f of valid) {
    const url = f.profileUrl as string
    const slug = slugFromUrl(url)
    if (!slug) { skipped++; continue }

    const firstName = (f.firstName ?? "").trim() || "Unknown"
    const lastName  = (f.lastName  ?? "").trim() || null
    const headline  = (f.headline  ?? null) as string | null

    const existing = byUrl.get(url)
    if (existing) {
      // Contact already exists — enrich with headline/lastName if missing
      await prisma.contact.update({
        where: { id: existing.id },
        data: {
          ...(headline ? { headline } : {}),
          ...(lastName ? { lastName } : {}),
        },
      })
      updated++
    } else {
      // Create new contact with a follows-namespace key: "follow_<slug>"
      // This avoids collisions with connection keys ("firstname_lastname_date")
      const linkedinKey = `follow_${slug}`
      try {
        await prisma.contact.upsert({
          where: { userId_linkedinKey: { userId, linkedinKey } },
          update: {
            profileUrl: url,
            ...(headline ? { headline } : {}),
            ...(lastName ? { lastName } : {}),
          },
          create: {
            userId,
            linkedinKey,
            firstName,
            lastName: lastName ?? "",
            headline,
            profileUrl: url,
          },
        })
        created++
      } catch {
        skipped++
      }
    }
  }

  return Response.json({ created, updated, skipped, total: valid.length }, { headers: CORS })
}
