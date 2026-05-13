import prisma from "@/lib/prisma"
import { scryptSync, randomBytes, timingSafeEqual } from "crypto"

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const hashBuffer = Buffer.from(hash, "hex")
  const derivedHash = scryptSync(password, salt, 64)
  return timingSafeEqual(hashBuffer, derivedHash)
}

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
