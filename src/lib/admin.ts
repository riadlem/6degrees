import type { Session } from "next-auth"

// Admin gating for the /admin diagnostics page and its endpoints.
//
// Authorization is driven by the ADMIN_EMAILS environment variable: a
// comma-separated allow-list of email addresses permitted to run schema
// migrations and read deployment diagnostics. If ADMIN_EMAILS is unset the
// system fails closed (no one is admin) — set it in the deployment env, e.g.
//   ADMIN_EMAILS=owner@example.com
// This prevents any logged-in user from triggering DDL or enumerating the
// environment, which the previous "is logged in" check allowed.
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  const raw = process.env.ADMIN_EMAILS
  if (!raw || raw.trim().length === 0) return false
  const list = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}

export function isAdminSession(session: Session | null): boolean {
  return isAdminEmail(session?.user?.email ?? null)
}
