import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { enrichContactsFromPhoneBook } from "@/lib/phone-contact-enrich"

export async function POST(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // Direct sweep: clear HEIC data-URIs already in Contact table — Chrome/Firefox
  // cannot render them. Runs before the PhoneContact matching so enrichment can
  // then apply renderable JPEG thumbnails from PhoneContact where available.
  const heicCleared = await prisma.contact.updateMany({
    where: { userId, photoUrl: { startsWith: "data:image/heic" } },
    data: { photoUrl: null },
  })

  const count = await prisma.phoneContact.count({ where: { userId } })
  if (count === 0) return Response.json({ enriched: heicCleared.count, phones: 0, emails: 0, photos: 0, heicCleared: heicCleared.count })

  const result = await enrichContactsFromPhoneBook(userId)
  return Response.json({ ...result, heicCleared: heicCleared.count })
}
