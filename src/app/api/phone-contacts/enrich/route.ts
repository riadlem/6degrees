import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { enrichContactsFromPhoneBook } from "@/lib/phone-contact-enrich"

export async function POST(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // Sweep: clear all remote https:// photo URLs — LinkedIn CDN URLs expire and
  // show broken images; data-URIs from the phone book never expire.
  // Also clear HEIC data-URIs (unrenderable in Chrome/Firefox).
  // Both sweeps run before PhoneContact matching so the loop can then apply
  // fresh JPEG thumbnails where available.
  const [remoteCleared, heicCleared] = await Promise.all([
    prisma.contact.updateMany({
      where: { userId, photoUrl: { startsWith: "https://" } },
      data: { photoUrl: null },
    }),
    prisma.contact.updateMany({
      where: { userId, photoUrl: { startsWith: "data:image/heic" } },
      data: { photoUrl: null },
    }),
  ])

  const photosCleared = remoteCleared.count + heicCleared.count

  const count = await prisma.phoneContact.count({ where: { userId } })
  if (count === 0) return Response.json({ enriched: photosCleared, phones: 0, emails: 0, photos: 0, photosCleared })

  const result = await enrichContactsFromPhoneBook(userId)
  return Response.json({ ...result, photosCleared })
}
