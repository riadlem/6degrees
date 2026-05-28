import prisma from "@/lib/prisma"
import { generateSpeakersPdf, prioOrder } from "@/lib/speakers-pdf"

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
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
  const filename  = `m2020_speakers_${share.user.name?.replace(/[^a-z0-9]/gi, "_") ?? "shared"}.pdf`

  const buffer = await generateSpeakersPdf({
    eventName,
    subtitle,
    speakers,
    ownerName: share.user.name ?? "Unknown",
  })

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
