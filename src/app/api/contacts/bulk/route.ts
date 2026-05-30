import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const ALLOWED_FIELDS = ["company", "position", "city", "country", "industry", "outreachStatus", "note"] as const
type AllowedField = (typeof ALLOWED_FIELDS)[number]

// Fields that map directly to Contact columns (null-able string columns)
const CONTACT_COLUMN_FIELDS: AllowedField[] = ["company", "position", "city", "country", "industry", "outreachStatus"]

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { ids, field, value } = body as Record<string, unknown>

  // Validate ids
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 500 ||
    !ids.every((id) => typeof id === "string")
  ) {
    return Response.json(
      { error: "ids must be a non-empty string array with at most 500 items" },
      { status: 400 }
    )
  }

  // Validate field
  if (!ALLOWED_FIELDS.includes(field as AllowedField)) {
    return Response.json(
      { error: `field must be one of: ${ALLOWED_FIELDS.join(", ")}` },
      { status: 400 }
    )
  }

  // Validate value
  if (typeof value !== "string") {
    return Response.json({ error: "value must be a string" }, { status: 400 })
  }

  const userId = session.user.id
  const typedField = field as AllowedField

  // Handle note separately — creates a ContactNote row for each contact
  if (typedField === "note") {
    if (value === "") {
      return Response.json({ updated: 0 })
    }
    // Only create notes on contacts that belong to this user (the column-update
    // path is userId-scoped via updateMany; this path must scope explicitly to
    // avoid writing notes onto another user's contacts).
    const owned = await prisma.contact.findMany({
      where: { id: { in: ids as string[] }, userId },
      select: { id: true },
    })
    if (owned.length === 0) return Response.json({ updated: 0 })
    const result = await prisma.contactNote.createMany({
      data: owned.map(({ id }) => ({
        contactId: id,
        content: value,
      })),
      skipDuplicates: false,
    })
    return Response.json({ updated: result.count })
  }

  // All other fields update the Contact row directly.
  // Empty string means "clear the field" → store null.
  if (CONTACT_COLUMN_FIELDS.includes(typedField)) {
    const result = await prisma.contact.updateMany({
      where: {
        id: { in: ids as string[] },
        userId,
      },
      data: { [typedField]: value || null },
    })
    return Response.json({ updated: result.count })
  }

  return Response.json({ error: "Unhandled field" }, { status: 400 })
}
