import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "image/jpeg,image/png,image/*;q=0.5",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://europe.money2020.com/",
}

async function tryFetch(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow", headers: HEADERS })
    const buf = await res.arrayBuffer()
    const ct = res.headers.get("content-type") ?? ""
    const b64prefix = Buffer.from(buf.slice(0, 4)).toString("base64")
    return { status: res.status, contentType: ct, bytes: buf.byteLength, b64prefix, error: null }
  } catch (e) {
    return { status: null, contentType: null, bytes: null, b64prefix: null, error: String(e) }
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "3"), 10)

  const speakers = await prisma.eventSpeaker.findMany({
    where: { userId, photoUrl: { not: null } },
    select: { firstName: true, lastName: true, photoUrl: true },
    take: limit,
  })

  const results = await Promise.all(
    speakers.map(async (s: { firstName: string; lastName: string; photoUrl: string | null }) => {
      const original = s.photoUrl!
      const jpegUrl  = original.replace(/([?&]format=)webp/i, "$1jpeg")
      const pngUrl   = original.replace(/([?&]format=)webp/i, "$1png")
      const noFormat = original.replace(/([?&])format=webp&?/i, "$1").replace(/[&?]$/, "")

      const [origResult, jpegResult, pngResult, noFmtResult] = await Promise.all([
        tryFetch(original),
        jpegUrl !== original ? tryFetch(jpegUrl) : Promise.resolve(null),
        tryFetch(pngUrl),
        tryFetch(noFormat),
      ])

      return {
        name: `${s.firstName} ${s.lastName}`,
        original: { url: original.slice(0, 100), ...origResult },
        "format=jpeg": jpegUrl !== original ? { url: jpegUrl.slice(0, 100), ...jpegResult } : "same URL",
        "format=png":  { url: pngUrl.slice(0, 100), ...pngResult },
        "no format":   { url: noFormat.slice(0, 100), ...noFmtResult },
      }
    })
  )

  return Response.json({ tested: results.length, results }, { headers: { "Content-Type": "application/json" } })
}
