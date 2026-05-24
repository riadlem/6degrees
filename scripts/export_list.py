#!/usr/bin/env python3
"""
Export a 6Degrees list to CSV + photos with optional LinkedIn enrichment.

Usage:
    # Full export (API fetch + LinkedIn enrichment):
    python scripts/export_list.py <listId>

    # API only (fast, no LinkedIn login needed):
    python scripts/export_list.py <listId> --no-linkedin

    # Re-run LinkedIn enrichment on existing CSV (resumable):
    python scripts/export_list.py <listId> --linkedin-only

    # Quick test on first 10 contacts:
    python scripts/export_list.py <listId> --limit 10

No SIXDEGREES_COOKIE needed.  The script reuses a persistent browser profile
(output/.li_profile/) so authentication is shared across 6Degrees and LinkedIn.
On first run a browser window opens — log in to each site as prompted, then
press Enter.  Subsequent runs reuse the saved session with no manual step.

Output:
    output/<listId>/contacts.csv
    output/<listId>/photos/NNN_FirstLast.jpg

CSV columns: name, city, country, shared_contacts, title, company, linkedin_url, photo_filename, enriched_at

Data coverage note (662-contact list measured):
  - profileUrl (LinkedIn URL): 662/662 ← free from API
  - photoUrl (base64):          62/662 ← decoded in phase 1
  - city / country:              0/662 ← LinkedIn only (phase 2)
  - shared_contacts:             ~1/662 ← LinkedIn only (phase 2)
"""

import argparse
import asyncio
import base64
import csv
import datetime
import random
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright, Page

# ── Constants ────────────────────────────────────────────────────────────────
BASE_URL = "https://6degrees.aequus.money"
CSV_FIELDS = ["name", "city", "country", "shared_contacts", "title", "company", "linkedin_url", "photo_filename", "enriched_at"]

# French (and a few other) country names → English. LinkedIn's UI is localised,
# so the country segment often comes back in French.
COUNTRY_MAP = {
    "Espagne": "Spain", "Suisse": "Switzerland", "Italie": "Italy",
    "France": "France", "Royaume-Uni": "United Kingdom", "Irlande": "Ireland",
    "Allemagne": "Germany", "États-Unis": "United States", "Etats-Unis": "United States",
    "Pays-Bas": "Netherlands", "Belgique": "Belgium", "Portugal": "Portugal",
    "Autriche": "Austria", "Suède": "Sweden", "Norvège": "Norway",
    "Danemark": "Denmark", "Finlande": "Finland", "Pologne": "Poland",
    "Argentine": "Argentina", "Brésil": "Brazil", "Mexique": "Mexico",
    "Canada": "Canada", "Australie": "Australia", "Inde": "India",
    "Chine": "China", "Japon": "Japan", "Singapour": "Singapore",
    "Israël": "Israel", "Émirats arabes unis": "United Arab Emirates",
    "Maroc": "Morocco", "Tunisie": "Tunisia", "Algérie": "Algeria",
    "Afrique du Sud": "South Africa", "Turquie": "Turkey", "Grèce": "Greece",
    "Luxembourg": "Luxembourg", "Malte": "Malta", "Chypre": "Cyprus",
    "Liban": "Lebanon", "Egypte": "Egypt", "Russie": "Russia", "Ukraine": "Ukraine",
    "République tchèque": "Czech Republic", "Hongrie": "Hungary",
    "Roumanie": "Romania", "Bulgarie": "Bulgaria",
    # English passthroughs so the country-only check below also recognises them
    "United States": "United States", "United Kingdom": "United Kingdom",
    "Germany": "Germany", "Spain": "Spain", "Italy": "Italy", "Ireland": "Ireland",
    "Netherlands": "Netherlands", "Belgium": "Belgium", "Switzerland": "Switzerland",
    "Canada": "Canada", "Australia": "Australia", "Singapore": "Singapore",
    "United Arab Emirates": "United Arab Emirates",
}

# ── City → country inference ─────────────────────────────────────────────────
# Applies when parse_location() extracts a city with no country component.
# Cities are included only when practically unambiguous in a French-rooted
# professional network.  "Paris, Texas" has a comma so it is already handled
# by the multi-part branch; bare "Paris" → France.
CITY_COUNTRY: dict[str, str] = {
    # France
    "Paris": "France", "Lyon": "France", "Marseille": "France",
    "Toulouse": "France", "Bordeaux": "France", "Nice": "France",
    "Nantes": "France", "Strasbourg": "France", "Lille": "France",
    "Rennes": "France", "Grenoble": "France", "Montpellier": "France",
    "Saint-Étienne": "France", "Saint-Etienne": "France",
    "Toulon": "France", "Le Havre": "France", "Reims": "France",
    "Dijon": "France", "Angers": "France", "Nîmes": "France", "Nimes": "France",
    "Aix-en-Provence": "France", "Aix en Provence": "France",
    "Brest": "France", "Limoges": "France", "Caen": "France",
    "Amiens": "France", "Perpignan": "France", "Clermont-Ferrand": "France",
    "Nancy": "France", "Metz": "France", "Pau": "France",
    "Avignon": "France", "Besançon": "France", "Besancon": "France",
    "Orléans": "France", "Orleans": "France", "Poitiers": "France",
    "Mulhouse": "France", "Rouen": "France", "Dunkerque": "France", "Dunkirk": "France",
    "Versailles": "France", "Montrouge": "France", "Créteil": "France",
    "Boulogne-Billancourt": "France", "Argenteuil": "France",
    "Montreuil": "France", "Roubaix": "France", "Tourcoing": "France",
    "Nanterre": "France", "Saint-Denis": "France", "Courbevoie": "France",
    "Levallois": "France", "Puteaux": "France",
    "Neuilly-sur-Seine": "France", "Neuilly": "France",
    "Vannes": "France", "Lorient": "France", "Quimper": "France",
    "Annecy": "France", "Chambéry": "France", "Valence": "France",
    "Bayonne": "France", "La Rochelle": "France", "Biarritz": "France",
    "Colmar": "France", "Valenciennes": "France", "Lens": "France",
    "Chartres": "France", "Évry": "France", "Evry": "France",
    "Cergy": "France", "Agen": "France", "Montauban": "France",
    "Troyes": "France", "Niort": "France", "Tarbes": "France",
    # Belgium
    "Brussels": "Belgium", "Bruxelles": "Belgium", "Brüssel": "Belgium",
    "Antwerp": "Belgium", "Anvers": "Belgium",
    "Ghent": "Belgium", "Gent": "Belgium", "Bruges": "Belgium",
    "Liège": "Belgium", "Liege": "Belgium", "Namur": "Belgium",
    # Switzerland
    "Zurich": "Switzerland", "Zürich": "Switzerland",
    "Geneva": "Switzerland", "Genève": "Switzerland", "Geneve": "Switzerland",
    "Basel": "Switzerland", "Bâle": "Switzerland",
    "Lausanne": "Switzerland", "Bern": "Switzerland", "Berne": "Switzerland",
    "Lugano": "Switzerland", "Lucerne": "Switzerland", "Luzern": "Switzerland",
    # Luxembourg
    "Luxembourg": "Luxembourg", "Luxembourg City": "Luxembourg",
    # Germany
    "Berlin": "Germany", "Munich": "Germany", "München": "Germany",
    "Hamburg": "Germany", "Frankfurt": "Germany", "Cologne": "Germany",
    "Köln": "Germany", "Stuttgart": "Germany", "Düsseldorf": "Germany",
    "Dusseldorf": "Germany", "Dortmund": "Germany", "Essen": "Germany",
    "Leipzig": "Germany", "Bremen": "Germany", "Dresden": "Germany",
    "Hanover": "Germany", "Hannover": "Germany", "Nuremberg": "Germany",
    "Nürnberg": "Germany", "Duisburg": "Germany", "Bonn": "Germany",
    "Mannheim": "Germany", "Karlsruhe": "Germany", "Augsburg": "Germany",
    "Wiesbaden": "Germany", "Freiburg": "Germany", "Mainz": "Germany",
    # United Kingdom
    "London": "United Kingdom", "Manchester": "United Kingdom",
    "Birmingham": "United Kingdom", "Glasgow": "United Kingdom",
    "Liverpool": "United Kingdom", "Edinburgh": "United Kingdom",
    "Leeds": "United Kingdom", "Sheffield": "United Kingdom",
    "Bristol": "United Kingdom", "Newcastle": "United Kingdom",
    "Leicester": "United Kingdom", "Coventry": "United Kingdom",
    "Nottingham": "United Kingdom", "Cardiff": "United Kingdom",
    "Belfast": "United Kingdom", "Oxford": "United Kingdom",
    "Cambridge": "United Kingdom", "Brighton": "United Kingdom",
    "Southampton": "United Kingdom", "Aberdeen": "United Kingdom",
    # Netherlands
    "Amsterdam": "Netherlands", "Rotterdam": "Netherlands",
    "The Hague": "Netherlands", "Utrecht": "Netherlands",
    "Eindhoven": "Netherlands",
    # Spain
    "Madrid": "Spain", "Barcelona": "Spain", "Valencia": "Spain",
    "Seville": "Spain", "Sevilla": "Spain", "Bilbao": "Spain",
    "Málaga": "Spain", "Malaga": "Spain", "Zaragoza": "Spain",
    # Italy
    "Rome": "Italy", "Roma": "Italy", "Milan": "Italy", "Milano": "Italy",
    "Naples": "Italy", "Napoli": "Italy", "Turin": "Italy", "Torino": "Italy",
    "Palermo": "Italy", "Genoa": "Italy", "Genova": "Italy",
    "Bologna": "Italy", "Florence": "Italy", "Firenze": "Italy",
    "Venice": "Italy", "Venezia": "Italy",
    # Portugal
    "Lisbon": "Portugal", "Lisboa": "Portugal", "Porto": "Portugal",
    # Austria
    "Vienna": "Austria", "Wien": "Austria", "Graz": "Austria",
    "Salzburg": "Austria", "Linz": "Austria",
    # Scandinavia
    "Copenhagen": "Denmark", "København": "Denmark",
    "Stockholm": "Sweden", "Gothenburg": "Sweden", "Göteborg": "Sweden",
    "Oslo": "Norway", "Bergen": "Norway",
    "Helsinki": "Finland",
    "Reykjavik": "Iceland",
    # Eastern Europe
    "Warsaw": "Poland", "Varsovie": "Poland",
    "Kraków": "Poland", "Krakow": "Poland",
    "Wrocław": "Poland", "Wroclaw": "Poland",
    "Prague": "Czech Republic", "Praha": "Czech Republic",
    "Budapest": "Hungary",
    "Bucharest": "Romania", "București": "Romania",
    "Sofia": "Bulgaria", "Zagreb": "Croatia", "Bratislava": "Slovakia",
    "Tallinn": "Estonia", "Riga": "Latvia", "Vilnius": "Lithuania",
    "Kyiv": "Ukraine", "Kiev": "Ukraine",
    # Middle East
    "Dubai": "United Arab Emirates", "Abu Dhabi": "United Arab Emirates",
    "Doha": "Qatar", "Riyadh": "Saudi Arabia", "Jeddah": "Saudi Arabia",
    "Tel Aviv": "Israel", "Jerusalem": "Israel",
    "Beirut": "Lebanon", "Amman": "Jordan",
    "Kuwait City": "Kuwait", "Manama": "Bahrain", "Muscat": "Oman",
    # Africa
    "Cairo": "Egypt", "Le Caire": "Egypt", "Alexandria": "Egypt",
    "Casablanca": "Morocco", "Rabat": "Morocco", "Marrakech": "Morocco",
    "Algiers": "Algeria", "Alger": "Algeria", "Oran": "Algeria",
    "Tunis": "Tunisia", "Dakar": "Senegal", "Abidjan": "Ivory Coast",
    "Accra": "Ghana", "Lagos": "Nigeria", "Nairobi": "Kenya",
    "Johannesburg": "South Africa", "Cape Town": "South Africa",
    # Asia
    "Tokyo": "Japan", "Osaka": "Japan", "Kyoto": "Japan",
    "Beijing": "China", "Shanghai": "China", "Shenzhen": "China",
    "Guangzhou": "China", "Chengdu": "China", "Hangzhou": "China",
    "Hong Kong": "Hong Kong",
    "Seoul": "South Korea", "Busan": "South Korea",
    "Singapore": "Singapore",
    "Bangkok": "Thailand", "Kuala Lumpur": "Malaysia",
    "Jakarta": "Indonesia", "Manila": "Philippines", "Taipei": "Taiwan",
    "Mumbai": "India", "Delhi": "India", "New Delhi": "India",
    "Bangalore": "India", "Bengaluru": "India",
    "Hyderabad": "India", "Chennai": "India", "Pune": "India",
    "Karachi": "Pakistan", "Dhaka": "Bangladesh",
    # Americas — United States
    "New York": "United States", "New York City": "United States",
    "Los Angeles": "United States", "Chicago": "United States",
    "Houston": "United States", "Phoenix": "United States",
    "Philadelphia": "United States", "San Diego": "United States",
    "Dallas": "United States", "San Francisco": "United States",
    "Austin": "United States", "Charlotte": "United States",
    "San Jose": "United States", "Seattle": "United States",
    "Denver": "United States", "Boston": "United States",
    "Nashville": "United States", "Portland": "United States",
    "Las Vegas": "United States", "Atlanta": "United States",
    "Miami": "United States", "Minneapolis": "United States",
    "Pittsburgh": "United States", "Baltimore": "United States",
    "Detroit": "United States", "Palo Alto": "United States",
    "Menlo Park": "United States", "Mountain View": "United States",
    "San Mateo": "United States", "New Orleans": "United States",
    "Orlando": "United States", "Tampa": "United States",
    "Sacramento": "United States",
    # Americas — Canada
    "Toronto": "Canada", "Montreal": "Canada", "Montréal": "Canada",
    "Vancouver": "Canada", "Calgary": "Canada", "Ottawa": "Canada",
    "Edmonton": "Canada", "Winnipeg": "Canada",
    # Americas — Latin America
    "São Paulo": "Brazil", "Sao Paulo": "Brazil",
    "Rio de Janeiro": "Brazil", "Brasília": "Brazil",
    "Buenos Aires": "Argentina",
    "Lima": "Peru", "Bogotá": "Colombia", "Bogota": "Colombia",
    "Santiago": "Chile", "Mexico City": "Mexico",
    "Guadalajara": "Mexico", "Monterrey": "Mexico",
    # Australia / NZ
    "Sydney": "Australia", "Melbourne": "Australia", "Brisbane": "Australia",
    "Perth": "Australia", "Adelaide": "Australia",
    "Auckland": "New Zealand", "Wellington": "New Zealand",
    # Russia / Turkey
    "Moscow": "Russia", "Moscou": "Russia",
    "Saint Petersburg": "Russia", "St. Petersburg": "Russia",
    "Istanbul": "Turkey", "Ankara": "Turkey",
}

# Build a lowercased lookup for case-insensitive matching
_CITY_COUNTRY_LOWER: dict[str, str] = {k.lower(): v for k, v in CITY_COUNTRY.items()}


def infer_country(city: str) -> str:
    """Return the most likely country for a well-known city, or '' if unknown."""
    return _CITY_COUNTRY_LOWER.get(city.strip().lower(), "")


# Delay between LinkedIn page visits (seconds) — be respectful, avoid bans
LI_DELAY_MIN = 3.5
LI_DELAY_MAX = 6.0


# ── CLI ───────────────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export a 6Degrees list to CSV + photos")
    p.add_argument("list_id", help="6Degrees list ID, e.g. cmpiwh0to0002h2gv60vzjks6")
    p.add_argument("--linkedin-only", action="store_true",
                   help="Skip API fetch; load existing CSV and run LinkedIn enrichment only")
    p.add_argument("--no-linkedin", action="store_true",
                   help="API fetch only — skip LinkedIn enrichment pass")
    p.add_argument("--headless", action="store_true",
                   help="Run Playwright in headless mode (risky with LinkedIn)")
    p.add_argument("--limit", type=int, default=0,
                   help="Process only first N contacts (for testing)")
    p.add_argument("--reset-empty", action="store_true",
                   help="Clear enriched_at for rows with no data (city/country/photo all blank),"
                        " then exit. Use after a run with widespread page crashes so --linkedin-only"
                        " picks them up on the next run.")
    p.add_argument("--reset-photo", metavar="NAME", nargs="+",
                   help="Clear enriched_at AND photo_filename for the named contact(s), then exit."
                        " Partial, case-insensitive name match. Re-run with --linkedin-only to"
                        " re-scrape only those rows.  Example: --reset-photo 'Riccardo' 'Marc de Buffevent'")
    p.add_argument("--reset-missing", metavar="FIELD", nargs="+",
                   help="Clear enriched_at for every row where ANY of the given CSV fields is blank,"
                        " then exit. Re-run with --linkedin-only to re-scrape those rows."
                        " Valid fields: city country shared_contacts photo_filename."
                        " Example: --reset-missing shared_contacts")
    return p.parse_args()


# ── Login helpers ─────────────────────────────────────────────────────────────
async def ensure_sixdegrees_login(page: Page, headless: bool) -> None:
    """
    Verify the browser is logged in to 6Degrees.
    Uses a lightweight API probe — no page navigation needed if already logged in.
    Prompts for interactive login if the session cookie is missing.
    """
    resp = await page.request.get(f"{BASE_URL}/api/contacts?limit=1")
    if resp.ok:
        return  # session cookie present and valid

    if headless:
        print(
            "  ✗ Not logged in to 6Degrees and running headless — cannot prompt.\n"
            "  Run once without --headless to save the session, then use --headless.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"\n  ⚠️  Not logged in to 6Degrees.")
    print(f"  Opening {BASE_URL} — please log in, then press Enter here...")
    await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30_000)
    input("  [press Enter once logged in to 6Degrees] ")

    # Re-verify
    resp = await page.request.get(f"{BASE_URL}/api/contacts?limit=1")
    if not resp.ok:
        print("  ✗ Still not logged in (API returned HTTP {resp.status}) — exiting.", file=sys.stderr)
        sys.exit(1)

    print("  ✓ 6Degrees session confirmed")


async def ensure_linkedin_login(page: Page, headless: bool) -> None:
    """
    Verify the browser is logged in to LinkedIn.
    Navigates to /feed and checks the resulting URL for auth redirects.
    Prompts for interactive login if needed.
    """
    await page.goto("https://www.linkedin.com/feed", wait_until="domcontentloaded", timeout=30_000)
    await asyncio.sleep(1.5)

    if "login" not in page.url and "authwall" not in page.url and "checkpoint" not in page.url:
        print("  ✓ LinkedIn session confirmed")
        return  # already logged in

    if headless:
        print(
            "  ⚠️  Not logged in to LinkedIn and running headless — cannot prompt.\n"
            "  Run once without --headless to save the LinkedIn session, then use --headless.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("\n  ⚠️  Not logged in to LinkedIn!")
    print("  Please log in in the browser window, then press Enter here...")
    input("  [press Enter once logged in to LinkedIn] ")
    print("  ✓ LinkedIn session saved")


# ── Helpers ───────────────────────────────────────────────────────────────────
def safe_filename(name: str) -> str:
    """Sanitise a contact name for use in a filename."""
    s = re.sub(r"[^\w\s-]", "", name, flags=re.UNICODE)
    s = re.sub(r"\s+", "_", s.strip())
    return s[:60] or "unknown"


def parse_location(raw: str) -> tuple[str, str]:
    """
    Parse a LinkedIn/6Degrees location string → (city, country).

    Examples handled:
      "Paris, Île-de-France, France"        → ("Paris", "France")
      "Paris et périphérie"                 → ("Paris", "")   ← country unknown
      "Genève et périphérie"                → ("Genève", "")  ← NOT France!
      "Greater Paris Metropolitan Region"   → ("Paris", "")
      "London, England, United Kingdom"     → ("London", "United Kingdom")
      "New York, New York, United States"   → ("New York", "United States")
      "Dubai, United Arab Emirates"         → ("Dubai", "United Arab Emirates")

    Note: "X et périphérie" is French LinkedIn UI for "X Area" and appears for
    cities in any country (Genève, Liverpool, Munich, Vancouver…). We extract
    the city but leave country blank rather than defaulting to France.
    """
    raw = (raw or "").strip()
    if not raw:
        return ("", "")

    # "X et périphérie" / "X et environs" — French "X Area"; city is known, country is not,
    # but we can often infer it from the city name.
    m = re.match(r"^(.+?)\s+et\s+(?:périphérie|environs|alentours)$", raw, re.IGNORECASE)
    if m:
        city = m.group(1).strip()
        return (city, infer_country(city))

    # "Greater X Area / Metropolitan Region"
    m = re.match(r"^Greater\s+(.+?)\s+(?:Area|Metropolitan\s+Region|Region)$", raw, re.IGNORECASE)
    if m:
        city = m.group(1).strip()
        return (city, infer_country(city))

    parts = [p.strip() for p in raw.split(",")]
    if len(parts) >= 2:
        # "City, [Region,] Country" — normalise country via map
        return (parts[0], COUNTRY_MAP.get(parts[-1], parts[-1]))

    # Single token: could be a bare country name or a bare city name.
    tok = parts[0]
    if tok in COUNTRY_MAP:
        return ("", COUNTRY_MAP[tok])
    # Bare city with no region/country qualifier → infer country from city table.
    return (tok, infer_country(tok))


def decode_base64_photo(data_uri: str, out_path: Path) -> str:
    """
    Decode a base64 data URI and write to out_path (with corrected extension).
    Returns the final filename, or "" on failure.
    """
    try:
        m = re.match(r"data:image/(\w+);base64,(.*)", data_uri, re.DOTALL)
        if not m:
            return ""
        ext = m.group(1).lower().replace("jpeg", "jpg")
        b64 = m.group(2)
        b64 += "=" * (-len(b64) % 4)  # pad to a multiple of 4
        raw = base64.b64decode(b64)
        final = out_path.with_suffix(f".{ext}")
        if not final.exists():
            final.write_bytes(raw)
        return final.name
    except Exception as exc:
        print(f"    ⚠️  Base64 decode failed: {exc}", file=sys.stderr)
        return ""


def is_row_complete(row: dict) -> bool:
    """
    A row is enrichment-complete when it has been *visited* by Phase 2,
    regardless of what was found.  We use an explicit enriched_at timestamp
    rather than checking for city/country presence — profiles that show only
    a country, or no location at all, would otherwise loop forever.
    """
    return bool(row.get("enriched_at"))


# ── Phase 1: API fetch ────────────────────────────────────────────────────────
async def phase1(page: Page, list_id: str, photo_dir: Path, limit: int) -> list[dict]:
    """
    Fetch the list from 6Degrees API via the browser's session cookies.
    Uses page.request.get() — runs outside the page JS context, inherits the
    browser's cookie jar, no separate SIXDEGREES_COOKIE needed.
    """
    print(f"\n{'='*60}")
    print(f"Phase 1 — 6Degrees API fetch")
    print(f"{'='*60}")

    url = f"{BASE_URL}/api/lists/{list_id}"
    print(f"  GET {url}")

    resp = await page.request.get(url)
    if resp.status == 401:
        print("  ✗ 401 Unauthorized — run ensure_sixdegrees_login first", file=sys.stderr)
        sys.exit(1)
    if resp.status == 404:
        print(f"  ✗ 404 — list {list_id} not found", file=sys.stderr)
        sys.exit(1)
    if not resp.ok:
        print(f"  ✗ HTTP {resp.status} from API", file=sys.stderr)
        sys.exit(1)

    data = await resp.json()

    list_name = data.get("name", list_id)
    members = data.get("members", [])
    if limit:
        members = members[:limit]

    total = len(members)
    pad = len(str(total))
    print(f"  List: '{list_name}' — {total} members")

    rows: list[dict] = []
    photo_count = 0
    photo_url_count = 0

    for i, member in enumerate(members, 1):
        idx = str(i).zfill(pad)
        c = member.get("contact", {})

        first = (c.get("firstName") or "").strip()
        last  = (c.get("lastName")  or "").strip()
        name  = f"{first} {last}".strip() or f"Contact_{idx}"
        fname = safe_filename(name)

        # Location — usually empty from API; try anyway
        location_raw = c.get("location") or ""
        city    = c.get("city")    or ""
        country = c.get("country") or ""
        if location_raw and not (city or country):
            city, country = parse_location(location_raw)

        # Photo
        photo_url = c.get("photoUrl") or ""
        photo_filename = ""

        if photo_url:
            photo_url_count += 1
            stem = photo_dir / f"{idx}_{fname}"

            if photo_url.startswith("data:"):
                photo_filename = decode_base64_photo(photo_url, stem)
                if photo_filename:
                    photo_count += 1

            elif photo_url.startswith("http"):
                # Check if already downloaded from a previous run
                for ext in ("jpg", "jpeg", "png", "webp"):
                    candidate = photo_dir / f"{idx}_{fname}.{ext}"
                    if candidate.exists():
                        photo_filename = candidate.name
                        photo_count += 1
                        break
                else:
                    # Download via page.request — inherits session cookies, no
                    # separate auth header needed even for gated CDN assets.
                    try:
                        dl = await page.request.get(photo_url)
                        if dl.ok:
                            body = await dl.body()
                            if body and len(body) > 1_000:
                                ct = dl.headers.get("content-type", "image/jpeg")
                                ext = "jpg" if "jpeg" in ct or "jpg" in ct else ct.split("/")[-1].split(";")[0]
                                photo_path = photo_dir / f"{idx}_{fname}.{ext}"
                                photo_path.write_bytes(body)
                                photo_filename = photo_path.name
                                photo_count += 1
                    except Exception as exc:
                        print(f"    ⚠️  Photo download failed for {name}: {exc}", file=sys.stderr)

        row = {
            "name":            name,
            "city":            city,
            "country":         country,
            "shared_contacts": str(c.get("commonConnections") or c.get("sharedConnections") or ""),
            "title":           c.get("position") or "",
            "company":         c.get("company")  or "",
            "linkedin_url":    c.get("profileUrl") or "",
            "photo_filename":  photo_filename,
        }
        rows.append(row)

        if i % 100 == 0 or i == total:
            print(f"  [{i:>{pad}}/{total}] processed (photos so far: {photo_count})")

    print(f"\n  ✓ {total} contacts — {photo_url_count} had photoUrl, {photo_count} decoded/downloaded")
    return rows


# ── Phase 2: LinkedIn enrichment ──────────────────────────────────────────────
async def scrape_linkedin_profile(page: Page, profile_url: str, photo_dir: Path, idx: str, fname: str) -> dict:
    """
    Visit a LinkedIn profile and extract: location, mutual connections, profile photo.
    Returns a partial dict with keys matching CSV_FIELDS.
    """
    result: dict = {}

    try:
        await page.goto(profile_url, wait_until="domcontentloaded", timeout=35_000)
        await asyncio.sleep(2.5)  # Let React hydrate

        # ── Location (locale-aware, text-anchored) ───────────────────────────
        # The location line sits directly above the "Contact info" link and
        # right after the headline — stable across locales and markup changes,
        # unlike CSS classes or country-keyword regexes.
        location_raw = ""
        try:
            main_txt = await page.inner_text("main", timeout=5_000)
        except Exception:
            main_txt = ""
        lines = [l.strip() for l in main_txt.split("\n") if l.strip()]

        CONTACT_MARKERS = ("Coordonnées", "Contact info", "Kontaktinfo",
                           "Información de contacto", "Informazioni di contatto")

        def looks_like_location(s: str) -> bool:
            return bool(s) and len(s) <= 80 and s != "·" and "|" not in s and "@" not in s

        # 1) line just above the Contact-info marker (skip bare "·" separators)
        for i, l in enumerate(lines):
            if any(l == m or l.startswith(m) for m in CONTACT_MARKERS):
                j = i - 1
                while j >= 0 and lines[j] == "·":
                    j -= 1
                if j >= 0 and looks_like_location(lines[j]):
                    location_raw = lines[j]
                break

        # 2) fallback: the 2nd "real" line after the name (headline, then location)
        if not location_raw:
            kept = []
            for l in lines[1:14]:
                if re.match(r"^(He|She|They|Il|Elle)/(Him|Her|Them|Lui|Elle)$", l, re.I):
                    continue
                if re.match(r"^·?\s*(1er|2e|3e|1st|2nd|3rd)\b", l):
                    continue
                if l == "·":
                    continue
                kept.append(l)
                if len(kept) >= 2:
                    break
            if len(kept) >= 2 and looks_like_location(kept[1]):
                location_raw = kept[1]

        if location_raw:
            city, country = parse_location(location_raw)
            if city:
                result["city"] = city
            if country:
                result["country"] = country

        # ── Mutual connections ────────────────────────────────────────────────
        try:
            body = main_txt  # already fetched for location above
            # French renders "Kamel, Samir et 35 autres relations en commun" — the
            # total is 35 + the named people shown (1 or 2). Try most-specific first.
            shared = ""
            m = re.search(r"[^\n,]+,\s*[^\n,]+?\s+et\s+(\d+)\s+autres?\s+relations?\s+en\s+commun", body, re.IGNORECASE)
            if m:
                shared = str(int(m.group(1)) + 2)
            if not shared:
                m = re.search(r"[^\n,]+?\s+et\s+(\d+)\s+autres?\s+relations?\s+en\s+commun", body, re.IGNORECASE)
                if m:
                    shared = str(int(m.group(1)) + 1)
            if not shared:
                m = re.search(r"and\s+(\d+)\s+other\s+mutual\s+connections?", body, re.IGNORECASE)
                if m:
                    shared = str(int(m.group(1)) + 1)  # approximate: +named shown
            if not shared:
                m = re.search(
                    r"(\d+)\s+(?:mutual\s+connections?|relations?\s+en\s+commun|"
                    r"gemeinsame\s+Kontakte?|contactos?\s+en\s+com[uú]n|contatti\s+in\s+comune)",
                    body, re.IGNORECASE,
                )
                if m:
                    shared = m.group(1)
            if shared:
                result["shared_contacts"] = shared
        except Exception:
            pass

        # ── Profile photo (top-card headshot only) ───────────────────────────
        # Pick the photo URL in one page evaluation, with three guards:
        #  • scope to <main>      → never the logged-in user's nav "Me" avatar (you)
        #  • require 'profile-displayphoto' and reject 'displaybackgroundimage'
        #                          → never the cover banner
        #  • take the largest srcset variant
        #                          → never the 100px thumbnail
        # The top-card image is the first such <img> in DOM order (the feed /
        # "people you may know" photos come later), and we prefer the dedicated
        # class when LinkedIn renders it.
        photo_url = await page.evaluate(
            """
            () => {
              // Collect all profile-displayphoto images inside <main>,
              // excluding cover banners.
              const imgs = [...document.querySelectorAll('main img')].filter(i => {
                const s = (i.currentSrc || i.src || '') + ' ' + (i.srcset || '');
                return /profile-displayphoto/.test(s) && !/displaybackgroundimage/.test(s);
              });
              if (!imgs.length) return '';

              // The main headshot has srcset variants up to 400-800 px; mutual-
              // connection / "People you may know" thumbnails only go to 50-100 px.
              // Pick the URL whose largest srcset width wins — this reliably
              // selects the top-card headshot over any sidebar thumbnail.
              let bestUrl = '', bestW = 0;
              for (const img of imgs) {
                const ss = img.srcset || '';
                if (ss) {
                  for (const part of ss.split(',')) {
                    const [u, w] = part.trim().split(/\\s+/);
                    const width = parseInt((w || '0').replace(/\\D/g, ''));
                    if (width > bestW) { bestW = width; bestUrl = u; }
                  }
                }
              }
              // Require at least 200 px — anything smaller is a thumbnail, not
              // a headshot.  Return '' so the caller skips the download rather
              // than saving a tiny / wrong photo.
              if (bestW >= 200 && bestUrl) return bestUrl;

              // If srcset is missing (rare), fall back to the dedicated class,
              // then to currentSrc of the first filtered img.
              const tc = document.querySelector('main .pv-top-card-profile-picture__image');
              if (tc) return tc.currentSrc || tc.src || '';
              return imgs[0].currentSrc || imgs[0].src || '';
            }
            """
        )

        if (
            photo_url
            and photo_url.startswith("http")
            and not any(kw in photo_url for kw in
                        ("displaybackgroundimage", "company-logo", "organization", "banner"))
        ):
            try:
                resp = await page.request.get(
                    photo_url, headers={"Referer": "https://www.linkedin.com/"}
                )
                if resp.ok:
                    body = await resp.body()
                    is_jpg = body[:3] == b"\xff\xd8\xff"
                    is_png = body[:8] == b"\x89PNG\r\n\x1a\n"
                    if body and len(body) > 1_000 and (is_jpg or is_png):
                        ext = "png" if is_png else "jpg"
                        photo_filename = f"{idx}_{fname}.{ext}"
                        (photo_dir / photo_filename).write_bytes(body)  # overwrite ok
                        result["photo_filename"] = photo_filename
                    else:
                        print(f"    ⚠️  photo not a valid image ({len(body)}b)", file=sys.stderr)
                else:
                    print(f"    ⚠️  photo HTTP {resp.status}", file=sys.stderr)
            except Exception as dl_exc:
                print(f"    ⚠️  photo download: {dl_exc}", file=sys.stderr)

    except Exception as exc:
        print(f"    ⚠️  Scrape error: {exc}", file=sys.stderr)
        # Return None (not {}) to signal a hard error — caller will not set enriched_at
        # so the row stays eligible for retry on the next run.
        return None

    return result


async def make_page(browser) -> Page:
    """Open a new stealth page from the persistent browser context."""
    page = await browser.new_page()
    await page.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    return page


async def phase2(browser, page: Page, rows: list[dict], photo_dir: Path, csv_path: Path) -> list[dict]:
    """
    LinkedIn enrichment pass — scrape location, mutual connections, and profile
    photo for every row that hasn't been visited yet.

    Accepts the browser context so it can recreate the page after a crash.
    Saves CSV every 10 rows so progress survives an interrupted run.

    scrape_linkedin_profile() returns:
      dict  — page visited (even if nothing found); set enriched_at → done
      None  — hard error (page crash / timeout); don't set enriched_at → retry
    """
    needs = [r for r in rows if not is_row_complete(r) and r.get("linkedin_url")]

    if not needs:
        print("\n✓ All rows already enriched — skipping LinkedIn pass")
        return rows

    total = len(needs)
    pad   = len(str(total))
    print(f"\n{'='*60}")
    print(f"Phase 2 — LinkedIn enrichment ({total}/{len(rows)} rows need it)")
    print(f"{'='*60}")

    for i, row in enumerate(needs, 1):
        url   = row["linkedin_url"]
        name  = row["name"]
        fname = safe_filename(name)
        # Find this row's index in the master list for photo naming
        idx   = str(rows.index(row) + 1).zfill(len(str(len(rows))))

        print(f"  [{i:>{pad}}/{total}] {name}")

        enriched = await scrape_linkedin_profile(page, url, photo_dir, idx, fname)

        if enriched is None:
            # Hard error (page crash, timeout) — the page object may be in a
            # broken state.  Recreate it so the next profile has a clean page.
            # Do NOT set enriched_at — this row stays eligible for retry.
            print(f"           ↩  not marked done — will retry on next run")
            try:
                await page.close()
            except Exception:
                pass
            page = await make_page(browser)
            # Short pause before continuing so LinkedIn doesn't see a burst
            await asyncio.sleep(random.uniform(4, 8))
            # Periodic save so progress to this point is not lost
            save_csv(csv_path, rows)
            continue

        # Merge enriched fields into row (don't overwrite existing values)
        for key, val in enriched.items():
            if val and not row.get(key):
                row[key] = val

        # Mark as visited — this is what makes resumability reliable.
        # Profiles with no location or no photo will never satisfy a content
        # check, so we use an explicit timestamp instead.
        row["enriched_at"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        city    = row.get("city", "")
        country = row.get("country", "")
        shared  = row.get("shared_contacts", "")
        photo   = row.get("photo_filename", "")
        print(f"           city={city or '—'}  country={country or '—'}  shared={shared or '—'}  photo={'✓' if photo else '—'}")

        # Save every 10 rows so a crash or Ctrl-C doesn't lose a whole session
        if i % 10 == 0:
            save_csv(csv_path, rows)

        # Polite delay with jitter — avoid detection
        if i < total:
            delay = LI_DELAY_MIN + random.random() * (LI_DELAY_MAX - LI_DELAY_MIN)
            # Every 50 profiles, take a longer break
            if i % 50 == 0:
                delay += random.uniform(15, 30)
                print(f"  ⏸  Break ({delay:.0f}s)…")
            await asyncio.sleep(delay)

    attempted     = sum(1 for r in rows if r.get("enriched_at"))
    with_location = sum(1 for r in rows if r.get("city") or r.get("country"))
    with_photo    = sum(1 for r in rows if r.get("photo_filename"))
    crashed       = sum(1 for r in rows if not r.get("enriched_at") and r.get("linkedin_url"))
    print(f"\n  ✓ LinkedIn pass done")
    print(f"    visited      : {attempted}/{len(rows)}")
    print(f"    has location : {with_location}")
    print(f"    has photo    : {with_photo}")
    if crashed:
        print(f"    not done yet : {crashed}  ← re-run with --linkedin-only")
    return rows


# ── CSV I/O ───────────────────────────────────────────────────────────────────
def load_csv(csv_path: Path) -> list[dict]:
    if not csv_path.exists():
        return []
    with csv_path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def save_csv(csv_path: Path, rows: list[dict]) -> None:
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def merge_with_existing(new_rows: list[dict], existing: list[dict]) -> list[dict]:
    """Preserve enriched fields from a previous run keyed by linkedin_url."""
    by_url = {r["linkedin_url"]: r for r in existing if r.get("linkedin_url")}
    for row in new_rows:
        prev = by_url.get(row.get("linkedin_url", ""))
        if prev:
            for field in ("city", "country", "shared_contacts", "photo_filename", "enriched_at"):
                if not row.get(field) and prev.get(field):
                    row[field] = prev[field]
    return new_rows


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    args = parse_args()
    list_id = args.list_id

    out_dir      = Path("output") / list_id
    photo_dir    = out_dir / "photos"
    csv_path     = out_dir / "contacts.csv"
    profile_dir  = Path("output") / ".li_profile"   # persistent browser profile (shared)

    out_dir.mkdir(parents=True, exist_ok=True)
    photo_dir.mkdir(exist_ok=True)
    profile_dir.mkdir(exist_ok=True)

    print(f"Output → {out_dir.resolve()}")
    print(f"Profile → {profile_dir.resolve()}")

    existing = load_csv(csv_path)

    # ── --reset-missing: clear enriched_at for rows missing a given field ───────
    if args.reset_missing:
        if not existing:
            print(f"✗ No CSV at {csv_path} — nothing to reset.", file=sys.stderr)
            sys.exit(1)
        valid_fields = {"city", "country", "shared_contacts", "photo_filename"}
        bad = [f for f in args.reset_missing if f not in valid_fields]
        if bad:
            print(f"✗ Unknown field(s): {bad}. Valid: {sorted(valid_fields)}", file=sys.stderr)
            sys.exit(1)
        reset_count = 0
        for row in existing:
            if row.get("enriched_at") and any(not row.get(f) for f in args.reset_missing):
                row["enriched_at"] = ""
                reset_count += 1
        if reset_count == 0:
            print(f"✓ No rows to reset — all contacts already have {args.reset_missing}.")
            return
        save_csv(csv_path, existing)
        kept = sum(1 for r in existing if r.get("enriched_at"))
        print(f"✓ Reset {reset_count}/{len(existing)} rows  ({kept} kept as done)")
        print(f"  Re-run with --linkedin-only to re-scrape the reset rows.")
        return

    # ── --reset-photo: clear enriched_at + photo_filename for named contacts ──
    if args.reset_photo:
        if not existing:
            print(f"✗ No CSV at {csv_path} — nothing to reset.", file=sys.stderr)
            sys.exit(1)
        queries = [q.lower() for q in args.reset_photo]
        reset_count = 0
        for row in existing:
            name_lower = (row.get("name") or "").lower()
            if any(q in name_lower for q in queries):
                row["enriched_at"] = ""
                row["photo_filename"] = ""
                reset_count += 1
                print(f"  ↩  reset  {row.get('name')}")
        if reset_count == 0:
            print(f"✗ No rows matched: {args.reset_photo}", file=sys.stderr)
            sys.exit(1)
        save_csv(csv_path, existing)
        print(f"\n✓ Reset {reset_count} row(s) — re-run with --linkedin-only to re-scrape.")
        return

    # ── --reset-empty: clear enriched_at for rows with no data ───────────────
    # Use this after a run where widespread page crashes left enriched_at set
    # on rows that have no city, country, or photo.  Then re-run with
    # --linkedin-only to process only those rows.
    if args.reset_empty:
        if not existing:
            print(f"✗ No CSV at {csv_path} — nothing to reset.", file=sys.stderr)
            sys.exit(1)
        reset_count = 0
        for row in existing:
            if (row.get("enriched_at")
                    and not row.get("city")
                    and not row.get("country")
                    and not row.get("photo_filename")):
                row["enriched_at"] = ""
                reset_count += 1
        save_csv(csv_path, existing)
        kept = sum(1 for r in existing if r.get("enriched_at"))
        print(f"✓ Reset {reset_count}/{len(existing)} rows  ({kept} kept as done)")
        print(f"  Re-run with --linkedin-only to enrich the reset rows.")
        return

    # One browser, one profile — shared across 6Degrees and LinkedIn.
    async with async_playwright() as pw:
        browser = await pw.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=args.headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )

        page = await make_page(browser)

        # ── Phase 1 ──────────────────────────────────────────────────────────
        if args.linkedin_only:
            if not existing:
                print(f"✗ No existing CSV at {csv_path}. Run without --linkedin-only first.", file=sys.stderr)
                await browser.close()
                sys.exit(1)
            rows = existing
            print(f"Loaded {len(rows)} rows from {csv_path}")
        else:
            await ensure_sixdegrees_login(page, args.headless)
            rows = await phase1(page, list_id, photo_dir, args.limit)
            rows = merge_with_existing(rows, existing)
            save_csv(csv_path, rows)
            print(f"  Saved → {csv_path}")

        # ── Phase 2 ──────────────────────────────────────────────────────────
        if not args.no_linkedin:
            await ensure_linkedin_login(page, args.headless)
            rows = await phase2(browser, page, rows, photo_dir, csv_path)
            save_csv(csv_path, rows)
            print(f"  Saved → {csv_path}")

        await browser.close()

    # ── Summary ───────────────────────────────────────────────────────────────
    with_li       = sum(1 for r in rows if r.get("linkedin_url"))
    with_city     = sum(1 for r in rows if r.get("city"))
    with_country  = sum(1 for r in rows if r.get("country"))
    with_photo    = sum(1 for r in rows if r.get("photo_filename"))
    li_visited    = sum(1 for r in rows if r.get("enriched_at"))
    print(f"\n{'='*60}")
    print(f"Done!  {len(rows)} contacts")
    print(f"  LinkedIn URL   : {with_li}")
    print(f"  LI visited     : {li_visited}")
    print(f"  city set       : {with_city}")
    print(f"  country set    : {with_country}")
    print(f"  photo          : {with_photo}")
    print(f"  CSV            : {csv_path.resolve()}")
    print(f"  Photos         : {photo_dir.resolve()}/")
    print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
