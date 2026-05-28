import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const DEFAULT_SLUG = "money2020-europe-2026"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const { searchParams } = new URL(req.url)
  const eventSlug = searchParams.get("eventSlug") ?? DEFAULT_SLUG

  const share = await prisma.eventShare.findUnique({
    where: { userId_eventSlug: { userId: session.user.id, eventSlug } },
    select: { shareEnabled: true, shareToken: true },
  })

  return Response.json({
    shareEnabled: share?.shareEnabled ?? false,
    shareToken: share?.shareToken ?? null,
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json().catch(() => ({}))
  const eventSlug: string = body.eventSlug ?? DEFAULT_SLUG

  const share = await prisma.eventShare.upsert({
    where: { userId_eventSlug: { userId: session.user.id, eventSlug } },
    update: { shareEnabled: true },
    create: { userId: session.user.id, eventSlug, shareEnabled: true },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  return Response.json({
    shareToken: share.shareToken,
    shareUrl: `${baseUrl}/events/share/${share.shareToken}`,
  })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json().catch(() => ({}))
  const eventSlug: string = body.eventSlug ?? DEFAULT_SLUG

  await prisma.eventShare.updateMany({
    where: { userId: session.user.id, eventSlug },
    data: { shareEnabled: false },
  })

  return Response.json({ ok: true })
}
