const AUTO_PREFIXES = new Set([
  "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply", "do_not_reply",
  "notifications", "notification", "newsletter", "newsletters", "updates", "update",
  "mailer", "bounce", "postmaster", "billing", "invoices", "invoice", "receipts",
  "receipt", "alerts", "alert", "news", "digest", "marketing", "promo", "promotions",
  "automated", "unsubscribe", "system", "bot", "info", "hello", "team", "support",
  "help", "contact", "service", "feedback", "reply", "mail", "admin", "noti",
  "notify", "account", "accounts", "security", "privacy", "legal", "sales",
  "product", "announcements", "announcement", "press", "media", "events",
  "community", "forum", "concierge", "cs", "ops", "orders", "order", "shipping",
])

const AUTO_DOMAINS = new Set([
  "beehiiv.com", "lu.ma", "luma.com", "luma-mail.com", "wework.com", "weworkemail.com",
  "eventbrite.com", "mailchimp.com", "mc.com", "sendgrid.net", "sendgrid.com",
  "mailgun.org", "klaviyo.com", "klaviyomail.com", "hubspot.com", "hs-email.net",
  "marketo.com", "pardot.com", "stripe.com", "paddle.com", "notion.so",
  "mailjet.com", "constantcontact.com", "campaign-archive.com", "list-manage.com",
  "createsend.com", "cmail20.com", "cmail19.com", "brevo.com", "sendinblue.com",
  "intercom.io", "customer.io", "drip.com", "convertkit.com", "activehosted.com",
  "substack.com", "ghost.io", "squarespace.com", "shopify.com", "woocommerce.com",
  "docusign.net", "echosign.com", "hellosign.com", "zoom.us", "calendly.com",
  "zoomgov.com", "ringcentral.com", "surveymonkey.com", "typeform.com",
])

export function isAutomatedEmail(email: string): boolean {
  const lower = email.toLowerCase().trim()
  const atIdx = lower.indexOf("@")
  if (atIdx === -1) return false

  const prefix = lower.slice(0, atIdx)
  const domain = lower.slice(atIdx + 1)

  if (AUTO_PREFIXES.has(prefix)) return true

  // Common automated prefix patterns, including subaddressed variants (e.g. notifications+abc123@)
  if (
    prefix.startsWith("noreply") ||
    prefix.startsWith("no-reply") ||
    prefix.startsWith("no_reply") ||
    prefix.startsWith("do-not-reply") ||
    prefix.startsWith("do_not_reply") ||
    prefix.startsWith("mailer-daemon") ||
    prefix.startsWith("auto-reply") ||
    prefix.startsWith("auto_reply") ||
    prefix.startsWith("notifications+") ||
    prefix.startsWith("bounce+") ||
    prefix.startsWith("noreply+")
  ) return true

  // Catch "noreply" or "no-reply" embedded anywhere in the prefix (e.g. bounce-noreply@, auto.noreply@)
  if (prefix.includes("noreply") || prefix.includes("no-reply") || prefix.includes("no_reply")) return true

  if (AUTO_DOMAINS.has(domain)) return true

  // Catch subdomains of known automated senders (e.g. mail.lu.ma, emails.luma.com)
  if (domain.endsWith(".lu.ma") || domain.endsWith(".luma.com") || domain.endsWith(".luma-mail.com")) return true

  return false
}
