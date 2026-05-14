// Known parent → subsidiary relationships.
// Keys are the canonical parent company name (as it would appear in LinkedIn).
// Values are exact subsidiary names to match (case-insensitive).
export const KNOWN_SUBSIDIARIES: Record<string, string[]> = {
  "LVMH": [
    "Louis Vuitton", "Dior", "Christian Dior", "Givenchy", "Céline", "Celine",
    "Loewe", "Marc Jacobs", "Fendi", "Loro Piana", "Berluti", "Kenzo",
    "Bulgari", "Bvlgari", "Guerlain", "Sephora", "Benefit Cosmetics", "Benefit",
    "Fresh", "Make Up For Ever", "Acqua di Parma", "Parfums Christian Dior",
    "TAG Heuer", "Hublot", "Zenith", "Chaumet", "Fred",
    "Moët & Chandon", "Moet & Chandon", "Dom Pérignon", "Dom Perignon",
    "Hennessy", "Veuve Clicquot", "Krug", "Glenmorangie", "Ardbeg",
    "Le Bon Marché", "DFS Group",
  ],
  "Kering": [
    "Gucci", "Saint Laurent", "Yves Saint Laurent", "YSL",
    "Bottega Veneta", "Balenciaga", "Alexander McQueen",
    "Brioni", "Pomellato", "Boucheron", "Qeelin",
    "PUMA", "Puma", "Volcom",
  ],
  "L'Oréal": [
    "Lancôme", "Lancome", "Garnier", "Maybelline", "Maybelline New York",
    "Giorgio Armani Beauty", "Armani Beauty", "Yves Saint Laurent Beauté",
    "Kiehl's", "NYX", "NYX Professional Makeup", "Urban Decay",
    "Biotherm", "La Roche-Posay", "Vichy", "CeraVe", "SkinCeuticals",
    "Shu Uemura", "Kérastase", "Kerastase", "Matrix", "Redken", "Pureology",
    "IT Cosmetics", "Helena Rubinstein", "Cadum", "Mixa",
  ],
  "Richemont": [
    "Cartier", "Van Cleef & Arpels", "Piaget", "IWC", "Jaeger-LeCoultre",
    "Montblanc", "Dunhill", "Chloé", "Chloe", "Baume & Mercier",
    "Panerai", "Officine Panerai", "Roger Dubuis", "Vacheron Constantin",
    "Net-a-Porter", "Mr Porter", "Alaïa", "Alaia",
  ],
  "BNP Paribas": [
    "BNP Paribas Cardif", "BNP Paribas Personal Finance", "Cetelem",
    "Arval", "BNP Paribas Real Estate", "BNP Paribas Asset Management",
    "BNP Paribas Securities Services", "BNP Paribas Fortis",
    "Hello bank!", "Hello Bank", "Nickel",
  ],
  "Société Générale": [
    "Crédit du Nord", "Credit du Nord", "Sogécap", "Sogecap",
    "ALD Automotive", "Boursorama", "Franfinance", "SG CIB",
  ],
  "Crédit Agricole": [
    "LCL", "Amundi", "Crédit Agricole CIB", "Credit Agricole CIB",
    "Pacifica", "Predica", "CA Indosuez", "CACIB",
    "Crédit Agricole Assurances",
  ],
  "AXA": [
    "AXA Investment Managers", "AXA IM", "AXA Banque",
    "Direct Assurance", "AXA XL", "AXA Assistance",
  ],
  "TotalEnergies": [
    "Total", "Total Marketing Services", "Total Energies",
    "Sunpower", "Saft",
  ],
  "Publicis Groupe": [
    "Saatchi & Saatchi", "Leo Burnett", "Razorfish", "Digitas",
    "Publicis Sapient", "MSL", "Prodigious", "Zenith Media", "Starcom",
    "Epsilon", "Performics", "BBH",
  ],
  "Vivendi": [
    "Canal+", "Universal Music Group", "UMG", "Havas",
    "CNews", "Dailymotion", "Gameloft",
  ],
  "Danone": [
    "Evian", "Volvic", "Badoit", "Activia", "Actimel",
    "Nutricia", "Blédina", "Alpro", "Silk",
  ],
  "Bouygues": [
    "TF1", "Bouygues Telecom", "Bouygues Immobilier",
    "Bouygues Construction", "Colas", "Bouygues Energies & Services",
  ],
  "Orange": [
    "Orange Business Services", "Orange Bank", "Orange Cyberdefense",
    "Orange Money",
  ],
  "Capgemini": [
    "Sogeti", "Capgemini Engineering", "Capgemini Invent", "Altran",
  ],
  "Accor": [
    "Sofitel", "Novotel", "Ibis", "Mercure", "Pullman", "MGallery",
    "Fairmont", "Raffles", "Swissôtel", "Mövenpick", "25hours Hotels",
    "Mama Shelter",
  ],
  "Alphabet": [
    "Google", "YouTube", "DeepMind", "Waymo", "Verily",
    "Google Cloud", "Google DeepMind",
  ],
  "Meta": [
    "Instagram", "WhatsApp", "Oculus", "Facebook",
    "Reality Labs",
  ],
  "Microsoft": [
    "LinkedIn", "GitHub", "Xbox", "Nuance", "Activision Blizzard",
    "Skype",
  ],
  "Amazon": [
    "AWS", "Amazon Web Services", "Twitch", "Whole Foods",
    "Audible", "Zappos", "Ring", "MGM",
  ],
  "Apple": [
    "Beats", "Shazam",
  ],
  "Salesforce": [
    "Slack", "MuleSoft", "Tableau", "Heroku",
  ],
  "SAP": [
    "Qualtrics", "Concur", "Ariba",
  ],
}

// Build a reverse lookup: subsidiary name (lowercased) → parent name
const REVERSE: Map<string, string> = new Map()
for (const [parent, subs] of Object.entries(KNOWN_SUBSIDIARIES)) {
  for (const sub of subs) {
    REVERSE.set(sub.toLowerCase(), parent)
  }
}

export function knownParentOf(companyName: string): string | null {
  return REVERSE.get(companyName.toLowerCase()) ?? null
}
