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
  "beehiiv.com", "lu.ma", "luma.com", "wework.com", "weworkemail.com",
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
  if (prefix.startsWith("noreply") || prefix.startsWith("no-reply") || prefix.startsWith("do-not-reply")) return true
  if (AUTO_DOMAINS.has(domain)) return true

  return false
}
