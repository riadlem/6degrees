import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const ALLOWED_FIELDS = ["country", "industry", "note"] as const
type AllowedField = (typeof ALLOWED_FIELDS)[number]

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
      { error: "field must be one of: country, industry, note" },
      { status: 400 }
    )
  }

  // Validate value
  if (typeof value !== "string") {
    return Response.json({ error: "value must be a string" }, { status: 400 })
  }

  const userId = session.user.id
  const typedField = field as AllowedField

  if (typedField === "note") {
    if (value === "") {
      return Response.json({ updated: 0 })
    }
    const result = await prisma.contactNote.createMany({
      data: (ids as string[]).map((contactId) => ({
        contactId,
        content: value,
      })),
      skipDuplicates: false,
    })
    return Response.json({ updated: result.count })
  }

  // country or industry
  const result = await prisma.contact.updateMany({
    where: {
      id: { in: ids as string[] },
      userId,
    },
    data: { [typedField]: value || null },
  })

  return Response.json({ updated: result.count })
}
