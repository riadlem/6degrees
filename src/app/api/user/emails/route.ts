import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const rows = await prisma.userEmailAddress.findMany({
    where: { userId: session.user.id },
    orderBy: { isPrimary: "desc" },
  })

  return Response.json(rows)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : null
  if (!email || !email.includes("@")) return new Response("Invalid email", { status: 400 })

  const row = await prisma.userEmailAddress.upsert({
    where: { userId_email: { userId: session.user.id, email } },
    update: {},
    create: { userId: session.user.id, email },
  })

  return Response.json(row, { status: 201 })
}
