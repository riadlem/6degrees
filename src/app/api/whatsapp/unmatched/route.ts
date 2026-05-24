import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const PAGE_SIZE = 20

async function getSuggestions(userId: string, chatName: string) {
  const recs: { contactId: string; name: string; company: string | null }[] = []

  const parts = chatName.trim().split(/\s+/)
  if (parts.length >= 2) {
    const first = parts[0]
    const last = parts[parts.length - 1]
    const matches = await prisma.contact.findMany({
      where: {
        userId,
        OR: [
          { firstName: { contains: first, mode: "insensitive" }, lastName: { contains: last, mode: "insensitive" } },
          { firstName: { contains: last, mode: "insensitive" }, lastName: { contains: first, mode: "insensitive" } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, company: true },
      take: 3,
    })
    for (const c of matches) {
      recs.push({ contactId: c.id, name: `${c.firstName} ${c.lastName}`, company: c.company ?? null })
    }
  }

  // If no name-split match, try single token prefix search
  if (recs.length === 0 && parts.length === 1) {
    const token = parts[0]
    const matches = await prisma.contact.findMany({
      where: {
        userId,
        OR: [
          { firstName: { startsWith: token, mode: "insensitive" } },
          { lastName: { startsWith: token, mode: "insensitive" } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, company: true },
      take: 3,
    })
    for (const c of matches) {
      recs.push({ contactId: c.id, name: `${c.firstName} ${c.lastName}`, company: c.company ?? null })
    }
  }

  return recs.slice(0, 3)
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0"))
  const q = searchParams.get("q")?.toLowerCase().trim() ?? ""

  // Group unmatched WhatsApp messages by chatName
  const grouped = await prisma.whatsAppMessage.groupBy({
    by: ["chatName"],
    where: { userId, contactId: null },
    _count: { _all: true },
    _min: { sentAt: true },
    _max: { sentAt: true },
    orderBy: [{ _count: { chatName: "desc" } }],
  })

  const filtered = q
    ? grouped.filter((g) => g.chatName.toLowerCase().includes(q))
    : grouped

  const total = filtered.length
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const chats = await Promise.all(
    paginated.map(async (g) => {
      const suggestions = await getSuggestions(userId, g.chatName)
      return {
        chatName: g.chatName,
        messageCount: g._count._all,
        firstAt: g._min.sentAt?.toISOString() ?? null,
        lastAt: g._max.sentAt?.toISOString() ?? null,
        suggestions,
      }
    }),
  )

  return Response.json({ chats, total, page, pageSize: PAGE_SIZE })
}
