import prisma from "@/lib/prisma"

const LAMBDA = 0.02 // decay constant — half-life ≈ 35 days
const OUTBOUND_WEIGHT = 1.2
const INBOUND_WEIGHT = 1.0

function computeScore(messages: { sentAt: Date; isOutbound: boolean }[]): number {
  const now = Date.now()
  return messages.reduce((sum, msg) => {
    const daysSince = (now - msg.sentAt.getTime()) / 86_400_000
    const weight = msg.isOutbound ? OUTBOUND_WEIGHT : INBOUND_WEIGHT
    return sum + weight * Math.exp(-LAMBDA * daysSince)
  }, 0)
}

export async function recomputeScoreForContact(contactId: string): Promise<void> {
  const [emailMsgs, waMsgs] = await Promise.all([
    prisma.emailMessage.findMany({ where: { contactId }, select: { sentAt: true, isOutbound: true } }),
    prisma.whatsAppMessage.findMany({ where: { contactId }, select: { sentAt: true, isOutbound: true } }),
  ])
  const msgs = [...emailMsgs, ...waMsgs]
  if (msgs.length === 0) return
  const score = computeScore(msgs)
  const lastInteractionAt = msgs.reduce<Date | null>((max, m) => !max || m.sentAt > max ? m.sentAt : max, null)
  await prisma.contact.update({ where: { id: contactId }, data: { interactionScore: score, lastInteractionAt } })
}

export async function recomputeScores(userId: string): Promise<void> {
  // Load all matched messages for this user grouped by contact (email + WhatsApp)
  const [emailRows, waRows] = await Promise.all([
    prisma.emailMessage.findMany({
      where: { userId, contactId: { not: null } },
      select: { contactId: true, sentAt: true, isOutbound: true },
    }),
    prisma.whatsAppMessage.findMany({
      where: { userId, contactId: { not: null } },
      select: { contactId: true, sentAt: true, isOutbound: true },
    }),
  ])

  const allRows = [...emailRows, ...waRows]

  // Group by contactId
  const byContact = new Map<string, { sentAt: Date; isOutbound: boolean }[]>()
  for (const row of allRows) {
    if (!row.contactId) continue
    const arr = byContact.get(row.contactId) ?? []
    arr.push({ sentAt: row.sentAt, isOutbound: row.isOutbound })
    byContact.set(row.contactId, arr)
  }

  // Batch update in chunks of 100
  const entries = Array.from(byContact.entries())
  const CHUNK = 100
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK)
    await Promise.all(
      chunk.map(([contactId, msgs]) => {
        const score = computeScore(msgs)
        const lastInteractionAt = msgs.reduce<Date | null>(
          (max, m) => (!max || m.sentAt > max ? m.sentAt : max),
          null,
        )
        return prisma.contact.update({
          where: { id: contactId },
          data: { interactionScore: score, lastInteractionAt },
        })
      }),
    )
  }
}
