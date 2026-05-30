import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id
  const email = new URL(req.url).searchParams.get("email")

  if (email) {
    await Promise.all([
      prisma.account.deleteMany({ where: { userId, provider: "gmail", providerAccountId: email } }),
      prisma.gmailSync.deleteMany({ where: { userId, gmailEmail: email } }),
    ])
  } else {
    await Promise.all([
      prisma.account.deleteMany({ where: { userId, provider: "gmail" } }),
      prisma.gmailSync.deleteMany({ where: { userId } }),
    ])
  }
  return Response.json({ ok: true })
}
