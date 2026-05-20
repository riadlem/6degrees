import prisma from "@/lib/prisma"

const LAMBDA = 0.02            // decay constant — half-life ≈ 35 days
const OUTBOUND_WEIGHT = 1.2
const INBOUND_WEIGHT = 1.0
const CONNECTIONS_WEIGHT = 0.4 // log2(1+n) * weight: 7 connections ≈ +1.2, 63 ≈ +2.4

function computeScore(
  messages: { sentAt: Date; isOutbound: boolean }[],
  commonConnections: number | null,
): number {
  const now = Date.now()
  const interactionScore = messages.reduce((sum, msg) => {
    const daysSince = (now - msg.sentAt.getTime()) / 86_400_000
    const weight = msg.isOutbound ? OUTBOUND_WEIGHT : INBOUND_WEIGHT
    return sum + weight * Math.exp(-LAMBDA * daysSince)
  }, 0)
  const connectionsBonus = commonConnections
    ? Math.log2(1 + commonConnections) * CONNECTIONS_WEIGHT
    : 0
  return interactionScore + connectionsBonus
}

export async function recomputeScoreForContact(contactId: string): Promise<void> {
  const [emailMsgs, waMsgs, contact] = await Promise.all([
    prisma.emailMessage.findMany({ where: { contactId }, select: { sentAt: true, isOutbound: true } }),
    prisma.whatsAppMessage.findMany({ where: { contactId }, select: { sentAt: true, isOutbound: true } }),
    prisma.contact.findUnique({ where: { id: contactId }, select: { commonConnections: true } }),
  ])
  const msgs = [...emailMsgs, ...waMsgs]
  const score = computeScore(msgs, contact?.commonConnections ?? null)
  if (score === 0) return
  const lastInteractionAt = msgs.length
    ? msgs.reduce<Date | null>((max, m) => !max || m.sentAt > max ? m.sentAt : max, null)
    : null
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

  // Group messages by contactId
  const byContact = new Map<string, { sentAt: Date; isOutbound: boolean }[]>()
  for (const row of allRows) {
    if (!row.contactId) continue
    const arr = byContact.get(row.contactId) ?? []
    arr.push({ sentAt: row.sentAt, isOutbound: row.isOutbound })
    byContact.set(row.contactId, arr)
  }

  // Also include contacts that have commonConnections but no messages yet
  const contactsWithConnections = await prisma.contact.findMany({
    where: { userId, commonConnections: { gt: 0 } },
    select: { id: true, commonConnections: true },
  })
  const connectionsMap = new Map<string, number>()
  for (const c of contactsWithConnections) {
    connectionsMap.set(c.id, c.commonConnections ?? 0)
    if (!byContact.has(c.id)) byContact.set(c.id, [])
  }

  // Batch update in chunks of 100
  const entries = Array.from(byContact.entries())
  const CHUNK = 100
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK)
    await Promise.all(
      chunk.map(([contactId, msgs]) => {
        const connections = connectionsMap.get(contactId) ?? null
        const score = computeScore(msgs, connections)
        if (score === 0) return Promise.resolve()
        const lastInteractionAt = msgs.length
          ? msgs.reduce<Date | null>((max, m) => (!max || m.sentAt > max ? m.sentAt : max), null)
          : null
        return prisma.contact.update({
          where: { id: contactId },
          data: { interactionScore: score, ...(lastInteractionAt ? { lastInteractionAt } : {}) },
        })
      }),
    )
  }
}
