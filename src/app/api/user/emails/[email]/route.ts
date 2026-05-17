import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function DELETE(
  _req: Request,
  { params }: { params: { email: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const email = decodeURIComponent(params.email).toLowerCase().trim()

  await prisma.userEmailAddress.deleteMany({
    where: { userId: session.user.id, email },
  })

  return new Response(null, { status: 204 })
}
