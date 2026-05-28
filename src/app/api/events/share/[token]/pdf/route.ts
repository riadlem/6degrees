import prisma from "@/lib/prisma"
import { generateSpeakersPdf, prioOrder, type PdfLayout } from "@/lib/speakers-pdf"

export async function GET(
  req: Request,
  { params }: { params: { token: string } }
) {
  const { searchParams } = new URL(req.url)
  const layout: PdfLayout = (["cards", "list", "grid"].includes(searchParams.get("layout") ?? ""))
    ? searchParams.get("layout") as PdfLayout
    : "cards"

  const share = await prisma.eventShare.findFirst({
    where: { shareToken: params.token, shareEnabled: true },
    include: { user: { select: { name: true } } },
  })
  if (!share) return new Response("Not found", { status: 404 })

  const raw = await prisma.eventSpeaker.findMany({
    where: { userId: share.userId, eventSlug: share.eventSlug },
    select: {
      firstName: true, lastName: true,
      role: true, company: true,
      photoUrl: true, priority: true, sessionTopic: true,
    },
  })

  const speakers = [...raw].sort((a, b) => prioOrder(a.priority) - prioOrder(b.priority))
  const eventName = "Money 20/20 Europe 2026"
  const subtitle  = `Shared by ${share.user.name ?? "Unknown"} · ${speakers.length} speakers`
  const filename  = `m2020_speakers_${share.user.name?.replace(/[^a-z0-9]/gi, "_") ?? "shared"}_${layout}.pdf`

  let buffer: Buffer
  try {
    buffer = await generateSpeakersPdf({
      eventName,
      subtitle,
      speakers,
      ownerName: share.user.name ?? "Unknown",
      layout,
    })
  } catch (err) {
    console.error("[PDF share] generateSpeakersPdf threw:", err)
    return new Response(`PDF generation failed: ${String(err)}`, { status: 500 })
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
