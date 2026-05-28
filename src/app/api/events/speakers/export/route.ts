import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { generateSpeakersPdf, prioOrder, type PdfLayout } from "@/lib/speakers-pdf"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const eventSlug: string  = body.eventSlug ?? "money2020-europe-2026"
  const eventName: string  = body.eventName ?? "Money 20/20 Europe 2026"
  const subtitle:  string  = body.subtitle  ?? "All speakers"
  const layout:    PdfLayout = ["cards", "list", "grid"].includes(body.layout) ? body.layout : "cards"
  const ids: string[] | undefined = Array.isArray(body.speakerIds) && body.speakerIds.length > 0
    ? body.speakerIds
    : undefined

  const raw = await prisma.eventSpeaker.findMany({
    where: { userId, eventSlug, ...(ids ? { id: { in: ids } } : {}) },
    select: {
      firstName: true, lastName: true,
      role: true, company: true,
      photoUrl: true, priority: true, sessionTopic: true,
    },
  })

  const speakers = [...raw].sort((a, b) => prioOrder(a.priority) - prioOrder(b.priority))
  const filename = `${eventName.replace(/[^a-z0-9]/gi, "_")}_speakers_${layout}.pdf`

  let buffer: Buffer
  try {
    console.log(`[PDF export] layout=${layout} speakers=${speakers.length}`)
    buffer = await generateSpeakersPdf({ eventName, subtitle, speakers, ownerName: session.user.name ?? "Unknown", layout })
    console.log(`[PDF export] OK bytes=${buffer.length}`)
  } catch (err) {
    console.error("[PDF export] generateSpeakersPdf threw:", err)
    return new Response(`PDF generation failed: ${String(err)}`, { status: 500 })
  }

  if (!buffer.length) {
    console.error("[PDF export] empty buffer")
    return new Response("PDF generation produced empty output", { status: 500 })
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
