import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getLastAuthError } from "@/lib/auth-error-store"
import { isAdminSession } from "@/lib/admin"

const TABLES = ["User", "Account", "Session", "VerificationToken", "Contact", "ContactNote", "ContactList", "ContactListMember"] as const

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  // Diagnostics expose deployment topology and global row counts — admin-only.
  if (!isAdminSession(session)) return new Response("Forbidden", { status: 403 })

  const env = {
    POSTGRES_PRISMA_URL: !!process.env.POSTGRES_PRISMA_URL,
    POSTGRES_URL_NON_POOLING: !!process.env.POSTGRES_URL_NON_POOLING,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
    NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    LINKEDIN_CLIENT_ID: !!process.env.LINKEDIN_CLIENT_ID,
    LINKEDIN_CLIENT_SECRET: !!process.env.LINKEDIN_CLIENT_SECRET,
    ADMIN_KEY: !!process.env.ADMIN_KEY,
  }

  type TableStatus = { count: number } | { error: string }
  const tables: Record<string, TableStatus> = {}

  let connected = true
  let dbError: string | null = null

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (e) {
    connected = false
    dbError = e instanceof Error ? e.message : String(e)
  }

  if (connected) {
    for (const table of TABLES) {
      try {
        const rows = await (prisma as any)[table.charAt(0).toLowerCase() + table.slice(1)].count()
        tables[table] = { count: rows }
      } catch (e) {
        tables[table] = { error: e instanceof Error ? e.message : String(e) }
      }
    }
  }

  return Response.json({ env, db: { connected, error: dbError, tables }, lastAuthError: getLastAuthError() })
}
