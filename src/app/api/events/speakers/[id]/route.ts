import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const body = await req.json().catch(() => ({}))

  const data: Record<string, unknown> = {}

  // priority: 1–4 or null to clear
  if ("priority" in body) {
    const priority =
      body.priority === null ? null
      : typeof body.priority === "number" && [1, 2, 3, 4].includes(body.priority)
      ? body.priority
      : undefined
    if (priority === undefined) {
      return Response.json({ error: "priority must be 1–4 or null" }, { status: 400 })
    }
    data.priority = priority
  }

  // company: string or null to clear
  if ("company" in body) {
    data.company = typeof body.company === "string" ? body.company.trim() || null : null
  }

  // role: string or null to clear
  if ("role" in body) {
    data.role = typeof body.role === "string" ? body.role.trim() || null : null
  }

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 })
  }

  const speaker = await prisma.eventSpeaker.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  })
  if (!speaker) return new Response("Not found", { status: 404 })

  const updated = await prisma.eventSpeaker.update({
    where: { id: params.id },
    data,
    select: { id: true, priority: true, company: true, role: true },
  })

  return Response.json({ ok: true, ...updated })
}
