import prisma from "@/lib/prisma"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) return new Response("Unauthorized", { status: 401, headers: CORS })

  const user = await prisma.user.findUnique({
    where: { extensionToken: token },
    select: { id: true, email: true },
  })
  if (!user) return new Response("Invalid token", { status: 401, headers: CORS })

  const body = await req.json().catch(() => ({}))

  // Log each field separately — Vercel truncates single large log lines
  console.log("[M2020] url:", body.url)
  console.log("[M2020] capturedFromApi:", body.capturedFromApi)
  console.log("[M2020] liLinksFound:", body.liLinksFound)
  console.log("[M2020] liLinkSamples:", JSON.stringify(body.liLinkSamples ?? []))
  console.log("[M2020] dominantCards:", JSON.stringify(body.dominantCards ?? []))
  console.log("[M2020] topClasses:", JSON.stringify((body.topClasses ?? []).slice(0, 30)))
  console.log("[M2020] sampleHtml_1:", (body.sampleHtml ?? "").slice(0, 500))
  console.log("[M2020] sampleHtml_2:", (body.sampleHtml ?? "").slice(500, 1000))
  console.log("[M2020] sampleHtml_3:", (body.sampleHtml ?? "").slice(1000, 1500))

  return Response.json({ ok: true }, { headers: CORS })
}
