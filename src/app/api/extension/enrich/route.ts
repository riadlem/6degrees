import prisma from "@/lib/prisma"

function extractLinkedinKey(profileUrl: string): string {
  // e.g. https://www.linkedin.com/in/john-doe/ → john-doe
  const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/)
  return match ? match[1].toLowerCase() : profileUrl
}

export async function POST(req: Request) {
  // Auth via Bearer token
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return new Response("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({
    where: { extensionToken: token },
    select: { id: true },
  })
  if (!user) return new Response("Invalid token", { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || !body.profileUrl) {
    return Response.json({ error: "profileUrl is required" }, { status: 400 })
  }

  const {
    profileUrl,
    firstName,
    lastName,
    headline,
    photoUrl,
    location,
    city,
    country,
    degree,
    commonConnections,
    sharedConnections,
    experience,
    education,
  } = body

  const linkedinKey = extractLinkedinKey(profileUrl)

  // Derive position / company from experience[0] if not supplied separately
  const topRole = Array.isArray(experience) && experience.length > 0 ? experience[0] : null

  const enrichData = {
    ...(headline !== undefined && { headline }),
    ...(photoUrl !== undefined && { photoUrl }),
    ...(location !== undefined && { location }),
    ...(city !== undefined && { city }),
    ...(country !== undefined && { country }),
    ...(commonConnections !== undefined && { commonConnections }),
    ...(sharedConnections !== undefined && { sharedConnections }),
    ...(experience !== undefined && { experience }),
    ...(education !== undefined && { education }),
    ...(profileUrl && { profileUrl }),
    ...(topRole?.title && { position: topRole.title }),
    ...(topRole?.company && { company: topRole.company }),
    extensionSyncedAt: new Date(),
  }

  const existing = await prisma.contact.findFirst({
    where: { userId: user.id, linkedinKey },
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
    // Full capture for non-connections (or unsynced connections)
    if (!firstName || !lastName) {
      return Response.json({ error: "firstName and lastName required for new contacts" }, { status: 400 })
    }
    contact = await prisma.contact.create({
      data: {
        userId: user.id,
        linkedinKey,
        firstName,
        lastName,
        ...enrichData,
        // Mark degree so UI can distinguish
        headline: degree === "1st"
          ? (headline ?? null)
          : `[${degree ?? "?"}°] ${headline ?? ""}`.trim(),
      },
      select: { id: true },
    })
    action = "created"
  }

  return Response.json({ ok: true, action, contactId: contact.id })
}
