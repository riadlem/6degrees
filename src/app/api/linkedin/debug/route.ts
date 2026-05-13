import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { ensureMemberAuthorization } from "@/lib/linkedin"

const LINKEDIN_API_BASE = "https://api.linkedin.com/rest"
const LINKEDIN_VERSION = "202312"

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": LINKEDIN_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
  "Content-Type": "application/json",
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "linkedin" },
  })

  if (!account?.access_token) {
    return Response.json({ error: "No LinkedIn token found" }, { status: 400 })
  }

  const token = account.access_token
  const results: Record<string, unknown> = {}

  // Step 1: create member authorization
  const authRes = await fetch(`${LINKEDIN_API_BASE}/memberAuthorizations`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({}),
    cache: "no-store",
  })
  results.memberAuthorizations = {
    status: authRes.status,
    body: await authRes.text().catch(() => "(failed to read)"),
  }

  // Step 2: query available domains
  const metaRes = await fetch(`${LINKEDIN_API_BASE}/memberSnapshotData?q=domainMetadata`, {
    headers: headers(token),
    cache: "no-store",
  })
  results.domainMetadata = {
    status: metaRes.status,
    body: await metaRes.text().catch(() => "(failed to read)"),
  }

  // Step 3: query CONNECTIONS domain
  const connRes = await fetch(
    `${LINKEDIN_API_BASE}/memberSnapshotData?q=criteria&domain=CONNECTIONS&start=0&count=5`,
    { headers: headers(token), cache: "no-store" }
  )
  results.connectionsQuery = {
    status: connRes.status,
    body: await connRes.text().catch(() => "(failed to read)"),
  }

  return Response.json(results)
}
