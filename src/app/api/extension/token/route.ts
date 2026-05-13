import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { randomBytes } from "crypto"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { extensionToken: true },
  })

  return Response.json({ token: user?.extensionToken ?? null })
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const token = randomBytes(32).toString("hex")

  await prisma.user.update({
    where: { id: session.user.id },
    data: { extensionToken: token },
  })

  return Response.json({ token })
}
