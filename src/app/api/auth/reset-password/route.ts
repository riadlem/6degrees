import prisma from "@/lib/prisma"
import { hashPassword } from "@/lib/password"

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const { token, password } = body ?? {}

  if (!token || typeof token !== "string") {
    return Response.json({ error: "Invalid reset link." }, { status: 400 })
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 })
  }

  const record = await prisma.verificationToken.findUnique({ where: { token } })
  if (!record) {
    return Response.json({ error: "Invalid or already-used reset link." }, { status: 400 })
  }
  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token } })
    return Response.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email: record.identifier }, select: { id: true } })
  if (!user) {
    return Response.json({ error: "Invalid reset link." }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: hashPassword(password) } }),
    prisma.verificationToken.delete({ where: { token } }),
  ])

  return Response.json({ ok: true })
}
