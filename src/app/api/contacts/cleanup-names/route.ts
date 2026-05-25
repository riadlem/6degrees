/**
 * POST /api/contacts/cleanup-names
 * One-shot migration: strip leading/trailing emoji from all contact first/last names.
 */
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { stripEdgeEmoji } from "@/lib/utils"

export const maxDuration = 60

export async function POST(req: Request) {
  void req
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const contacts = await prisma.contact.findMany({
    where: { userId },
    select: { id: true, firstName: true, lastName: true },
  })

  let updated = 0
  const updates: Promise<unknown>[] = []

  for (const c of contacts) {
    const newFirst = stripEdgeEmoji(c.firstName)
    const newLast  = stripEdgeEmoji(c.lastName)
    if (newFirst !== c.firstName || newLast !== c.lastName) {
      updates.push(
        prisma.contact.update({
          where: { id: c.id },
          data: { firstName: newFirst, lastName: newLast },
        })
      )
      updated++
    }
  }

  await Promise.all(updates)
  return Response.json({ ok: true, checked: contacts.length, updated })
}
