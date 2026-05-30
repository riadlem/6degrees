import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"

// ── Constants ─────────────────────────────────────────────────────────────────
const FAST_LAMBDA       = Math.log(2) / 30  // 30-day half-life (recency decay)
const SLOW_LAMBDA       = Math.log(2) / 180 // 180-day half-life (drift / historical strength)
const WA_WEIGHT         = 3.0               // WhatsApp — personal, synchronous
const LI_DM_WEIGHT      = 2.0               // LinkedIn DM — professional, high intent
const EMAIL_WEIGHT      = 1.0               // Email — baseline
const OUTBOUND_MULT     = 1.2               // reaching out is a stronger signal
const INBOUND_MULT      = 1.0
const CONNECTIONS_WEIGHT = 0.5              // log2(1+n) * weight

type ChannelMsg = { sentAt: Date; isOutbound: boolean; channel: "wa" | "li" | "email" }

// ── Core formula ──────────────────────────────────────────────────────────────
// Five additive components in priority order:
//   1. Recency   — channel-weighted exponential decay (dominant)
//   2. Freq 90d  — WA+LI DM count in last 90 days, log-scaled
//   3. Vol total — all-time WA+LI DM count, log-scaled (lower weight)
//   4. Email 90d — email count in last 90 days, log-scaled (lower weight)
//   5. Contacts  — shared connections bonus, log-scaled
function computeScore(messages: ChannelMsg[], commonConnections: number | null): number {
  const now  = Date.now()
  const MS90 = 90 * 86_400_000

  let recencyScore = 0
  let waLi90       = 0
  let waLiTotal    = 0
  let email90      = 0

  for (const msg of messages) {
    const days = (now - msg.sentAt.getTime()) / 86_400_000
    const age  = now - msg.sentAt.getTime()
    const ch   = msg.channel === "wa" ? WA_WEIGHT : msg.channel === "li" ? LI_DM_WEIGHT : EMAIL_WEIGHT
    const dir  = msg.isOutbound ? OUTBOUND_MULT : INBOUND_MULT

    recencyScore += ch * dir * Math.exp(-FAST_LAMBDA * days)

    if (msg.channel !== "email") {
      waLiTotal++
      if (age <= MS90) waLi90++
    } else {
      if (age <= MS90) email90++
    }
  }

  const connectionsBonus = commonConnections
    ? Math.log2(1 + commonConnections) * CONNECTIONS_WEIGHT
    : 0

  return (
    recencyScore
    + Math.log2(1 + waLi90)    * 2    // 90d WA/LI frequency
    + Math.log2(1 + waLiTotal) * 0.5  // all-time WA/LI volume
    + Math.log2(1 + email90)   * 0.5  // 90d email activity
    + connectionsBonus
  )
}

// ── Drift score ───────────────────────────────────────────────────────────────
// High historical interaction + long silence = high drift.
// Returns 0 if last interaction was within 60 days (still active).
function computeDriftScore(messages: ChannelMsg[], lastInteractionAt: Date | null): number {
  if (!lastInteractionAt || messages.length === 0) return 0
  const daysSinceLast = (Date.now() - lastInteractionAt.getTime()) / 86_400_000
  if (daysSinceLast < 60) return 0

  const now = Date.now()
  let historicalScore = 0
  for (const msg of messages) {
    const days = (now - msg.sentAt.getTime()) / 86_400_000
    const ch   = msg.channel === "wa" ? 3.0 : msg.channel === "li" ? 2.0 : 1.0
    const dir  = msg.isOutbound ? 1.2 : 1.0
    historicalScore += ch * dir * Math.exp(-SLOW_LAMBDA * days)
  }

  const gapFactor = Math.min(daysSinceLast / 365, 3)
  return historicalScore * gapFactor
}

// ── Single-contact recompute ───────────────────────────────────────────────────
export async function recomputeScoreForContact(contactId: string): Promise<void> {
  const [emailMsgs, waMsgs, liDMMsgs, contact] = await Promise.all([
    prisma.emailMessage.findMany({ where: { contactId }, select: { sentAt: true, isOutbound: true } }),
    prisma.whatsAppMessage.findMany({ where: { contactId }, select: { sentAt: true, isOutbound: true } }),
    prisma.linkedInDMMessage.findMany({ where: { contactId }, select: { sentAt: true, isOutbound: true } }),
    prisma.contact.findUnique({ where: { id: contactId }, select: { commonConnections: true } }),
  ])

  const msgs: ChannelMsg[] = [
    ...emailMsgs.map(m => ({ ...m, channel: "email" as const })),
    ...waMsgs.map(m =>    ({ ...m, channel: "wa"    as const })),
    ...liDMMsgs.map(m =>  ({ ...m, channel: "li"    as const })),
  ]

  const score = computeScore(msgs, contact?.commonConnections ?? null)
  if (score === 0) return

  const lastInteractionAt = msgs.length
    ? msgs.reduce<Date | null>((max, m) => !max || m.sentAt > max ? m.sentAt : max, null)
    : null

  const driftScore = computeDriftScore(msgs, lastInteractionAt)

  await prisma.contact.update({ where: { id: contactId }, data: { interactionScore: score, driftScore, lastInteractionAt } })
}

// ── Batch recompute ────────────────────────────────────────────────────────────
// By default recomputes scores for every contact of the user. Pass
// `contactIds` to scope the recompute to only the contacts an import/sync just
// touched — this turns three full-table message scans + N writes into a handful
// of indexed reads + a few bulk UPDATEs. Use the unscoped form only for an
// explicit "recompute everything" (the /api/reconnect/scores endpoint).
export async function recomputeScores(
  userId: string,
  opts?: { contactIds?: string[]; onProgress?: (done: number, total: number) => void },
): Promise<void> {
  const { contactIds, onProgress } = opts ?? {}
  // When scoping to specific contacts, nothing to do for an empty set.
  if (contactIds && contactIds.length === 0) return

  const scopeMsg = contactIds
    ? { contactId: { in: contactIds } }
    : { userId, contactId: { not: null } }

  const [emailRows, waRows, liDMRows] = await Promise.all([
    prisma.emailMessage.findMany({
      where: scopeMsg,
      select: { contactId: true, sentAt: true, isOutbound: true },
    }),
    prisma.whatsAppMessage.findMany({
      where: scopeMsg,
      select: { contactId: true, sentAt: true, isOutbound: true },
    }),
    prisma.linkedInDMMessage.findMany({
      where: scopeMsg,
      select: { contactId: true, sentAt: true, isOutbound: true },
    }),
  ])

  const allRows: (ChannelMsg & { contactId: string | null })[] = [
    ...emailRows.map(m => ({ ...m, channel: "email" as const })),
    ...waRows.map(m =>    ({ ...m, channel: "wa"    as const })),
    ...liDMRows.map(m =>  ({ ...m, channel: "li"    as const })),
  ]

  // Group messages by contactId
  const byContact = new Map<string, ChannelMsg[]>()
  for (const row of allRows) {
    if (!row.contactId) continue
    const arr = byContact.get(row.contactId) ?? []
    arr.push({ sentAt: row.sentAt, isOutbound: row.isOutbound, channel: row.channel })
    byContact.set(row.contactId, arr)
  }

  // Include contacts with commonConnections but no messages yet (so the
  // shared-connections bonus alone can surface them). Scope to contactIds too.
  const contactsWithConnections = await prisma.contact.findMany({
    where: contactIds
      ? { id: { in: contactIds }, commonConnections: { gt: 0 } }
      : { userId, commonConnections: { gt: 0 } },
    select: { id: true, commonConnections: true },
  })
  const connectionsMap = new Map<string, number>()
  for (const c of contactsWithConnections) {
    connectionsMap.set(c.id, c.commonConnections ?? 0)
    if (!byContact.has(c.id)) byContact.set(c.id, [])
  }

  // Compute then flush in chunks via a single bulk UPDATE per chunk
  // (UPDATE … FROM (VALUES …)) instead of one round-trip per contact.
  const entries = Array.from(byContact.entries())
  const total = entries.length
  const CHUNK = 500
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK)
    const rows: Prisma.Sql[] = []
    for (const [contactId, msgs] of chunk) {
      const connections = connectionsMap.get(contactId) ?? null
      const score = computeScore(msgs, connections)
      if (score === 0) continue // preserve prior behaviour: never zero out a score
      const lastInteractionAt = msgs.length
        ? msgs.reduce<Date | null>((max, m) => (!max || m.sentAt > max ? m.sentAt : max), null)
        : null
      const driftScore = computeDriftScore(msgs, lastInteractionAt)
      rows.push(Prisma.sql`(${contactId}::text, ${score}::double precision, ${driftScore}::double precision, ${lastInteractionAt}::timestamp)`)
    }
    if (rows.length > 0) {
      await prisma.$executeRaw`
        UPDATE "Contact" AS c
        SET "interactionScore" = v.score,
            "driftScore"       = v.drift,
            "lastInteractionAt" = COALESCE(v.last, c."lastInteractionAt")
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, score, drift, last)
        WHERE c.id = v.id
      `
    }
    onProgress?.(Math.min(i + CHUNK, total), total)
  }
}
