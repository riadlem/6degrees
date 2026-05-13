import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
  fetchAllConnections,
  parseLinkedInDate,
  connectionKey,
} from "@/lib/linkedin"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 })
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "linkedin" },
  })

  if (!account?.access_token) {
    return Response.json(
      { error: "LinkedIn account not connected or token missing" },
      { status: 400 }
    )
  }

  try {
    const connections = await fetchAllConnections(account.access_token)

    let synced = 0
    let failed = 0

    for (const conn of connections) {
      const key = connectionKey(conn)
      try {
        await prisma.contact.upsert({
          where: {
            userId_linkedinKey: {
              userId: session.user.id,
              linkedinKey: key,
            },
          },
          update: {
            position: conn["Position"] || null,
            company: conn["Company"] || null,
            profileUrl: conn["URL"] || null,
            syncedAt: new Date(),
          },
          create: {
            userId: session.user.id,
            linkedinKey: key,
            firstName: conn["First Name"],
            lastName: conn["Last Name"],
            position: conn["Position"] || null,
            company: conn["Company"] || null,
            connectedOn: parseLinkedInDate(conn["Connected On"]),
            profileUrl: conn["URL"] || null,
          },
        })
        synced++
      } catch {
        failed++
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastSyncAt: new Date() },
    })

    return Response.json({ synced, failed, total: connections.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
