import { randomBytes } from "crypto"
import prisma from "@/lib/prisma"
import { sendPasswordResetEmail } from "@/lib/email"

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email) return Response.json({ error: "Email is required" }, { status: 400 })

  // Always return 200 — don't reveal whether the email exists
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return Response.json({ ok: true })

  const token = randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  // Remove any stale tokens for this email then insert a fresh one
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: email } }),
    prisma.verificationToken.create({ data: { identifier: email, token, expires } }),
  ])

  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`
  await sendPasswordResetEmail(email, resetUrl)

  return Response.json({ ok: true })
}
