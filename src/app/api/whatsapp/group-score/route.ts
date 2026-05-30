import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { recomputeScoreForContact } from "@/lib/reconnect-score"

// PATCH { chatName, include: boolean }
// include=false → set contactId=null for all group messages (removes from score)
// include=true  → re-match senderName phones to contacts (restores score contribution)

async function matchPhoneToContact(userId: string, phone: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 7) return null
  const suffix = digits.slice(-9)
  const candidates = await prisma.$queryRaw<{ id: string; phoneNumber: string | null }[]>`
    SELECT id, "phoneNumber" FROM "Contact"
    WHERE "userId" = ${userId}
      AND "phoneNumber" IS NOT NULL
      AND "phoneNumber" != ''
      AND replace(replace(replace("phoneNumber", ' ', ''), '-', ''), '.', '') LIKE ${"%" + suffix}
  `
  for (const c of candidates) {
    if (c.phoneNumber) {
      const cDigits = c.phoneNumber.replace(/\D/g, "")
      if (cDigits.endsWith(suffix)) return c.id
    }
  }
  return null
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  let body: { chatName: string; include: boolean }
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  const { chatName, include } = body
  if (!chatName) return new Response("chatName required", { status: 400 })

  if (!include) {
    // Collect affected contactIds before clearing
    const affected = await prisma.whatsAppMessage.findMany({
      where: { userId, chatName, isGroup: true, contactId: { not: null } },
      select: { contactId: true },
      distinct: ["contactId"],
    })
    const affectedIds = affected.map((m) => m.contactId as string)

    // Clear contactId for all messages in this group
    await prisma.$executeRaw`
      UPDATE "WhatsAppMessage"
      SET "contactId" = NULL
      WHERE "userId" = ${userId}
        AND "chatName" = ${chatName}
        AND "isGroup" = TRUE
    `

    // Recalculate scores for previously linked contacts
    if (affectedIds.length > 0) {
      await Promise.all(affectedIds.map((id) => recomputeScoreForContact(id).catch(() => {})))
    }

    return Response.json({ ok: true, action: "excluded", affectedContacts: affectedIds.length })
  } else {
    // Re-match sender phones to contacts
    const senderRows = await prisma.whatsAppMessage.findMany({
      where: { userId, chatName, isGroup: true, isOutbound: false, senderName: { not: null } },
      select: { senderName: true },
      distinct: ["senderName"],
    })

    const uniquePhones = senderRows
      .map((r) => r.senderName!)
      .filter((s) => /^\+?\d{7,15}$/.test(s.replace(/\D/g, "")))

    const phoneToContact = new Map<string, string | null>()
    for (const phone of uniquePhones) {
      phoneToContact.set(phone, await matchPhoneToContact(userId, phone))
    }

    // Update contactId per senderName
    const newContactIds = new Set<string>()
    for (const [phone, contactId] of phoneToContact.entries()) {
      if (!contactId) continue
      newContactIds.add(contactId)
      await prisma.$executeRaw`
        UPDATE "WhatsAppMessage"
        SET "contactId" = ${contactId}
        WHERE "userId" = ${userId}
          AND "chatName" = ${chatName}
          AND "isGroup" = TRUE
          AND "isOutbound" = FALSE
          AND "senderName" = ${phone}
      `
    }

    if (newContactIds.size > 0) {
      await Promise.all([...newContactIds].map((id) => recomputeScoreForContact(id).catch(() => {})))
    }

    return Response.json({ ok: true, action: "included", matchedContacts: newContactIds.size })
  }
}
