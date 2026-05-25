import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// Proxy LinkedIn CDN images server-side to bypass CORS restrictions.
// LinkedIn CDN URLs are signed for linkedin.com origin — they return CORS errors
// when fetched directly from our domain. A server-side fetch has no CORS restriction.
// Security: only linkedin.com CDN URLs are proxied; session required.

export const runtime = "nodejs"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { searchParams } = new URL(req.url)
  const url = searchParams.get("url")

  if (!url) return new Response("Missing url", { status: 400 })

  // Restrict to LinkedIn CDN only
  if (
    !url.startsWith("https://media.licdn.com/") &&
    !url.startsWith("https://static.licdn.com/")
  ) {
    return new Response("Only LinkedIn CDN URLs may be proxied", { status: 403 })
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      // 8-second hard timeout
      signal: AbortSignal.timeout(8000),
    })

    if (!upstream.ok) {
      return new Response("Image not available", { status: 404 })
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg"
    const etag = upstream.headers.get("etag")
    const body = await upstream.arrayBuffer()

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      // Cache aggressively — LinkedIn CDN URLs have their own expiry (?e=...).
      // Our proxy URL changes whenever the source URL changes (it's a query param),
      // so cache-busting is automatic.
      "Cache-Control": "public, max-age=604800, immutable", // 7 days
    }
    // Forward upstream ETag so browsers and service workers can validate staleness cheaply.
    if (etag) responseHeaders["ETag"] = etag

    return new Response(body, { headers: responseHeaders })
  } catch {
    return new Response("Failed to fetch image", { status: 502 })
  }
}
