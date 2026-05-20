import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const body = await req.json() as { url?: string; data?: string }

  // Accept a pre-built data URI directly (used by bulk import)
  if (body.data) {
    const data = body.data.trim()
    if (!data.startsWith("data:image/")) {
      return Response.json({ error: "data must be a data:image/… URI" }, { status: 400 })
    }
    await prisma.contact.update({
      where: { id: params.id },
      data: { photoUrl: data, coworkEnrichedAt: new Date() },
    })
    return Response.json({ ok: true })
  }

  const url = body.url?.trim()
  if (!url) return Response.json({ error: "url or data is required" }, { status: 400 })

  // Validate it looks like a URL before fetching
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return Response.json({ error: "Only http/https URLs are supported" }, { status: 400 })
    }
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 })
  }

  // Fetch the image server-side (avoids CORS, handles redirects)
  let imageRes: Response
  try {
    imageRes = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; 6degrees/1.0)",
        Accept: "image/*",
      },
      redirect: "follow",
    })
  } catch {
    return Response.json({ error: "Failed to fetch image" }, { status: 422 })
  }

  if (!imageRes.ok) {
    return Response.json({ error: `Image URL returned ${imageRes.status}` }, { status: 422 })
  }

  const contentType = imageRes.headers.get("content-type") ?? ""
  const mimeType = contentType.split(";")[0].trim()
  if (!mimeType.startsWith("image/")) {
    return Response.json({ error: "URL does not point to an image" }, { status: 422 })
  }

  const buffer = await imageRes.arrayBuffer()
  if (buffer.byteLength > 5 * 1024 * 1024) {
    return Response.json({ error: "Image too large (max 5 MB)" }, { status: 422 })
  }

  const base64 = Buffer.from(buffer).toString("base64")
  const dataUri = `data:${mimeType};base64,${base64}`

  await prisma.contact.update({
    where: { id: params.id },
    data: { photoUrl: dataUri },
  })

  return Response.json({ ok: true })
}
