import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

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

  // Anything non-null that doesn't match the known prefixes
  const unknownCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::int as count FROM "Contact"
    WHERE "userId" = ${userId}
      AND "photoUrl" IS NOT NULL
      AND "photoUrl" NOT LIKE 'https://%'
      AND "photoUrl" NOT LIKE 'http://%'
      AND "photoUrl" NOT LIKE 'data:%'
  `

  // Sample 8 non-null photoUrls (first 80 chars) to see actual values
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
      "data:image/jpeg": dataJpegCount,
      "data:image/heic": dataHeicCount,
      "data:image/png": dataPngCount,
      "data:image/gif": dataGifCount,
      unknown: Number(unknownCount[0]?.count ?? 0),
    },
    samples: samples.map(c => ({
      name: `${c.firstName} ${c.lastName}`.trim(),
      prefix: c.photoUrl!.slice(0, 80),
      bytes: c.photoUrl!.length,
    })),
  })
}
