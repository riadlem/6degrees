import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * GET /api/contacts/index
 *
 * Returns ALL user contacts in minimal form (no pagination).
 * Used to power the client-side offline autocomplete search.
 * Cached in IndexedDB for 7 days via the "contacts-index" React Query key.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json([], { status: 401 })
  }

  const contacts = await prisma.contact.findMany({
    where: { userId: session.user.id },
    select: {
      id:        true,
      firstName: true,
      lastName:  true,
      company:   true,
      position:  true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  return Response.json(contacts)
}
