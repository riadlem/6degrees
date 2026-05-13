import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { fetchAllConnections, parseLinkedInDate, connectionKey } from "@/lib/linkedin"

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "linkedin" },
  })

  if (!account?.access_token) {
    return Response.json({ error: "LinkedIn account not connected or token missing" }, { status: 400 })
  }

  const userId = session.user.id
  const accessToken = account.access_token

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(sse(data))

      try {
        send({ type: "status", message: "Connecting to LinkedIn…" })

        const connections = await fetchAllConnections(accessToken)
        const total = connections.length

        send({ type: "status", message: `Found ${total} connections`, total })

        let synced = 0
        let failed = 0

        for (const conn of connections) {
          const key = connectionKey(conn)
          try {
            await prisma.contact.upsert({
              where: { userId_linkedinKey: { userId, linkedinKey: key } },
              update: {
                position: conn["Position"] || null,
                company: conn["Company"] || null,
                profileUrl: conn["URL"] || null,
                syncedAt: new Date(),
              },
              create: {
                userId,
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

          if ((synced + failed) % 25 === 0 || synced + failed === total) {
            send({ type: "progress", synced, failed, total })
          }
        }

        await prisma.user.update({
          where: { id: userId },
          data: { lastSyncAt: new Date() },
        })

        send({ type: "done", synced, failed, total })
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : String(error) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
