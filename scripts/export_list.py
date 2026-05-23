#!/usr/bin/env python3
"""
Export a 6Degrees list to CSV + photos with optional LinkedIn enrichment.

Usage:
    # Phase 1 only (API fetch):
    SIXDEGREES_COOKIE="next-auth.session-token=..." python scripts/export_list.py <listId>

    # Phase 1 + LinkedIn enrichment:
    SIXDEGREES_COOKIE="..." python scripts/export_list.py <listId>

    # Re-run LinkedIn only (skip API fetch, enrich existing CSV):
    python scripts/export_list.py <listId> --linkedin-only

    # API only, no LinkedIn:
    SIXDEGREES_COOKIE="..." python scripts/export_list.py <listId> --no-linkedin

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
import os
import re
import sys
from pathlib import Path

import httpx
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
    return p.parse_args()


# ── Auth ──────────────────────────────────────────────────────────────────────
def get_cookie() -> str:
    cookie = os.environ.get("SIXDEGREES_COOKIE", "").strip()
    if not cookie:
        print("⚠️  SIXDEGREES_COOKIE not set. Set it to your next-auth.session-token cookie.", file=sys.stderr)
    return cookie


def api_headers(cookie: str) -> dict:
    return {
        "Cookie": cookie,
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }


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

    # "X et périphérie" / "X et environs" — French "X Area"; no country revealed.
    m = re.match(r"^(.+?)\s+et\s+(?:périphérie|environs|alentours)$", raw, re.IGNORECASE)
    if m:
        return (m.group(1).strip(), "")

    # "Greater X Area / Metropolitan Region"
    m = re.match(r"^Greater\s+(.+?)\s+(?:Area|Metropolitan\s+Region|Region)$", raw, re.IGNORECASE)
    if m:
        return (m.group(1).strip(), "")

    parts = [p.strip() for p in raw.split(",")]
    if len(parts) >= 2:
        # "City, [Region,] Country" — normalise country via map
        return (parts[0], COUNTRY_MAP.get(parts[-1], parts[-1]))

    # Single token: a bare country belongs in `country`, not `city`.
    tok = parts[0]
    if tok in COUNTRY_MAP:
        return ("", COUNTRY_MAP[tok])
    return (tok, "")


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
async def phase1(list_id: str, photo_dir: Path, cookie: str, limit: int) -> list[dict]:
    print(f"\n{'='*60}")
    print(f"Phase 1 — 6Degrees API fetch")
    print(f"{'='*60}")

    url = f"{BASE_URL}/api/lists/{list_id}"
    print(f"  GET {url}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(url, headers=api_headers(cookie))
        if resp.status_code == 401:
            print("  ✗ 401 Unauthorized — check SIXDEGREES_COOKIE", file=sys.stderr)
            sys.exit(1)
        if resp.status_code == 404:
            print(f"  ✗ 404 — list {list_id} not found", file=sys.stderr)
            sys.exit(1)
        resp.raise_for_status()
        data = resp.json()

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
                # External URL — download directly
                for ext in ("jpg", "jpeg", "png", "webp"):
                    candidate = photo_dir / f"{idx}_{fname}.{ext}"
                    if candidate.exists():
                        photo_filename = candidate.name
                        photo_count += 1
                        break
                else:
                    try:
                        async with httpx.AsyncClient(timeout=20.0) as dl:
                            r = await dl.get(photo_url, follow_redirects=True)
                        if r.status_code == 200:
                            ct = r.headers.get("content-type", "image/jpeg")
                            ext = "jpg" if "jpeg" in ct or "jpg" in ct else ct.split("/")[-1].split(";")[0]
                            photo_path = photo_dir / f"{idx}_{fname}.{ext}"
                            photo_path.write_bytes(r.content)
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

        # ── Location ─────────────────────────────────────────────────────────
        location_raw = ""

        # Try multiple CSS selectors (LinkedIn changes these regularly)
        loc_selectors = [
            ".pv-text-details__left-panel .text-body-small.inline",
            "[data-generated-suggestion-target] .pvs-header__subtitle",
            ".pb2.pv-text-details__right-panel span[aria-hidden='true']",
            ".pv-top-card--list .pv-top-card--list-bullet",
        ]
        for sel in loc_selectors:
            try:
                els = page.locator(sel)
                count = await els.count()
                for j in range(count):
                    txt = (await els.nth(j).inner_text()).strip()
                    if txt and len(txt) > 3 and "\n" not in txt:
                        location_raw = txt
                        break
                if location_raw:
                    break
            except Exception:
                pass

        # Fallback: scan visible body text for a location-like pattern
        if not location_raw:
            try:
                body = await page.inner_text("main", timeout=5_000)
                # Match typical "City, Region, Country" or "City, Country" patterns
                # near the top of the profile (first 2000 chars usually)
                head = body[:2000]
                loc_re = re.compile(
                    r"\n([A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝ][^\n]{3,70}"
                    r"(?:France|Kingdom|States|Germany|Spain|Italy|Netherlands|"
                    r"Belgium|Switzerland|Canada|Australia|Singapore|Emirates|"
                    r"Luxembourg|Sweden|Denmark|Norway|Austria|Portugal|Poland|Ireland"
                    # French country names — the UI is localised
                    r"|Espagne|Suisse|Italie|Allemagne|Royaume-Uni|Irlande|Belgique"
                    r"|Pays-Bas|États-Unis|Émirats|Autriche|Argentine|Br[ée]sil|Mexique"
                    r"|Singapour|Maroc|Tunisie|Russie|Ukraine|Turquie|Grèce|Inde|Chine"
                    r"|périphérie|environs|R[ée]gion|Region|Area))\n",
                    re.UNICODE,
                )
                m = loc_re.search(head)
                if m:
                    location_raw = m.group(1).strip()
            except Exception:
                pass

        if location_raw:
            city, country = parse_location(location_raw)
            if city:
                result["city"] = city
            if country:
                result["country"] = country

        # ── Mutual connections ────────────────────────────────────────────────
        try:
            body = await page.inner_text("main", timeout=5_000)
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

        # ── Profile photo ─────────────────────────────────────────────────────
        photo_selectors = [
            "img[src*='profile-displayphoto']",
            "img[srcset*='profile-displayphoto']",
            ".pv-top-card-profile-picture__image",
            ".presence-entity__image",
            "section.artdeco-card img[src*='licdn.com/dms']",
        ]
        for sel in photo_selectors:
            try:
                el = page.locator(sel).first
                if await el.count() == 0:
                    continue

                src    = await el.get_attribute("src") or ""
                srcset = await el.get_attribute("srcset") or ""

                # Only proceed if this looks like a profile photo (not banner/feed)
                combined = src + srcset
                if "profile-displayphoto" not in combined and "dms/image" not in combined:
                    continue

                # Pick the largest image from srcset
                photo_url = src
                if srcset:
                    candidates = re.findall(r"(https?://[^\s,]+)\s+(\d+)w", srcset)
                    if candidates:
                        photo_url = max(candidates, key=lambda x: int(x[1]))[0]

                if not photo_url or not photo_url.startswith("http"):
                    continue

                # Skip banner/company images
                if any(kw in photo_url for kw in ("banner", "company-logo", "organization")):
                    continue

                # Download via page.request — runs outside the page JS context
                # so it bypasses LinkedIn's fetch wrapper (which raises TypeError:
                # Failed to fetch) and any CSP/XHR 403 on resized variants.
                # page.request inherits the browser's session cookies automatically.
                try:
                    resp = await page.request.get(
                        photo_url,
                        headers={"Referer": "https://www.linkedin.com/"},
                    )
                    if resp.ok:
                        body = await resp.body()
                        if body and len(body) > 1_000:  # real photo > 1 KB
                            ext = "png" if ".png" in photo_url else "jpg"
                            photo_filename = f"{idx}_{fname}.{ext}"
                            photo_path = photo_dir / photo_filename
                            if not photo_path.exists():
                                photo_path.write_bytes(body)
                            result["photo_filename"] = photo_filename
                    else:
                        print(f"      ⚠️  Photo HTTP {resp.status} for {photo_url[:60]}", file=sys.stderr)
                except Exception as dl_exc:
                    print(f"      ⚠️  Photo download: {dl_exc}", file=sys.stderr)
                break

            except Exception as exc:
                print(f"      ⚠️  Photo ({sel}): {exc}", file=sys.stderr)

    except Exception as exc:
        print(f"    ⚠️  Scrape error: {exc}", file=sys.stderr)

    return result


async def phase2(rows: list[dict], photo_dir: Path, profile_dir: Path, headless: bool) -> list[dict]:
    needs = [r for r in rows if not is_row_complete(r) and r.get("linkedin_url")]

    if not needs:
        print("\n✓ All rows already have city + country — skipping LinkedIn pass")
        return rows

    total = len(needs)
    pad   = len(str(total))
    print(f"\n{'='*60}")
    print(f"Phase 2 — LinkedIn enrichment ({total}/{len(rows)} rows need it)")
    print(f"{'='*60}")
    print(f"  Persistent profile: {profile_dir}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=headless,
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

        page = await browser.new_page()

        # Stealth: remove navigator.webdriver fingerprint
        await page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        # Check login
        await page.goto("https://www.linkedin.com/feed", wait_until="domcontentloaded", timeout=30_000)
        await asyncio.sleep(1.5)
        if "login" in page.url or "authwall" in page.url or "checkpoint" in page.url:
            print("\n  ⚠️  Not logged in to LinkedIn!")
            if headless:
                print("  Run without --headless to log in interactively.")
                await browser.close()
                return rows
            print("  Please log in in the browser window, then press Enter here...")
            input("  [press Enter once logged in] ")

        import random

        for i, row in enumerate(needs, 1):
            url   = row["linkedin_url"]
            name  = row["name"]
            fname = safe_filename(name)
            # Find this row's index in the master list for photo naming
            idx   = str(rows.index(row) + 1).zfill(len(str(len(rows))))

            print(f"  [{i:>{pad}}/{total}] {name}")

            enriched = await scrape_linkedin_profile(page, url, photo_dir, idx, fname)

            # Merge enriched fields into row (don't overwrite existing values)
            for key, val in enriched.items():
                if val and not row.get(key):
                    row[key] = val

            # Mark as visited regardless of what was found — this is what makes
            # resumability reliable.  Profiles with no location or no photo will
            # never satisfy a "city AND country" check, so we use this instead.
            row["enriched_at"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            city    = row.get("city", "")
            country = row.get("country", "")
            shared  = row.get("shared_contacts", "")
            photo   = row.get("photo_filename", "")
            print(f"           city={city or '—'}  country={country or '—'}  shared={shared or '—'}  photo={'✓' if photo else '—'}")

            # Polite delay with jitter — avoid detection
            if i < total:
                delay = LI_DELAY_MIN + random.random() * (LI_DELAY_MAX - LI_DELAY_MIN)
                # Every 50 profiles, take a longer break
                if i % 50 == 0:
                    delay += random.uniform(15, 30)
                    print(f"  ⏸  Break ({delay:.0f}s)…")
                await asyncio.sleep(delay)

        await browser.close()

    attempted     = sum(1 for r in rows if r.get("enriched_at"))
    with_location = sum(1 for r in rows if r.get("city") or r.get("country"))
    with_photo    = sum(1 for r in rows if r.get("photo_filename"))
    print(f"\n  ✓ LinkedIn pass done")
    print(f"    visited      : {attempted}/{len(rows)}")
    print(f"    has location : {with_location}")
    print(f"    has photo    : {with_photo}")
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
    cookie  = get_cookie()

    out_dir      = Path("output") / list_id
    photo_dir    = out_dir / "photos"
    csv_path     = out_dir / "contacts.csv"
    profile_dir  = Path("output") / ".li_profile"   # persistent Playwright profile

    out_dir.mkdir(parents=True, exist_ok=True)
    photo_dir.mkdir(exist_ok=True)
    profile_dir.mkdir(exist_ok=True)

    print(f"Output → {out_dir.resolve()}")

    existing = load_csv(csv_path)

    # ── Phase 1 ──────────────────────────────────────────────────────────────
    if args.linkedin_only:
        if not existing:
            print(f"✗ No existing CSV at {csv_path}. Run without --linkedin-only first.", file=sys.stderr)
            sys.exit(1)
        rows = existing
        print(f"Loaded {len(rows)} rows from {csv_path}")
    else:
        rows = await phase1(list_id, photo_dir, cookie, args.limit)
        rows = merge_with_existing(rows, existing)
        save_csv(csv_path, rows)
        print(f"  Saved → {csv_path}")

    # ── Phase 2 ──────────────────────────────────────────────────────────────
    if not args.no_linkedin:
        rows = await phase2(rows, photo_dir, profile_dir, args.headless)
        save_csv(csv_path, rows)
        print(f"  Saved → {csv_path}")

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
