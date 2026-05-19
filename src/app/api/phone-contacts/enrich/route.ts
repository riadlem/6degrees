import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { enrichContactsFromPhoneBook } from "@/lib/phone-contact-enrich"

// The Apple ZTHUMBNAILIMAGEDATA field prepends a 0x01 byte before the JPEG SOI
// marker (FF D8 FF). The base64 of such data starts with "Af/Y" (/9j/ is valid JPEG).
// Browsers reject images that don't start exactly at FF D8, so we strip the prefix.
const CORRUPT_PREFIX = "data:image/jpeg;base64,Af/Y"

function fixAppleJpeg(dataUri: string): string {
  const b64 = dataUri.slice("data:image/jpeg;base64,".length)
  const bytes = Buffer.from(b64, "base64")
  // Strip the leading 0x01 byte — JPEG must start at FF D8
  return `data:image/jpeg;base64,${bytes.subarray(1).toString("base64")}`
}

export async function POST(_req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // ── Step 1: sweep remote URLs and HEIC (unrenderable) ─────────────────────
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

  // ── Step 2: fix Apple's 0x01-prefixed JPEGs in Contact table ──────────────
  const corruptContacts = await prisma.contact.findMany({
    where: { userId, photoUrl: { startsWith: CORRUPT_PREFIX } },
    select: { id: true, photoUrl: true },
  })
  if (corruptContacts.length > 0) {
    await Promise.all(
      corruptContacts.map((c) =>
        prisma.contact.update({
          where: { id: c.id },
          data: { photoUrl: fixAppleJpeg(c.photoUrl!) },
        })
      )
    )
  }

  // ── Step 3: fix Apple's 0x01-prefixed JPEGs in PhoneContact table ─────────
  const corruptPhoneContacts = await prisma.phoneContact.findMany({
    where: { userId, photoData: { startsWith: CORRUPT_PREFIX } },
    select: { id: true, photoData: true },
  })
  if (corruptPhoneContacts.length > 0) {
    await Promise.all(
      corruptPhoneContacts.map((c) =>
        prisma.phoneContact.update({
          where: { id: c.id },
          data: { photoData: fixAppleJpeg(c.photoData!) },
        })
      )
    )
  }

  const photosFixed = corruptContacts.length
  const photosCleared = remoteCleared.count + heicCleared.count

  const count = await prisma.phoneContact.count({ where: { userId } })
  if (count === 0) return Response.json({ enriched: photosFixed + photosCleared, phones: 0, emails: 0, photos: 0, photosCleared, photosFixed })

  const result = await enrichContactsFromPhoneBook(userId)
  return Response.json({ ...result, photosCleared, photosFixed })
}
