import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GMAIL_SCOPES } from "@/lib/gmail"
import { makeOAuthState } from "@/lib/oauth-state"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  const state = makeOAuthState(session.user.id)
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/gmail-callback`

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("scope", GMAIL_SCOPES)
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "consent")
  url.searchParams.set("state", state)

  return Response.redirect(url.toString())
}
