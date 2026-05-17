import prisma from "@/lib/prisma"

export async function matchChatNameToContact(
  userId: string,
  chatName: string,
): Promise<string | null> {
  const parts = chatName.trim().split(/\s+/)
  if (parts.length < 2) return null

  const firstName = parts[0]
  const lastName = parts[parts.length - 1]

  const matches = await prisma.contact.findMany({
    where: {
      userId,
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
    },
    select: { id: true },
    take: 3,
  })

  // Only accept unambiguous single match
  if (matches.length === 1) return matches[0].id
  return null
}
