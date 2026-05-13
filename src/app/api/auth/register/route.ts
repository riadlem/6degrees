import prisma from "@/lib/prisma"
import { hashPassword } from "@/lib/password"

export async function POST(req: Request) {
  const { name, email, password } = await req.json()
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
    return Response.json({ error: "Name, email and password (min 8 chars) are required" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return Response.json({ error: "An account with this email already exists" }, { status: 409 })
  }

  await (prisma.user as any).create({
    data: { name: name.trim(), email: email.trim().toLowerCase(), password: hashPassword(password) },
  })

  return Response.json({ ok: true })
}
