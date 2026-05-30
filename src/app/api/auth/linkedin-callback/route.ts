import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { verifyOAuthState } from "@/lib/oauth-state"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/contacts?linkedin_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/contacts?linkedin_error=missing_params`)
  }

  const userId = verifyOAuthState(state)
  if (!userId) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/contacts?linkedin_error=invalid_state`)
  }

  // Exchange code for token
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/linkedin-callback`,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  })

  if (!tokenRes.ok) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/contacts?linkedin_error=token_exchange_failed`)
  }

  const token = await tokenRes.json()

  // Upsert the LinkedIn account record
  await prisma.account.upsert({
    where: { provider_providerAccountId: { provider: "linkedin", providerAccountId: userId } },
    update: {
      access_token: token.access_token,
      expires_at: token.expires_in ? Math.floor(Date.now() / 1000) + token.expires_in : null,
      scope: token.scope ?? "r_dma_portability_self_serve",
    },
    create: {
      userId,
      type: "oauth",
      provider: "linkedin",
      providerAccountId: userId,
      access_token: token.access_token,
      expires_at: token.expires_in ? Math.floor(Date.now() / 1000) + token.expires_in : null,
      scope: token.scope ?? "r_dma_portability_self_serve",
    },
  })

  return Response.redirect(`${process.env.NEXTAUTH_URL}/contacts?linkedin_connected=1`)
}
