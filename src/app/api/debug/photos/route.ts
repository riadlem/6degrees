import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const VALID_JPEG_B64_PREFIX = "data:image/jpeg;base64,/9j/"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // Optional ?name= param to look up a specific contact
  const { searchParams } = new URL(req.url)
  const nameQuery = searchParams.get("name")?.toLowerCase()

  if (nameQuery) {
    const matches = await prisma.contact.findMany({
      where: { userId },
      select: { firstName: true, lastName: true, photoUrl: true },
    })
    const found = matches.filter(c =>
      `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase().includes(nameQuery)
    )

    // Also check PhoneContact table
    const pcMatches = await prisma.phoneContact.findMany({
      where: { userId },
      select: { fullName: true, photoData: true },
    })
    const pcFound = pcMatches.filter(c => c.fullName.toLowerCase().includes(nameQuery))

    return Response.json({
      contacts: found.map(c => ({
        name: `${c.firstName} ${c.lastName}`.trim(),
        photoUrl: c.photoUrl === null ? null : {
          length: c.photoUrl.length,
          prefix: c.photoUrl.slice(0, 100),
          isValidJpeg: c.photoUrl.startsWith(VALID_JPEG_B64_PREFIX),
        },
      })),
      phoneContacts: pcFound.map(c => ({
        name: c.fullName,
        photoData: c.photoData === null ? null : {
          length: c.photoData.length,
          prefix: c.photoData.slice(0, 100),
          isValidJpeg: c.photoData.startsWith(VALID_JPEG_B64_PREFIX),
        },
      })),
    })
  }

  const [total, nullCount, httpsCount, httpCount, dataJpegCount, dataHeicCount, dataPngCount, dataGifCount] = await Promise.all([
    prisma.contact.count({ where: { userId } }),
    prisma.contact.count({ where: { userId, photoUrl: null } }),
    prisma.contact.count({ where: { userId, photoUrl: { startsWith: "https://" } } }),
    prisma.contact.count({ where: { userId, photoUrl: { startsWith: "http://" } } }),
    prisma.contact.count({ where: { userId, photoUrl: { startsWith: "data:image/jpeg" } } }),
    prisma.contact.count({ where: { userId, photoUrl: { startsWith: "data:image/heic" } } }),
    prisma.contact.count({ where: { userId, photoUrl: { startsWith: "data:image/png" } } }),
    prisma.contact.count({ where: { userId, photoUrl: { startsWith: "data:image/gif" } } }),
  ])

  // Valid vs invalid JPEG breakdown
  const [validJpegCount, invalidJpegCount] = await Promise.all([
    prisma.contact.count({ where: { userId, photoUrl: { startsWith: VALID_JPEG_B64_PREFIX } } }),
    prisma.contact.count({
      where: {
        userId,
        photoUrl: { startsWith: "data:image/jpeg" },
        NOT: { photoUrl: { startsWith: VALID_JPEG_B64_PREFIX } },
      },
    }),
  ])

  const unknownCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::int as count FROM "Contact"
    WHERE "userId" = ${userId}
      AND "photoUrl" IS NOT NULL
      AND "photoUrl" NOT LIKE 'https://%'
      AND "photoUrl" NOT LIKE 'http://%'
      AND "photoUrl" NOT LIKE 'data:%'
  `

  // Sample of any remaining invalid JPEGs
  const invalidSamples = await prisma.contact.findMany({
    where: {
      userId,
      photoUrl: { startsWith: "data:image/jpeg" },
      NOT: { photoUrl: { startsWith: VALID_JPEG_B64_PREFIX } },
    },
    select: { firstName: true, lastName: true, photoUrl: true },
    take: 5,
  })

  const samples = await prisma.contact.findMany({
    where: { userId, photoUrl: { not: null } },
    select: { firstName: true, lastName: true, photoUrl: true },
    take: 8,
    orderBy: { lastName: "asc" },
  })

  return Response.json({
    total,
    breakdown: {
      null: nullCount,
      "https://": httpsCount,
      "http://": httpCount,
      "data:image/jpeg (valid /9j/)": validJpegCount,
      "data:image/jpeg (invalid prefix)": invalidJpegCount,
      "data:image/heic": dataHeicCount,
      "data:image/png": dataPngCount,
      "data:image/gif": dataGifCount,
      unknown: Number(unknownCount[0]?.count ?? 0),
    },
    invalidJpegSamples: invalidSamples.map(c => ({
      name: `${c.firstName} ${c.lastName}`.trim(),
      prefix: c.photoUrl!.slice(0, 80),
      bytes: c.photoUrl!.length,
    })),
    samples: samples.map(c => ({
      name: `${c.firstName} ${c.lastName}`.trim(),
      prefix: c.photoUrl!.slice(0, 80),
      bytes: c.photoUrl!.length,
    })),
  })
}
