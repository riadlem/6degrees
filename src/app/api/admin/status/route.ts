import prisma from "@/lib/prisma"

function checkKey(req: Request) {
  const key = new URL(req.url).searchParams.get("key")
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) return process.env.NODE_ENV !== "production"
  return key === adminKey
}

const TABLES = ["User", "Account", "Session", "VerificationToken", "Contact", "ContactNote", "ContactList", "ContactListMember"] as const

export async function GET(req: Request) {
  if (!checkKey(req)) return new Response("Forbidden", { status: 403 })

  const env = {
    DATABASE_URL: !!process.env.DATABASE_URL,
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

  return Response.json({ env, db: { connected, error: dbError, tables } })
}
