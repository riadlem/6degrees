import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const { name, level, filterType, filterValue } = body

  if (!filterType || !filterValue) {
    return Response.json({ error: "filterType and filterValue are required" }, { status: 400 })
  }
  if (![1, 2, 3].includes(Number(level))) {
    return Response.json({ error: "level must be 1, 2, or 3" }, { status: 400 })
  }

  const share = await prisma.contactShare.create({
    data: {
      userId,
      name: name?.trim() || null,
      level: Number(level),
      filterType,
      filterValue: typeof filterValue === "string" ? filterValue : JSON.stringify(filterValue),
    },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? ""
  return Response.json({ token: share.token, url: `${baseUrl}/contacts/share/${share.token}` })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const shares = await prisma.contactShare.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, name: true, level: true, filterType: true, enabled: true, createdAt: true },
  })

  return Response.json({ shares })
}
