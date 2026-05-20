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

  let matched = 0
  let updated = 0
  const notFound: string[] = []
  const matches: { contactId: string; photoFilename: string }[] = []

  for (const row of rows) {
    const slug = linkedinSlug(row.linkedin_url ?? "")

    let contact: { id: string } | null = null
    if (slug) {
      contact = await prisma.contact.findFirst({
        where: { userId, linkedinKey: { contains: slug, mode: "insensitive" } },
        select: { id: true },
      })
      if (!contact) {
        contact = await prisma.contact.findFirst({
          where: { userId, profileUrl: { contains: slug, mode: "insensitive" } },
          select: { id: true },
        })
      }
    }
    if (!contact && row.name) {
      const parts = row.name.trim().split(" ")
      const firstName = parts[0]
      const lastName = parts.slice(1).join(" ")
      if (firstName && lastName) {
        contact = await prisma.contact.findFirst({
          where: {
            userId,
            firstName: { equals: firstName, mode: "insensitive" },
            lastName: { equals: lastName, mode: "insensitive" },
          },
          select: { id: true },
        })
      }
    }

    if (!contact) {
      notFound.push(row.name ?? row.linkedin_url ?? "?")
      continue
    }

    matched++

    const data: Record<string, unknown> = { coworkEnrichedAt: new Date() }
    if (row.city)            data.city = row.city
    if (row.country)         data.country = row.country
    if (row.shared_contacts) { const n = parseInt(row.shared_contacts, 10); if (!isNaN(n)) data.commonConnections = n }
    if (row.title)           { data.headline = row.title; if (row.title.length <= 80) data.position = row.title }
    if (row.linkedin_url)    data.profileUrl = row.linkedin_url

    await prisma.contact.updateMany({ where: { id: contact.id, userId }, data })
    updated++

    // Return photo pairing so client can upload each photo individually
    if (row.photo_filename) {
      matches.push({ contactId: contact.id, photoFilename: row.photo_filename })
    }
  }

  return Response.json({ total: rows.length, matched, updated, notFound, matches })
}
