/**
 * City → country inference table.
 *
 * Used to fill in the country when a contact record has a city but no country.
 * Cities are included only when they are practically unambiguous in a
 * French-rooted professional network (Paris → France, not Paris TX; London →
 * United Kingdom, not London Ontario; etc.).
 *
 * "Paris, Texas" already carries a region token so parse_location() never
 * reaches this table for it — the comma branch handles it directly.
 */
export const CITY_COUNTRY: Record<string, string> = {
  // ── France ────────────────────────────────────────────────────────────────
  Paris: "France", Lyon: "France", Marseille: "France",
  Toulouse: "France", Bordeaux: "France", Nice: "France",
  Nantes: "France", Strasbourg: "France", Lille: "France",
  Rennes: "France", Grenoble: "France", Montpellier: "France",
  "Saint-Étienne": "France", "Saint-Etienne": "France",
  Toulon: "France", "Le Havre": "France", Reims: "France",
  Dijon: "France", Angers: "France",
  "Nîmes": "France", Nimes: "France",
  "Aix-en-Provence": "France", "Aix en Provence": "France",
  Brest: "France", Limoges: "France", Caen: "France",
  Amiens: "France", Perpignan: "France", "Clermont-Ferrand": "France",
  Nancy: "France", Metz: "France", Pau: "France",
  Avignon: "France",
  "Besançon": "France", Besancon: "France",
  "Orléans": "France", Orleans: "France", Poitiers: "France",
  Mulhouse: "France", Rouen: "France", Dunkerque: "France", Dunkirk: "France",
  Versailles: "France", Montrouge: "France",
  "Boulogne-Billancourt": "France", Argenteuil: "France",
  Montreuil: "France", Roubaix: "France", Tourcoing: "France",
  Nanterre: "France", "Saint-Denis": "France", Courbevoie: "France",
  Levallois: "France", Puteaux: "France",
  "Neuilly-sur-Seine": "France", Neuilly: "France",
  Vannes: "France", Lorient: "France", Quimper: "France",
  Annecy: "France", "Chambéry": "France", Valence: "France",
  Bayonne: "France", "La Rochelle": "France", Biarritz: "France",
  Colmar: "France", Valenciennes: "France", Lens: "France", Douai: "France",
  Chartres: "France", "Évry": "France", Evry: "France",
  Pontoise: "France", Cergy: "France",
  Agen: "France", Montauban: "France", Tarbes: "France",
  Troyes: "France", Niort: "France",
  "Pointe-à-Pitre": "France", "Fort-de-France": "France",

  // ── Belgium ───────────────────────────────────────────────────────────────
  Brussels: "Belgium", Bruxelles: "Belgium",
  Antwerp: "Belgium", Anvers: "Belgium",
  Ghent: "Belgium", Gent: "Belgium", Bruges: "Belgium",
  "Liège": "Belgium", Liege: "Belgium", Namur: "Belgium",

  // ── Switzerland ───────────────────────────────────────────────────────────
  Zurich: "Switzerland", "Zürich": "Switzerland",
  Geneva: "Switzerland", "Genève": "Switzerland", Geneve: "Switzerland",
  Basel: "Switzerland", "Bâle": "Switzerland",
  Lausanne: "Switzerland", Bern: "Switzerland", Berne: "Switzerland",
  Lugano: "Switzerland", Lucerne: "Switzerland", Luzern: "Switzerland",

  // ── Luxembourg ────────────────────────────────────────────────────────────
  Luxembourg: "Luxembourg", "Luxembourg City": "Luxembourg",

  // ── Germany ───────────────────────────────────────────────────────────────
  Berlin: "Germany", Munich: "Germany", "München": "Germany",
  Hamburg: "Germany", Frankfurt: "Germany", Cologne: "Germany",
  "Köln": "Germany", Stuttgart: "Germany", "Düsseldorf": "Germany",
  Dusseldorf: "Germany", Dortmund: "Germany", Essen: "Germany",
  Leipzig: "Germany", Bremen: "Germany", Dresden: "Germany",
  Hanover: "Germany", Hannover: "Germany", Nuremberg: "Germany",
  "Nürnberg": "Germany", Duisburg: "Germany", Bonn: "Germany",
  Mannheim: "Germany", Karlsruhe: "Germany", Augsburg: "Germany",
  Wiesbaden: "Germany", Freiburg: "Germany", Mainz: "Germany",
  Kiel: "Germany", "Saarbrücken": "Germany",

  // ── United Kingdom ────────────────────────────────────────────────────────
  London: "United Kingdom", Manchester: "United Kingdom",
  Birmingham: "United Kingdom", Glasgow: "United Kingdom",
  Liverpool: "United Kingdom", Edinburgh: "United Kingdom",
  Leeds: "United Kingdom", Sheffield: "United Kingdom",
  Bristol: "United Kingdom", Newcastle: "United Kingdom",
  Leicester: "United Kingdom", Coventry: "United Kingdom",
  Nottingham: "United Kingdom", Cardiff: "United Kingdom",
  Belfast: "United Kingdom", Oxford: "United Kingdom",
  Cambridge: "United Kingdom", Brighton: "United Kingdom",
  Southampton: "United Kingdom", Aberdeen: "United Kingdom",
  Exeter: "United Kingdom",

  // ── Netherlands ───────────────────────────────────────────────────────────
  Amsterdam: "Netherlands", Rotterdam: "Netherlands",
  "The Hague": "Netherlands", Utrecht: "Netherlands",
  Eindhoven: "Netherlands",

  // ── Spain ─────────────────────────────────────────────────────────────────
  Madrid: "Spain", Barcelona: "Spain", Valencia: "Spain",
  Seville: "Spain", Sevilla: "Spain", Bilbao: "Spain",
  "Málaga": "Spain", Malaga: "Spain", Zaragoza: "Spain",

  // ── Italy ─────────────────────────────────────────────────────────────────
  Rome: "Italy", Roma: "Italy", Milan: "Italy", Milano: "Italy",
  Naples: "Italy", Napoli: "Italy", Turin: "Italy", Torino: "Italy",
  Palermo: "Italy", Genoa: "Italy", Genova: "Italy",
  Bologna: "Italy", Florence: "Italy", Firenze: "Italy",
  Venice: "Italy", Venezia: "Italy", Verona: "Italy", Bari: "Italy",

  // ── Portugal ──────────────────────────────────────────────────────────────
  Lisbon: "Portugal", Lisboa: "Portugal", Porto: "Portugal",

  // ── Austria ───────────────────────────────────────────────────────────────
  Vienna: "Austria", Wien: "Austria", Graz: "Austria",
  Salzburg: "Austria", Linz: "Austria", Innsbruck: "Austria",

  // ── Scandinavia ───────────────────────────────────────────────────────────
  Copenhagen: "Denmark", "København": "Denmark",
  Stockholm: "Sweden", Gothenburg: "Sweden", "Göteborg": "Sweden",
  "Malmö": "Sweden", Malmo: "Sweden",
  Oslo: "Norway", Bergen: "Norway", Stavanger: "Norway",
  Helsinki: "Finland", Tampere: "Finland",
  Reykjavik: "Iceland",

  // ── Eastern Europe ────────────────────────────────────────────────────────
  Warsaw: "Poland", Varsovie: "Poland",
  "Kraków": "Poland", Krakow: "Poland",
  "Wrocław": "Poland", Wroclaw: "Poland",
  Prague: "Czech Republic", Praha: "Czech Republic",
  Budapest: "Hungary",
  Bucharest: "Romania", "București": "Romania",
  Sofia: "Bulgaria", Zagreb: "Croatia",
  Bratislava: "Slovakia", Ljubljana: "Slovenia",
  Tallinn: "Estonia", Riga: "Latvia", Vilnius: "Lithuania",
  Kyiv: "Ukraine", Kiev: "Ukraine",

  // ── Middle East ───────────────────────────────────────────────────────────
  Dubai: "United Arab Emirates", "Abu Dhabi": "United Arab Emirates",
  Doha: "Qatar",
  Riyadh: "Saudi Arabia", Jeddah: "Saudi Arabia",
  "Tel Aviv": "Israel", Jerusalem: "Israel", Haifa: "Israel",
  Beirut: "Lebanon", Amman: "Jordan",
  "Kuwait City": "Kuwait", Manama: "Bahrain", Muscat: "Oman",

  // ── Africa ────────────────────────────────────────────────────────────────
  Cairo: "Egypt", "Le Caire": "Egypt", Alexandria: "Egypt",
  Casablanca: "Morocco", Rabat: "Morocco", Marrakech: "Morocco",
  "Fès": "Morocco", Fez: "Morocco",
  Algiers: "Algeria", Alger: "Algeria", Oran: "Algeria",
  Tunis: "Tunisia", Dakar: "Senegal", Abidjan: "Ivory Coast",
  Accra: "Ghana", Lagos: "Nigeria", Nairobi: "Kenya",
  "Addis Ababa": "Ethiopia",
  Johannesburg: "South Africa", "Cape Town": "South Africa",
  Durban: "South Africa", Pretoria: "South Africa",

  // ── Asia ──────────────────────────────────────────────────────────────────
  Tokyo: "Japan", Osaka: "Japan", Kyoto: "Japan", Yokohama: "Japan",
  Beijing: "China", Shanghai: "China", Shenzhen: "China",
  Guangzhou: "China", Chengdu: "China", Hangzhou: "China",
  "Hong Kong": "Hong Kong",
  Seoul: "South Korea", Busan: "South Korea",
  Singapore: "Singapore",
  Bangkok: "Thailand", "Kuala Lumpur": "Malaysia",
  Jakarta: "Indonesia", Manila: "Philippines", Taipei: "Taiwan",
  Mumbai: "India", Delhi: "India", "New Delhi": "India",
  Bangalore: "India", Bengaluru: "India",
  Hyderabad: "India", Chennai: "India", Pune: "India", Kolkata: "India",
  Karachi: "Pakistan", Lahore: "Pakistan",
  Dhaka: "Bangladesh", Colombo: "Sri Lanka",
  Hanoi: "Vietnam", "Ho Chi Minh City": "Vietnam",

  // ── Americas — United States ───────────────────────────────────────────────
  "New York": "United States", "New York City": "United States",
  "Los Angeles": "United States", Chicago: "United States",
  Houston: "United States", Phoenix: "United States",
  Philadelphia: "United States",
  "San Diego": "United States", Dallas: "United States",
  "San Francisco": "United States", Austin: "United States",
  Charlotte: "United States", "San Jose": "United States",
  Seattle: "United States", Denver: "United States", Boston: "United States",
  Nashville: "United States", Portland: "United States",
  "Las Vegas": "United States", Atlanta: "United States",
  Miami: "United States", Minneapolis: "United States",
  Pittsburgh: "United States", Baltimore: "United States",
  Detroit: "United States",
  "Palo Alto": "United States", "Menlo Park": "United States",
  "Mountain View": "United States", "San Mateo": "United States",
  "Redwood City": "United States",
  "New Orleans": "United States", Orlando: "United States",
  Tampa: "United States", Sacramento: "United States",
  "Washington DC": "United States",
  "San Antonio": "United States", Columbus: "United States",

  // ── Americas — Canada ─────────────────────────────────────────────────────
  Toronto: "Canada", Montreal: "Canada", "Montréal": "Canada",
  Vancouver: "Canada", Calgary: "Canada", Ottawa: "Canada",
  Edmonton: "Canada", Winnipeg: "Canada",

  // ── Americas — Latin America ──────────────────────────────────────────────
  "São Paulo": "Brazil", "Sao Paulo": "Brazil",
  "Rio de Janeiro": "Brazil", "Brasília": "Brazil", Brasilia: "Brazil",
  "Buenos Aires": "Argentina",
  Lima: "Peru",
  "Bogotá": "Brazil", Bogota: "Colombia",
  Santiago: "Chile",
  "Mexico City": "Mexico", "Ciudad de México": "Mexico",
  Guadalajara: "Mexico", Monterrey: "Mexico",

  // ── Australia / NZ ────────────────────────────────────────────────────────
  Sydney: "Australia", Melbourne: "Australia", Brisbane: "Australia",
  Perth: "Australia", Adelaide: "Australia", Canberra: "Australia",
  Auckland: "New Zealand", Wellington: "New Zealand",

  // ── Russia / Turkey / Central Asia ────────────────────────────────────────
  Moscow: "Russia", Moscou: "Russia",
  "Saint Petersburg": "Russia", "St. Petersburg": "Russia",
  Istanbul: "Turkey", Ankara: "Turkey",
  Almaty: "Kazakhstan",
}

/** Lowercase → canonical entry lookup cache (built lazily) */
let _lowerCache: Map<string, string> | null = null
function lowerCache(): Map<string, string> {
  if (!_lowerCache) {
    _lowerCache = new Map(
      Object.entries(CITY_COUNTRY).map(([city, country]) => [city.toLowerCase(), country])
    )
  }
  return _lowerCache
}

/**
 * Given a city string, return the most likely country.
 * Returns null if the city is unknown or genuinely ambiguous.
 * Matching is case-insensitive; the original `city` value is preserved.
 */
export function inferCountry(city: string | null | undefined): string | null {
  if (!city?.trim()) return null
  return lowerCache().get(city.trim().toLowerCase()) ?? null
}
