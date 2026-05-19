import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { enrichContactsFromPhoneBook } from "@/lib/phone-contact-enrich"

// Valid JPEG base64 always starts with /9j/ (0xFF 0xD8 0xFF).
// Apple's ZTHUMBNAILIMAGEDATA prepends a 0x01 type byte, shifting the
// base64 prefix to Af/Y. Fix by stripping byte 0 with a single SQL UPDATE.
const VALID_JPEG_B64_PREFIX = "data:image/jpeg;base64,/9j/"

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
  // Single SQL UPDATE — avoids N round trips that caused the previous
  // Promise.all approach to time out for large contact lists.
  // Postgres: decode base64 → strip byte 0 (the Apple 0x01 prefix) →
  // re-encode to base64 → prepend the data-URI header.
  // translate() removes the newlines that Postgres encode() inserts.
  const photosFixed = await prisma.$executeRaw`
    UPDATE "Contact"
    SET "photoUrl" =
      'data:image/jpeg;base64,' ||
      translate(
        encode(
          substring(decode(substring("photoUrl" FROM 24), 'base64') FROM 2),
          'base64'
        ),
        E'\n', ''
      )
    WHERE "userId" = ${userId}
      AND "photoUrl" LIKE 'data:image/jpeg%'
      AND "photoUrl" NOT LIKE ${VALID_JPEG_B64_PREFIX + "%"}
  `

  // ── Step 3: fix invalid JPEGs in PhoneContact table ───────────────────────
  await prisma.$executeRaw`
    UPDATE "PhoneContact"
    SET "photoData" =
      'data:image/jpeg;base64,' ||
      translate(
        encode(
          substring(decode(substring("photoData" FROM 24), 'base64') FROM 2),
          'base64'
        ),
        E'\n', ''
      )
    WHERE "userId" = ${userId}
      AND "photoData" LIKE 'data:image/jpeg%'
      AND "photoData" NOT LIKE ${VALID_JPEG_B64_PREFIX + "%"}
  `

  const photosCleared = remoteCleared.count + heicCleared.count

  const count = await prisma.phoneContact.count({ where: { userId } })
  if (count === 0) return Response.json({ enriched: photosFixed + photosCleared, phones: 0, emails: 0, photos: 0, photosCleared, photosFixed })

  const result = await enrichContactsFromPhoneBook(userId)
  return Response.json({ ...result, photosCleared, photosFixed })
}
