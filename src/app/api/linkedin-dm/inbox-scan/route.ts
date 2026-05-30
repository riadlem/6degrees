import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { randomUUID } from "crypto"
import { batchResolveContacts, type ResolvableConversation } from "@/lib/linkedin-dm-match"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

async function ensureInboxColumns() {
  await prisma.$executeRaw`
    ALTER TABLE "LinkedInDMConversation"
    ADD COLUMN IF NOT EXISTS "lastInboxAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "lastInboxOutbound" BOOLEAN
  `.catch(() => {})
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  let userId: string

  if (token) {
    const user = await prisma.user.findUnique({ where: { extensionToken: token }, select: { id: true } })
    if (!user) return new Response("Invalid token", { status: 401, headers: CORS })
    userId = user.id
  } else {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401, headers: CORS })
    userId = session.user.id
  }

  const body = await req.json().catch(() => null)
  if (!body?.conversations || !Array.isArray(body.conversations)) {
    return Response.json({ error: "conversations array required" }, { status: 400, headers: CORS })
  }

  await ensureInboxColumns()

  // Normalise + de-duplicate the incoming conversations by conversationId.
  type Row = { conversationId: string; chatName: string; profileUrl: string | null; lastInboxAt: Date; lastInboxOutbound: boolean | null }
  const byConvId = new Map<string, Row>()
  for (const conv of body.conversations as Record<string, unknown>[]) {
    const conversationId = String(conv.conversationId || "").trim()
    const chatName = String(conv.chatName || "").trim()
    if (!conversationId || !chatName) continue
    byConvId.set(conversationId, {
      conversationId,
      chatName,
      profileUrl: typeof conv.profileUrl === "string" ? conv.profileUrl : null,
      lastInboxAt: conv.lastInboxAt ? new Date(conv.lastInboxAt as string) : new Date(),
      lastInboxOutbound: typeof conv.lastInboxOutbound === "boolean" ? conv.lastInboxOutbound : null,
    })
  }
  const rows = [...byConvId.values()]

  // Resolve ALL contacts in a handful of bulk queries instead of 2-3 per row.
  const resolvable: ResolvableConversation[] = rows.map((r) => ({
    conversationId: r.conversationId,
    chatName: r.chatName,
    profileUrl: r.profileUrl,
  }))
  const contactMap = await batchResolveContacts(userId, resolvable)

  // Bulk-upsert conversations in chunks.
  let upserted = 0
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const values = chunk.map((r) => {
      const contactId = contactMap.get(r.conversationId) ?? null
      return Prisma.sql`(${randomUUID()}, ${userId}, ${r.conversationId}, ${r.chatName}, ${r.profileUrl}, ${contactId}, 0, NOW(), false, ${r.lastInboxAt}, ${r.lastInboxOutbound})`
    })
    try {
      await prisma.$executeRaw`
        INSERT INTO "LinkedInDMConversation"
          ("id", "userId", "conversationId", "chatName", "profileUrl", "contactId",
           "messageCount", "importedAt", "ignored", "lastInboxAt", "lastInboxOutbound")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("userId", "conversationId") DO UPDATE SET
          "chatName"           = EXCLUDED."chatName",
          "profileUrl"         = COALESCE(EXCLUDED."profileUrl", "LinkedInDMConversation"."profileUrl"),
          "contactId"          = COALESCE(EXCLUDED."contactId", "LinkedInDMConversation"."contactId"),
          "lastInboxAt"        = EXCLUDED."lastInboxAt",
          "lastInboxOutbound"  = EXCLUDED."lastInboxOutbound"
      `
      upserted += chunk.length
    } catch (e) {
      console.error("[inbox-scan] bulk upsert error:", e)
    }
  }

  return Response.json({ ok: true, upserted }, { headers: CORS })
}
