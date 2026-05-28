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

  // Log to server console so it shows up in Vercel function logs
  console.log("[M2020 page-report]", JSON.stringify({ userId: user.id, ...body }, null, 2))

  return Response.json({ ok: true }, { headers: CORS })
}
