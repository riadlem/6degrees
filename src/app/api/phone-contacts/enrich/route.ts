import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { enrichContactsFromPhoneBook } from "@/lib/phone-contact-enrich"

export async function POST(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const count = await prisma.phoneContact.count({ where: { userId } })
  if (count === 0) return Response.json({ enriched: 0, phones: 0, emails: 0, photos: 0 })

  const result = await enrichContactsFromPhoneBook(userId)
  return Response.json(result)
}
