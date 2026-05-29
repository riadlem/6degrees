import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { randomUUID } from "crypto"

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

  let upserted = 0
  for (const conv of body.conversations as Record<string, unknown>[]) {
    const conversationId = String(conv.conversationId || "").trim()
    const chatName = String(conv.chatName || "").trim()
    if (!conversationId || !chatName) continue

    const profileUrl = typeof conv.profileUrl === "string" ? conv.profileUrl : null
    const lastInboxAt = conv.lastInboxAt
      ? new Date(conv.lastInboxAt as string)
      : new Date()
    const lastInboxOutbound =
      typeof conv.lastInboxOutbound === "boolean" ? conv.lastInboxOutbound : null

    // Auto-match contact by LinkedIn profile URL
    let contactId: string | null = null
    if (profileUrl) {
      const m = profileUrl.match(/\/in\/([^/?#]+)/)
      const linkedinKey = m ? m[1].toLowerCase() : null
      if (linkedinKey) {
        const c = await prisma.contact.findFirst({
          where: {
            userId,
            OR: [
              { linkedinKey },
              { profileUrl: { contains: `/in/${linkedinKey}`, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        })
        if (c) contactId = c.id
      }
    }

    // Fallback: match by first + last name when no profileUrl match
    if (!contactId && chatName) {
      const parts = chatName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const c = await prisma.contact.findFirst({
          where: {
            userId,
            firstName: { equals: parts[0], mode: "insensitive" },
            lastName: { equals: parts.slice(1).join(" "), mode: "insensitive" },
          },
          select: { id: true },
        })
        if (c) contactId = c.id
      }
    }

    try {
      const id = randomUUID()
      await prisma.$executeRaw`
        INSERT INTO "LinkedInDMConversation"
          ("id", "userId", "conversationId", "chatName", "profileUrl", "contactId",
           "messageCount", "importedAt", "ignored", "lastInboxAt", "lastInboxOutbound")
        VALUES
          (${id}, ${userId}, ${conversationId}, ${chatName}, ${profileUrl}, ${contactId},
           0, NOW(), false, ${lastInboxAt}, ${lastInboxOutbound})
        ON CONFLICT ("userId", "conversationId") DO UPDATE SET
          "chatName"           = EXCLUDED."chatName",
          "profileUrl"         = COALESCE(EXCLUDED."profileUrl", "LinkedInDMConversation"."profileUrl"),
          "contactId"          = COALESCE(EXCLUDED."contactId", "LinkedInDMConversation"."contactId"),
          "lastInboxAt"        = EXCLUDED."lastInboxAt",
          "lastInboxOutbound"  = EXCLUDED."lastInboxOutbound"
      `
      upserted++
    } catch (e) {
      console.error("[inbox-scan] upsert error:", e)
    }
  }

  return Response.json({ ok: true, upserted }, { headers: CORS })
}
