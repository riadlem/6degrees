import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

const LINKEDIN_API_BASE = "https://api.linkedin.com/rest"
const LINKEDIN_VERSION = "202312"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "linkedin" },
  })

  if (!account?.access_token) {
    return Response.json({ error: "No LinkedIn token found" }, { status: 400 })
  }

  const results: Record<string, unknown> = {}

  // Query available domains
  const metaUrl = `${LINKEDIN_API_BASE}/memberSnapshotData?q=domainMetadata`
  const metaRes = await fetch(metaUrl, {
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  })
  results.domainMetadata = {
    status: metaRes.status,
    body: await metaRes.text().catch(() => "(failed to read)"),
  }

  // Query CONNECTIONS domain directly
  const connUrl = `${LINKEDIN_API_BASE}/memberSnapshotData?q=criteria&domain=CONNECTIONS&start=0&count=5`
  const connRes = await fetch(connUrl, {
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  })
  results.connectionsQuery = {
    status: connRes.status,
    body: await connRes.text().catch(() => "(failed to read)"),
  }

  return Response.json(results)
}
