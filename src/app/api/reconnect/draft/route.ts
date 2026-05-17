import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are helping a professional write a warm, personalized reconnection email to someone they have worked with or know. Write in first person. Be genuine and natural — not salesy or overly enthusiastic. Keep it under 150 words. Return only the email body, no subject line, no greeting prefix.`

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { contactId, tone = "warm", intent = "catch_up", userNote = "" } = body as {
    contactId?: string
    tone?: string
    intent?: string
    userNote?: string
  }

  if (!contactId) return Response.json({ error: "contactId required" }, { status: 400 })

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId: session.user.id },
    select: {
      firstName: true,
      lastName: true,
      position: true,
      company: true,
      headline: true,
      lastInteractionAt: true,
    },
  })
  if (!contact) return new Response("Not found", { status: 404 })

  const recentSubjects = await prisma.emailMessage.findMany({
    where: { contactId, userId: session.user.id },
    select: { subject: true, sentAt: true },
    orderBy: { sentAt: "desc" },
    take: 5,
  })

  const intentLabels: Record<string, string> = {
    catch_up: "catch up and reconnect",
    coffee_chat: "suggest a coffee chat or quick call",
    collaboration: "explore a potential collaboration",
    referral: "ask for or offer an introduction",
  }

  const lastContact = contact.lastInteractionAt
    ? `Last email contact: ${contact.lastInteractionAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
    : "No recent email history"

  const subjectContext =
    recentSubjects.length > 0
      ? `Recent email threads: ${recentSubjects.map((s) => `"${s.subject ?? "(no subject)"}"`).join(", ")}`
      : ""

  const userPrompt = `Write a ${tone} reconnection email from ${session.user?.name ?? "me"} to ${contact.firstName} ${contact.lastName}${contact.position ? `, ${contact.position}` : ""}${contact.company ? ` at ${contact.company}` : ""}.

Intent: ${intentLabels[intent] ?? intent}
${lastContact}
${subjectContext}
${userNote ? `Additional context: ${userNote}` : ""}

Write only the email body.`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messageStream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: userPrompt }],
        })

        for await (const chunk of messageStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`))
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err instanceof Error ? err.message : "Draft generation failed" })}\n\n`,
          ),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
