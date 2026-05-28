import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { searchParams } = new URL(req.url)
  const eventSlug = searchParams.get("eventSlug") || "money2020-europe-2026"

  const speakers = await prisma.eventSpeaker.findMany({
    where: { userId: session.user.id, eventSlug },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileUrl: true,
          linkedinKey: true,
          linkedinDegree: true,
          connectedOn: true,
        },
      },
    },
    orderBy: [{ sessionTopic: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  })

  return Response.json(speakers)
}

// Accepts extension Bearer token OR NextAuth session
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""

  let userId: string

  if (token) {
    const user = await prisma.user.findUnique({
      where: { extensionToken: token },
      select: { id: true },
    })
    if (!user) return new Response("Invalid token", { status: 401, headers: CORS })
    userId = user.id
  } else {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401, headers: CORS })
    userId = session.user.id
  }

  const body = await req.json().catch(() => null)
  if (!body?.speakers || !Array.isArray(body.speakers)) {
    return Response.json({ error: "speakers array required" }, { status: 400, headers: CORS })
  }

  const eventSlug: string = body.eventSlug || "money2020-europe-2026"
  const eventName: string = body.eventName || "Money 20/20 Europe 2026"

  const results: Array<{ ok: boolean; id?: string; firstName: string; lastName: string; action?: string; error?: string }> = []

  for (const spk of body.speakers as Record<string, unknown>[]) {
    const firstName = (spk.firstName as string | undefined)?.trim() || ""
    const lastName = (spk.lastName as string | undefined)?.trim() || ""
    if (!firstName || !lastName) continue

    const role = (spk.role as string | undefined) || null
    const company = (spk.company as string | undefined) || null
    const description = (spk.description as string | undefined) || null
    const sessionTopic = (spk.sessionTopic as string | undefined) || null
    const photoUrl = (spk.photoUrl as string | undefined) || null
    let linkedinUrl = (spk.linkedinUrl as string | undefined) || null

    // Normalise LinkedIn URL
    let linkedinKey: string | null = null
    if (linkedinUrl) {
      const m = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/)
      if (m) {
        linkedinKey = m[1].toLowerCase()
        linkedinUrl = `https://www.linkedin.com/in/${linkedinKey}/`
      } else {
        linkedinUrl = null
      }
    }

    // Auto-match to existing contact by LinkedIn key or name+company
    let contactId: string | null = null
    if (linkedinKey) {
      const c = await prisma.contact.findFirst({
        where: {
          userId,
          OR: [
            { linkedinKey },
            { profileUrl: { contains: `/in/${linkedinKey}`, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      })
      if (c) contactId = c.id
    }
    if (!contactId) {
      const c = await prisma.contact.findFirst({
        where: {
          userId,
          firstName: { equals: firstName, mode: "insensitive" },
          lastName: { equals: lastName, mode: "insensitive" },
          ...(company ? { company: { equals: company, mode: "insensitive" } } : {}),
        },
        select: { id: true },
      })
      if (c) contactId = c.id
    }

    const speakerKey = [
      eventSlug,
      firstName.toLowerCase(),
      lastName.toLowerCase(),
      (company || "").toLowerCase(),
    ].join(":")

    try {
      const result = await prisma.eventSpeaker.upsert({
        where: { userId_speakerKey: { userId, speakerKey } },
        update: {
          ...(role !== null && { role }),
          ...(company !== null && { company }),
          ...(description !== null && { description }),
          ...(sessionTopic !== null && { sessionTopic }),
          ...(linkedinUrl !== null && { linkedinUrl }),
          ...(linkedinKey !== null && { linkedinKey }),
          ...(photoUrl !== null && { photoUrl }),
          ...(contactId !== null && { contactId }),
        },
        create: {
          userId,
          eventSlug,
          eventName,
          speakerKey,
          firstName,
          lastName,
          role,
          company,
          description,
          sessionTopic,
          linkedinUrl,
          linkedinKey,
          photoUrl,
          contactId,
        },
        select: { id: true, firstName: true, lastName: true },
      })
      results.push({ ok: true, id: result.id, firstName: result.firstName, lastName: result.lastName, action: "upserted" })
    } catch (e) {
      results.push({ ok: false, firstName, lastName, error: String(e) })
    }
  }

  return Response.json(
    { ok: true, imported: results.filter((r) => r.ok).length, results },
    { headers: CORS }
  )
}
