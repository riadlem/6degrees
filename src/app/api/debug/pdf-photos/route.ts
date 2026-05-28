import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { fetchImageDataUrl } from "@/lib/speakers-pdf"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5"), 20)

  const speakers = await prisma.eventSpeaker.findMany({
    where: { userId, photoUrl: { not: null } },
    select: { firstName: true, lastName: true, photoUrl: true },
    take: limit,
  })

  const results = await Promise.all(
    speakers.map(async (s: { firstName: string; lastName: string; photoUrl: string | null }) => {
      const url = s.photoUrl!
      const start = Date.now()
      let status: number | null = null
      let contentType: string | null = null
      let bytes: number | null = null
      let error: string | null = null
      let dataUrl: string | null = null

      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://europe.money2020.com/",
          },
        })
        status = res.status
        contentType = res.headers.get("content-type")
        const buf = await res.arrayBuffer()
        bytes = buf.byteLength
      } catch (e) {
        error = String(e)
      }

      // Also test via the shared helper
      dataUrl = await fetchImageDataUrl(url)

      return {
        name: `${s.firstName} ${s.lastName}`,
        url: url.slice(0, 120) + (url.length > 120 ? "…" : ""),
        status,
        contentType,
        bytes,
        helperResult: dataUrl ? `data URL, ${dataUrl.length} chars` : "null (failed)",
        ms: Date.now() - start,
        error,
      }
    })
  )

  return Response.json({ tested: results.length, results }, { headers: { "Content-Type": "application/json" } })
}
