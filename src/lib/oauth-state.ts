import { createHmac, timingSafeEqual } from "crypto"

// Shared HMAC-signed state for the OAuth connect/callback flows (Gmail, LinkedIn).
// The signing key MUST be present — there is intentionally no insecure fallback.
// A missing secret would let an attacker forge a `state` and graft an OAuth
// account onto an arbitrary userId, so we fail closed instead.
function authSecret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET is not set")
  return s
}

/** Build a signed state token binding the flow to a userId, valid ~10 minutes. */
export function makeOAuthState(userId: string): string {
  const payload = `${userId}:${Date.now()}`
  const sig = createHmac("sha256", authSecret()).update(payload).digest("hex")
  return Buffer.from(`${payload}:${sig}`).toString("base64url")
}

/** Verify a signed state token; returns the userId or null if invalid/expired. */
export function verifyOAuthState(state: string, maxAgeMs = 10 * 60 * 1000): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString()
    const parts = decoded.split(":")
    if (parts.length !== 3) return null
    const [userId, ts, sig] = parts
    const payload = `${userId}:${ts}`
    const expected = createHmac("sha256", authSecret()).update(payload).digest("hex")
    const sigBuf = Buffer.from(sig)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null
    if (Date.now() - Number(ts) > maxAgeMs) return null
    return userId
  } catch {
    return null
  }
}
