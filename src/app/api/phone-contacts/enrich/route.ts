import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { enrichContactsFromPhoneBook } from "@/lib/phone-contact-enrich"

// Valid JPEG base64 always starts with /9j/ (0xFF 0xD8 0xFF).
// Apple's ZTHUMBNAILIMAGEDATA prepends a 0x01 type byte, making base64
// start with Af/Y or other non-/9j/ prefixes — browsers reject these.
const VALID_JPEG_B64_PREFIX = "data:image/jpeg;base64,/9j/"

// Try to repair a JPEG data-URI by stripping a leading garbage byte.
// Returns the fixed data-URI if bytes[1..3] = FF D8 FF, otherwise null.
function tryRepairJpeg(dataUri: string): string | null {
  const b64 = dataUri.slice("data:image/jpeg;base64,".length)
  const bytes = Buffer.from(b64, "base64")
  if (bytes.length > 3 && bytes[1] === 0xff && bytes[2] === 0xd8 && bytes[3] === 0xff) {
    return `data:image/jpeg;base64,${bytes.subarray(1).toString("base64")}`
  }
  return null
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

  // ── Step 2: fix invalid JPEGs in Contact table ─────────────────────────────
  // Any data:image/jpeg that doesn't start with the valid /9j/ prefix is corrupt.
  const badJpegContacts = await prisma.contact.findMany({
    where: {
      userId,
      photoUrl: { startsWith: "data:image/jpeg" },
      NOT: { photoUrl: { startsWith: VALID_JPEG_B64_PREFIX } },
    },
    select: { id: true, photoUrl: true },
  })
  let photosFixed = 0
  if (badJpegContacts.length > 0) {
    await Promise.all(
      badJpegContacts.map((c) => {
        const fixed = tryRepairJpeg(c.photoUrl!)
        photosFixed++
        return prisma.contact.update({
          where: { id: c.id },
          data: { photoUrl: fixed }, // null clears unrecoverable photos
        })
      })
    )
  }

  // ── Step 3: fix invalid JPEGs in PhoneContact table ───────────────────────
  const badJpegPhoneContacts = await prisma.phoneContact.findMany({
    where: {
      userId,
      photoData: { startsWith: "data:image/jpeg" },
      NOT: { photoData: { startsWith: VALID_JPEG_B64_PREFIX } },
    },
    select: { id: true, photoData: true },
  })
  if (badJpegPhoneContacts.length > 0) {
    await Promise.all(
      badJpegPhoneContacts.map((c) => {
        const fixed = tryRepairJpeg(c.photoData!)
        return prisma.phoneContact.update({
          where: { id: c.id },
          data: { photoData: fixed },
        })
      })
    )
  }

  const photosCleared = remoteCleared.count + heicCleared.count

  const count = await prisma.phoneContact.count({ where: { userId } })
  if (count === 0) return Response.json({ enriched: photosFixed + photosCleared, phones: 0, emails: 0, photos: 0, photosCleared, photosFixed })

  const result = await enrichContactsFromPhoneBook(userId)
  return Response.json({ ...result, photosCleared, photosFixed })
}
