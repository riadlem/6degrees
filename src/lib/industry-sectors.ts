// Salesforce-inspired sector taxonomy mapped to LinkedIn industry field values.
// LinkedIn industry strings come from the DMA API exactly as shown below (case-insensitive matched in queries).

export type SectorKey =
  | "banking_insurance"
  | "technology"
  | "healthcare"
  | "retail_consumer"
  | "industry_manufacturing"
  | "media_communications"
  | "professional_services"
  | "public_sector"
  | "energy_environment"
  | "real_estate"

export type Sector = {
  key: SectorKey
  label: string
  shortLabel: string
  color: {
    chip: string      // Tailwind classes for chip (inactive)
    active: string    // Tailwind classes for chip (active)
    dot: string       // bullet color class
  }
  industries: string[]  // LinkedIn industry values
}

export const INDUSTRY_SECTORS: Sector[] = [
  {
    key: "banking_insurance",
    label: "Banking & Insurance",
    shortLabel: "Finance",
    color: {
      chip:   "border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100",
      active: "border-blue-500 bg-blue-500 text-white",
      dot:    "bg-blue-500",
    },
    industries: [
      "Banking", "Insurance", "Financial Services", "Capital Markets",
      "Investment Banking", "Investment Management",
      "Venture Capital & Private Equity", "Fund-Raising",
    ],
  },
  {
    key: "technology",
    label: "Technology & Digital",
    shortLabel: "Tech",
    color: {
      chip:   "border-violet-200 text-violet-600 bg-violet-50 hover:bg-violet-100",
      active: "border-violet-500 bg-violet-500 text-white",
      dot:    "bg-violet-500",
    },
    industries: [
      "Computer Software", "Information Technology & Services", "Internet",
      "Computer Hardware", "Computer Networking", "Computer & Network Security",
      "Semiconductors", "Consumer Electronics", "Wireless", "Online Media",
      "E-Learning", "Computer Games", "Nanotechnology",
    ],
  },
  {
    key: "healthcare",
    label: "Healthcare & Life Sciences",
    shortLabel: "Health",
    color: {
      chip:   "border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100",
      active: "border-emerald-500 bg-emerald-500 text-white",
      dot:    "bg-emerald-500",
    },
    industries: [
      "Hospital & Health Care", "Pharmaceuticals", "Biotechnology",
      "Medical Devices", "Medical Practice", "Mental Health Care",
      "Health, Wellness & Fitness", "Alternative Medicine", "Veterinary",
    ],
  },
  {
    key: "retail_consumer",
    label: "Retail & Consumer Goods",
    shortLabel: "Retail",
    color: {
      chip:   "border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100",
      active: "border-amber-500 bg-amber-500 text-white",
      dot:    "bg-amber-500",
    },
    industries: [
      "Retail", "Consumer Goods", "Apparel & Fashion", "Cosmetics",
      "Luxury Goods & Jewelry", "Sporting Goods", "Supermarkets",
      "Food & Beverages", "Food Production", "Wine & Spirits",
      "Tobacco", "Consumer Services",
    ],
  },
  {
    key: "industry_manufacturing",
    label: "Automotive & Industry",
    shortLabel: "Industry",
    color: {
      chip:   "border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-100",
      active: "border-slate-600 bg-slate-600 text-white",
      dot:    "bg-slate-500",
    },
    industries: [
      "Automotive", "Manufacturing", "Machinery",
      "Mechanical or Industrial Engineering", "Electrical & Electronic Manufacturing",
      "Industrial Automation", "Chemicals", "Mining & Metals", "Plastics",
      "Paper & Forest Products", "Textiles", "Building Materials",
      "Defense & Space", "Glass, Ceramics & Concrete", "Railroad Manufacture",
      "Shipbuilding", "Aviation & Aerospace",
    ],
  },
  {
    key: "media_communications",
    label: "Media & Communications",
    shortLabel: "Media",
    color: {
      chip:   "border-pink-200 text-pink-600 bg-pink-50 hover:bg-pink-100",
      active: "border-pink-500 bg-pink-500 text-white",
      dot:    "bg-pink-500",
    },
    industries: [
      "Media Production", "Broadcast Media", "Entertainment", "Music",
      "Motion Pictures & Film", "Publishing", "Newspapers",
      "Telecommunications", "Public Relations & Communications",
      "Marketing & Advertising", "Photography", "Animation",
      "Performing Arts", "Fine Art",
    ],
  },
  {
    key: "professional_services",
    label: "Professional Services",
    shortLabel: "Services",
    color: {
      chip:   "border-sky-200 text-sky-600 bg-sky-50 hover:bg-sky-100",
      active: "border-sky-500 bg-sky-500 text-white",
      dot:    "bg-sky-500",
    },
    industries: [
      "Management Consulting", "Law Practice", "Legal Services", "Accounting",
      "Human Resources", "Staffing & Recruiting", "Market Research",
      "Professional Training & Coaching", "Outsourcing/Offshoring", "Research",
      "Information Services", "Events Services", "Translation & Localization",
      "Writing & Editing", "Design", "Graphic Design",
    ],
  },
  {
    key: "public_sector",
    label: "Public Sector & Education",
    shortLabel: "Public",
    color: {
      chip:   "border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100",
      active: "border-indigo-500 bg-indigo-500 text-white",
      dot:    "bg-indigo-500",
    },
    industries: [
      "Government Administration", "Government Relations", "Political Organization",
      "Public Policy", "Nonprofit Organization Management", "Education Management",
      "Higher Education", "Primary/Secondary Education", "Libraries",
      "Museums & Institutions", "Religious Institutions", "Military",
      "Law Enforcement", "Judiciary", "Public Safety", "Think Tanks",
      "Philanthropy", "International Affairs", "International Trade & Development",
      "Civic & Social Organization", "Individual & Family Services",
      "Program Development", "Legislative Office", "Executive Office",
    ],
  },
  {
    key: "energy_environment",
    label: "Energy & Environment",
    shortLabel: "Energy",
    color: {
      chip:   "border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100",
      active: "border-orange-500 bg-orange-500 text-white",
      dot:    "bg-orange-500",
    },
    industries: [
      "Oil & Energy", "Utilities", "Renewables & Environment",
      "Environmental Services",
    ],
  },
  {
    key: "real_estate",
    label: "Real Estate & Construction",
    shortLabel: "Real Estate",
    color: {
      chip:   "border-stone-200 text-stone-600 bg-stone-50 hover:bg-stone-100",
      active: "border-stone-600 bg-stone-600 text-white",
      dot:    "bg-stone-500",
    },
    industries: [
      "Real Estate", "Construction", "Architecture & Planning",
      "Civil Engineering", "Facilities Services",
    ],
  },
]

const SECTOR_MAP = new Map(INDUSTRY_SECTORS.map((s) => [s.key, s]))

export function getSector(key: string): Sector | undefined {
  return SECTOR_MAP.get(key as SectorKey)
}

// Returns the LinkedIn industry strings for a given sector key.
export function getSectorIndustries(key: string): string[] {
  return SECTOR_MAP.get(key as SectorKey)?.industries ?? []
}
