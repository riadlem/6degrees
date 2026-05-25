import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { randomBytes } from "crypto"

// Ensure the extensionToken column exists (idempotent, runs once per cold-start)
let _colEnsured = false
async function ensureCol() {
  if (_colEnsured) return
  _colEnsured = true
  await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "extensionToken" TEXT UNIQUE`.catch(() => {})
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  await ensureCol()

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { extensionToken: true },
  }).catch(() => null)

  return Response.json({ token: (user as { extensionToken?: string | null } | null)?.extensionToken ?? null })
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  await ensureCol()

  const token = randomBytes(32).toString("hex")

  try {
    await prisma.$executeRaw`
      UPDATE "User" SET "extensionToken" = ${token} WHERE id = ${session.user.id}
    `
  } catch {
    return Response.json({ error: "Failed to save token" }, { status: 500 })
  }

  return Response.json({ token })
}
