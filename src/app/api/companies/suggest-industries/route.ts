import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Keyword → industry category mapping for company name heuristics
const NAME_KEYWORDS: [RegExp, string][] = [
  [/bank|crédit|credit|caisse|financial|finance|capital|invest|asset|fund|insurance|assur|mutuelle|bourse/i, "Financial Services"],
  [/tech|software|digital|data|cloud|cyber|ai\b|intel|oracle|sap|salesforce|google|microsoft|apple|meta|amazon/i, "Technology"],
  [/media|press|journal|news|magazine|radio|tv|télé|broadcast|content|studio|music|spotify|netflix/i, "Media & Entertainment"],
  [/health|pharma|medical|clinic|hospital|santé|biotech|life sciences|sanofi|pfizer|roche/i, "Healthcare & Pharma"],
  [/consult|advisory|strategy|mckinsey|bcg|deloitte|kpmg|pwc|ernst|accenture|bain/i, "Consulting"],
  [/retail|commerce|shop|store|brand|luxury|fashion|vuitton|chanel|hermès|hermes|dior|kering|lvmh/i, "Retail & Luxury"],
  [/telecom|telecoms|orange|bouygues|sfr|vodafone|att\b|verizon|t-mobile/i, "Telecommunications"],
  [/energy|oil|gas|électricité|electricity|total|engie|shell|bp\b|renewab/i, "Energy"],
  [/real estate|immobilier|property|realty|estate/i, "Real Estate"],
  [/law|legal|avocat|attorney|notaire|cabinet juridique/i, "Legal"],
  [/education|school|university|université|école|learning|formation/i, "Education"],
  [/food|restaurant|beverage|drink|nestlé|danone|unilever|beverage/i, "Food & Beverages"],
  [/transport|logistics|shipping|freight|supply chain|dhl|fedex|ups\b|maersk/i, "Logistics & Transport"],
  [/construction|btp|building|architecture|ingénierie|engineering|vinci|bouygues/i, "Construction & Engineering"],
  [/agri|farm|food produc/i, "Agriculture"],
  [/ngo|nonprofit|non-profit|association|fondation|foundation|humanitarian/i, "Non-Profit"],
  [/government|gouv|public sector|administration|ministère|ministry/i, "Public Sector"],
  [/aerospace|defense|defence|airbus|thales|safran|boeing|dassault/i, "Aerospace & Defense"],
  [/hotel|hospitality|tourism|travel|tourisme|accor|hilton|marriott/i, "Hospitality & Tourism"],
  [/manufactur|industri|auto|automotive|renault|peugeot|stellantis|siemens|michelin/i, "Manufacturing"],
  [/marketing|advertising|publicité|pub\b|agency|ogilvy|wpp\b|publicis|havas/i, "Marketing & Advertising"],
  [/hr|human resources|recruitment|staffing|talent|headhunting/i, "Human Resources"],
  [/audit|accounting|compta|comptabilité/i, "Accounting"],
]

function suggestFromName(name: string): string | null {
  for (const [re, cat] of NAME_KEYWORDS) {
    if (re.test(name)) return cat
  }
  return null
}

// Map free-form LinkedIn industry → our categories
function normalizeIndustry(raw: string): string {
  const r = raw.toLowerCase()
  if (/software|internet|information technology|computer|tech|saas|it services/i.test(r)) return "Technology"
  if (/financial|banking|investment|insurance|venture|capital markets/i.test(r)) return "Financial Services"
  if (/hospital|medical|pharma|biotech|health/i.test(r)) return "Healthcare & Pharma"
  if (/consult|management consult|strategy/i.test(r)) return "Consulting"
  if (/retail|apparel|luxury|fashion|consumer goods/i.test(r)) return "Retail & Luxury"
  if (/media|entertainment|broadcast|publishing|music/i.test(r)) return "Media & Entertainment"
  if (/telecom/i.test(r)) return "Telecommunications"
  if (/oil|energy|utilities|renewab/i.test(r)) return "Energy"
  if (/real estate|property/i.test(r)) return "Real Estate"
  if (/legal|law/i.test(r)) return "Legal"
  if (/education|e-learning/i.test(r)) return "Education"
  if (/food|beverage|restaurant/i.test(r)) return "Food & Beverages"
  if (/transport|logistics|shipping|supply chain/i.test(r)) return "Logistics & Transport"
  if (/construction|civil engineer|architecture/i.test(r)) return "Construction & Engineering"
  if (/nonprofit|non-profit|philanthropy/i.test(r)) return "Non-Profit"
  if (/government|public/i.test(r)) return "Public Sector"
  if (/aerospace|defense|military/i.test(r)) return "Aerospace & Defense"
  if (/hospitality|hotel|travel|tourism/i.test(r)) return "Hospitality & Tourism"
  if (/manufactur|automotive|industrial/i.test(r)) return "Manufacturing"
  if (/marketing|advertising|pr\b|public relations/i.test(r)) return "Marketing & Advertising"
  if (/human resources|staffing|recruiting/i.test(r)) return "Human Resources"
  if (/accounting|audit/i.test(r)) return "Accounting"
  return raw // keep as-is if no normalization match
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  await prisma.$executeRaw`ALTER TABLE "CompanyPreference" ADD COLUMN IF NOT EXISTS "industry" TEXT`.catch(() => {})

  // Get companies without a confirmed pref industry
  const prefs = await prisma.companyPreference.findMany({
    where: { userId },
    select: { company: true, industry: true },
  })
  const confirmedIndustry = new Map(prefs.filter((p) => p.industry).map((p) => [p.company, p.industry!]))

  // Most common industry per company from contacts
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

  // Get all company names
  const companies = await prisma.contact.groupBy({
    by: ["company"],
    where: { userId, company: { not: null } },
    _count: { id: true },
  })

  const suggestions = companies
    .filter((r) => r.company && !confirmedIndustry.has(r.company as string))
    .map((r) => {
      const name = r.company as string
      const fromContacts = contactIndustry.get(name)
      const normalized = fromContacts ? normalizeIndustry(fromContacts) : null
      const suggested = normalized ?? suggestFromName(name)
      return { company: name, suggested, contactIndustry: fromContacts ?? null }
    })
    .filter((s) => s.suggested !== null)
    .sort((a, b) => a.company.localeCompare(b.company))

  return Response.json({ suggestions })
}
