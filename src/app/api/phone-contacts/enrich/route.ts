import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { enrichContactsFromPhoneBook } from "@/lib/phone-contact-enrich"

export async function POST(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // Sweep 1: clear HEIC data-URIs — unrenderable in Chrome/Firefox
  // Sweep 2: clear expired LinkedIn CDN URLs — https://media.licdn.com/ urls
  //   expire after a few months and show broken img icons
  // Both sweeps run before the PhoneContact matching so the enrichment loop
  // can then apply fresh JPEG thumbnails from PhoneContact where available.
  const [heicCleared, linkedinCleared] = await Promise.all([
    prisma.contact.updateMany({
      where: { userId, photoUrl: { startsWith: "data:image/heic" } },
      data: { photoUrl: null },
    }),
    prisma.contact.updateMany({
      where: { userId, photoUrl: { startsWith: "https://media.licdn.com/" } },
      data: { photoUrl: null },
    }),
  ])

  const photosCleared = heicCleared.count + linkedinCleared.count

  const count = await prisma.phoneContact.count({ where: { userId } })
  if (count === 0) return Response.json({ enriched: photosCleared, phones: 0, emails: 0, photos: 0, photosCleared })

  const result = await enrichContactsFromPhoneBook(userId)
  return Response.json({ ...result, photosCleared })
}
