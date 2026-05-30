import prisma from "@/lib/prisma"
import { fetchGmailProfile, GMAIL_SCOPES } from "@/lib/gmail"
import { verifyOAuthState } from "@/lib/oauth-state"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?gmail_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?gmail_error=missing_params`)
  }

  const userId = verifyOAuthState(state)
  if (!userId) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?gmail_error=invalid_state`)
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/gmail-callback`,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  })

  if (!tokenRes.ok) {
    return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?gmail_error=token_exchange_failed`)
  }

  const token = await tokenRes.json()
  const nowSec = Math.floor(Date.now() / 1000)

  // Fetch Gmail address and current historyId to use as providerAccountId + incremental anchor
  const profile = await fetchGmailProfile(token.access_token)
  const gmailEmail = profile?.emailAddress ?? userId
  const historyId = profile?.historyId ?? undefined

  await prisma.account.upsert({
    where: { provider_providerAccountId: { provider: "gmail", providerAccountId: gmailEmail } },
    update: {
      userId,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? undefined,
      expires_at: token.expires_in ? nowSec + token.expires_in : null,
      scope: token.scope ?? GMAIL_SCOPES,
    },
    create: {
      userId,
      type: "oauth",
      provider: "gmail",
      providerAccountId: gmailEmail,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      expires_at: token.expires_in ? nowSec + token.expires_in : null,
      scope: token.scope ?? GMAIL_SCOPES,
    },
  })

  await prisma.gmailSync.upsert({
    where: { userId_gmailEmail: { userId, gmailEmail } },
    update: {},  // don't overwrite historyId on reconnect
    create: { userId, gmailEmail, historyId },  // anchor set on first connection
  })

  // Auto-register the connected address so outbound detection picks it up
  if (gmailEmail && gmailEmail !== userId) {
    await prisma.userEmailAddress.upsert({
      where: { userId_email: { userId, email: gmailEmail } },
      update: {},
      create: { userId, email: gmailEmail },
    })
  }

  return Response.redirect(`${process.env.NEXTAUTH_URL}/settings?gmail=connected`)
}
