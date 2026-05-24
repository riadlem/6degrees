/**
 * Classify an email address relative to the contact's current company.
 *
 *  "personal"  — free/consumer provider (gmail, hotmail, icloud, …)
 *  "mismatch"  — corporate address whose domain doesn't match the company
 *  "match"     — corporate address consistent with the company
 *
 * Returns null when there is no email address to classify.
 */

export type EmailKind = "personal" | "mismatch" | "match"

// ── Free / consumer email providers ──────────────────────────────────────────
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.fr", "hotmail.co.uk", "hotmail.de", "hotmail.es",
  "outlook.com", "outlook.fr", "outlook.de", "outlook.es",
  "live.com", "live.fr", "live.co.uk", "live.de",
  "yahoo.com", "yahoo.fr", "yahoo.co.uk", "yahoo.de", "yahoo.es", "yahoo.it",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "pm.me",
  "aol.com", "msn.com",
  // French ISP / domestic
  "wanadoo.fr", "orange.fr", "free.fr", "sfr.fr", "laposte.net",
  "bbox.fr", "numericable.fr", "neuf.fr", "aliceadsl.fr",
  // Other common consumer
  "ymail.com", "rocketmail.com",
  "gmx.com", "gmx.net", "gmx.fr", "gmx.de",
  "mail.com", "email.com", "zoho.com",
])

// Country-specific compound TLDs — the company segment sits before these
const COMPOUND_TLDS = new Set([
  "co.uk", "co.jp", "co.nz", "co.in", "co.kr", "co.za",
  "com.au", "com.br", "com.mx", "com.ar", "com.co",
  "org.uk", "net.au", "net.nz",
])

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the company-identifying segment from a full email domain.
 *   "fr.salesforce.com" → "salesforce"
 *   "bcg.com"           → "bcg"
 *   "company.co.uk"     → "company"
 */
function domainCore(domain: string): string {
  const d = domain.toLowerCase()
  for (const tld of COMPOUND_TLDS) {
    if (d.endsWith("." + tld)) {
      const before = d.slice(0, -(tld.length + 1)).split(".")
      return before[before.length - 1]
    }
  }
  const parts = d.split(".")
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0]
}

/** Strip non-alphanumeric characters and lowercase */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** True when `acronym` is formed from the first letters of the words in `phrase` */
function isAcronymOf(acronym: string, phrase: string): boolean {
  if (acronym.length < 2) return false
  const initials = phrase
    .toLowerCase()
    .split(/[\s&+,._/-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0])
    .join("")
  return initials === acronym
}

function domainMatchesCompany(dp: string, company: string): boolean {
  const cn = norm(company)

  // Direct substring in either direction
  if (cn.includes(dp) || dp.includes(cn)) return true

  // Prefix match (avoid matching tiny strings — require 4+ chars)
  if (dp.length >= 4 && cn.startsWith(dp)) return true
  if (cn.length >= 4 && dp.startsWith(cn.slice(0, Math.min(cn.length, 10)))) return true

  // Acronym: "bcg" ↔ "Boston Consulting Group", "kpmg" ↔ "KPMG"
  if (isAcronymOf(dp, company)) return true

  return false
}

// ── Public API ────────────────────────────────────────────────────────────────

export function classifyEmail(
  emailAddress: string | null,
  company: string | null
): EmailKind | null {
  if (!emailAddress || !emailAddress.includes("@")) return null

  const domain = emailAddress.slice(emailAddress.lastIndexOf("@") + 1).toLowerCase()

  if (PERSONAL_DOMAINS.has(domain)) return "personal"

  if (!company) return "match" // no company to compare — assume ok

  return domainMatchesCompany(domainCore(domain), company) ? "match" : "mismatch"
}

// ── Style helpers (consumed by components) ───────────────────────────────────

export const EMAIL_KIND_COLOR: Record<EmailKind, string> = {
  match:    "text-green-500",
  personal: "text-purple-500",
  mismatch: "text-orange-500",
}

export const EMAIL_KIND_BG: Record<EmailKind, string> = {
  match:    "bg-green-50 border-green-200 text-green-700",
  personal: "bg-purple-50 border-purple-200 text-purple-700",
  mismatch: "bg-orange-50 border-orange-200 text-orange-700",
}

export const EMAIL_KIND_TITLE: Record<EmailKind, string> = {
  match:    "Work email",
  personal: "Personal email",
  mismatch: "Stale email — domain doesn't match current company",
}
