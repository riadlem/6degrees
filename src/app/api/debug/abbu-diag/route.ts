import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export type AbbuDiagPayload = {
  event: "parse_error" | "zero_contacts" | "self_test"
  fileName?: string
  fileSize?: number
  tables?: string[]
  zabcdrecordColumns?: string[]
  zabcdrecordRowCount?: number
  error?: string
  steps?: { label: string; ok: boolean; detail?: string }[]
  userAgent?: string
}

export async function GET() {
  return Response.json({ ok: true, endpoint: "abbu-diag" })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id ?? "anon"

  let payload: AbbuDiagPayload
  try {
    payload = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }

  console.error("[ABBU-DIAG]", JSON.stringify({ userId, ...payload }))

  return Response.json({ ok: true })
}
