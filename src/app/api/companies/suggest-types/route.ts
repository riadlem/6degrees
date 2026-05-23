import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

type CompanyType = "brand" | "non-brand"

// ── Industry → type (based on confirmed/derived industry) ──────────────────
const INDUSTRY_TO_TYPE: Record<string, { type: CompanyType; confidence: "high" | "medium" }> = {
  "Retail & Luxury":           { type: "brand",     confidence: "high" },
  "Food & Beverages":          { type: "brand",     confidence: "high" },
  "Hospitality & Tourism":     { type: "brand",     confidence: "high" },
  "Media & Entertainment":     { type: "brand",     confidence: "medium" },
  "Technology":                { type: "non-brand", confidence: "high" },
  "Consulting":                { type: "non-brand", confidence: "high" },
  "Telecommunications":        { type: "non-brand", confidence: "high" },
  "Aerospace & Defense":       { type: "non-brand", confidence: "high" },
  "Legal":                     { type: "non-brand", confidence: "high" },
  "Accounting":                { type: "non-brand", confidence: "high" },
  "Human Resources":           { type: "non-brand", confidence: "high" },
  "Marketing & Advertising":   { type: "non-brand", confidence: "high" },
  "Logistics & Transport":     { type: "non-brand", confidence: "high" },
  "Financial Services":        { type: "non-brand", confidence: "medium" },
  "Healthcare & Pharma":       { type: "non-brand", confidence: "medium" },
  "Energy":                    { type: "non-brand", confidence: "medium" },
  "Real Estate":               { type: "non-brand", confidence: "medium" },
  "Construction & Engineering":{ type: "non-brand", confidence: "medium" },
  "Manufacturing":             { type: "non-brand", confidence: "medium" },
  "Education":                 { type: "non-brand", confidence: "medium" },
  "Public Sector":             { type: "non-brand", confidence: "medium" },
}

// ── Known brand companies / groups ─────────────────────────────────────────
const BRAND_RE = new RegExp(
  [
    // LVMH houses
    "lvmh", "louis vuitton", "vuitton", "dior", "givenchy", "guerlain",
    "fendi", "celine", "céline", "loewe", "kenzo", "berluti", "bvlgari",
    "bulgari", "tag heuer", "zenith watches", "chaumet", "moët", "moet",
    "veuve clicquot", "hennessy", "dom pérignon", "dom perignon",
    // Kering houses
    "kering", "gucci", "balenciaga", "bottega veneta", "saint laurent",
    "alexander mcqueen", "brioni", "boucheron", "pomellato",
    // Other luxury / fashion
    "chanel", "hermès", "hermes", "cartier", "rolex", "omega watches",
    "patek philippe", "tiffany", "burberry", "prada", "versace", "armani",
    "dolce.{0,5}gabbana", "valentino", "ferragamo", "tod.s", "moncler",
    "off.white", "lanvin", "longchamp", "furla", "coach", "kate spade",
    "michael kors", "ralph lauren", "tommy hilfiger", "calvin klein",
    // Fashion retail
    "zara", "inditex", "h&m", "hennes", "mango", "uniqlo", "asos",
    "primark", "topshop", "forever 21", "shein", "zalando",
    // Beauty / cosmetics
    "sephora", "l.or.al", "loreal", "lancôme", "lancome", "ysl beauté",
    "mac cosmetics", "nyx cosmetics", "urban decay", "clinique", "estée lauder",
    "dior beauty", "clarins", "nuxe", "caudalie",
    // Food & beverage brands
    "nestlé", "nestle", "danone", "coca.cola", "pepsico", "heineken",
    "anheuser.busch", "ab inbev", "pernod ricard", "rémy cointreau",
    "remy cointreau", "bacardi", "diageo", "moët hennessy", "moet hennessy",
    // Consumer electronics
    "samsung", "sony", "lg electronics", "panasonic", "philips consumer",
    "dyson", "bose", "bang.{0,5}olufsen", "apple inc",
    // Automotive consumer brands
    "renault", "peugeot", "citroën", "citroen", "stellantis", "bmw group",
    "mercedes.benz", "mercedes benz", "audi", "volkswagen", "toyota",
    "honda", "ferrari", "lamborghini", "maserati", "bentley", "rolls.royce",
    "porsche", "volvo cars", "jaguar", "land rover", "tesla",
    // Hospitality brands
    "accorhotels", "accor hotels", "hilton", "marriott", "hyatt",
    "four seasons", "radisson", "club med", "airbnb",
    // Entertainment / content brands
    "disney", "netflix", "warner", "universal pictures", "sony pictures",
    "paramount", "canal.{0,5}plus", "m6 group",
  ].join("|"),
  "i"
)

// ── Known B2B / tech / services companies ─────────────────────────────────
const NONBRAND_RE = new RegExp(
  [
    // Enterprise SaaS
    "salesforce", "snowflake", "servicenow", "workday", "oracle", "sap ",
    "hubspot", "marketo", "atlassian", "zendesk", "intercom", "twilio",
    "stripe", "adyen", "amplitude", "databricks", "palantir", "datadog",
    "splunk", "dynatrace", "pagerduty", "elastic", "confluent", "dbt labs",
    "fivetran", "segment\\.com", "mixpanel", "contentsquare", "heap",
    // Cloud & infra
    "amazon web services", "aws ", "microsoft azure", "google cloud",
    "ovh cloud", "scaleway", "cloudflare", "fastly", "akamai", "f5 networks",
    // Dev tooling
    "github", "gitlab", "bitbucket", "jira", "confluence", "docker",
    "hashicorp", "vercel", "netlify", "supabase",
    // Major consulting
    "mckinsey", "boston consulting group", "bcg ", "bain &", "deloitte",
    "pwc ", "kpmg ", "ernst.{0,5}young", "accenture", "capgemini",
    "sopra steria", "wavestone", "oliver wyman", "roland berger", "mercer",
    "booz allen", "gartner", "forrester",
    // Telecom B2B
    "orange business", "at&t business", "verizon enterprise",
  ].join("|"),
  "i"
)

// ── Generic keyword signals ─────────────────────────────────────────────────
const BRAND_KEYWORD_RE =
  /\b(luxury|luxe|fashion|couture|maison|haute|beauté|beaute|parfum|cosmétique|cosmetique|bijouterie|joaillerie|mode|lifestyle|wine|spirits|champagne|boulangerie|pâtisserie|patisserie|restaurant|café|resort|spa)\b/i

const NONBRAND_KEYWORD_RE =
  /\b(software|cloud|data|platform|systems|solutions|analytics|intelligence|infrastructure|api\b|saas|paas|iaas|devops|consulting|advisory|conseil|outsourcing|staffing|managed service)\b/i

// ── Classifier ──────────────────────────────────────────────────────────────
function classify(
  company: string,
  industry: string | null
): { type: CompanyType; reason: string; confidence: "high" | "medium" } | null {
  const n = company.toLowerCase()

  // 1. Known brand by name (highest priority)
  if (BRAND_RE.test(n)) {
    return { type: "brand", reason: "Known consumer brand", confidence: "high" }
  }

  // 2. Known non-brand by name
  if (NONBRAND_RE.test(n)) {
    return { type: "non-brand", reason: "Known B2B / tech company", confidence: "high" }
  }

  // 3. Confirmed / derived industry
  if (industry) {
    const mapped = INDUSTRY_TO_TYPE[industry]
    if (mapped) {
      return {
        type: mapped.type,
        reason: `${industry} industry`,
        confidence: mapped.confidence,
      }
    }
  }

  // 4. Name keyword heuristics
  if (BRAND_KEYWORD_RE.test(n)) {
    return { type: "brand", reason: "Consumer brand keywords in name", confidence: "medium" }
  }
  if (NONBRAND_KEYWORD_RE.test(n)) {
    return { type: "non-brand", reason: "B2B / tech keywords in name", confidence: "medium" }
  }

  return null
}

// ── Route ────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  // Load prefs: skip companies that already have a type set
  const prefs = await prisma.companyPreference.findMany({
    where: { userId },
    select: { company: true, type: true, industry: true },
  })
  const existingType  = new Map(prefs.filter((p) => p.type).map((p) => [p.company, p.type!]))
  const confirmedIndustry = new Map(prefs.filter((p) => p.industry).map((p) => [p.company, p.industry!]))

  // Best contact-derived industry per company (most common)
  const rows = await prisma.contact.groupBy({
    by: ["company", "industry"],
    where: { userId, company: { not: null }, industry: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  })
  const contactIndustry = new Map<string, string>()
  for (const r of rows) {
    if (r.company && r.industry && !contactIndustry.has(r.company)) {
      contactIndustry.set(r.company, r.industry)
    }
  }

  // All company names in this user's network (excluding already typed)
  const companies = await prisma.contact.groupBy({
    by: ["company"],
    where: {
      userId,
      company: { not: null },
      firstName: { not: "" },
      lastName:  { not: "" },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  })

  const suggestions = companies
    .filter((r) => r.company && !existingType.has(r.company as string))
    .flatMap((r) => {
      const name = r.company as string
      const industry = confirmedIndustry.get(name) ?? contactIndustry.get(name) ?? null
      const result = classify(name, industry)
      if (!result) return []
      return [{ company: name, count: r._count.id, ...result }]
    })
    .sort((a, b) => {
      // High confidence first, then by count (large companies first)
      if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1
      return b.count - a.count
    })

  return Response.json({ suggestions })
}
