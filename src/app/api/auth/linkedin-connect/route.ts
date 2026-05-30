import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { makeOAuthState } from "@/lib/oauth-state"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const state = makeOAuthState(session.user.id)
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/linkedin-callback`

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization")
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID!)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("scope", "r_dma_portability_self_serve")
  url.searchParams.set("state", state)

  return Response.redirect(url.toString())
}
