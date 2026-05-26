// Public — no auth required. The extension popup fetches this to detect updates.
import manifest from "@/../chrome-extension/manifest.json"

const CORS = { "Access-Control-Allow-Origin": "*" }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

// ─── Update notes + thresholds whenever a new extension version ships ────────
//
// latest                  – auto-derived from chrome-extension/manifest.json
//
// reinstallRequiredBelow  – versions BELOW this string need a full reinstall
//                           (set when manifest.json gains new permissions /
//                            host_permissions / content-script patterns).
//                           null = no reinstall required from any known version.
//
// reloadRequiredBelow     – versions below this (but >= reinstallRequiredBelow)
//                           only need a reload in chrome://extensions.
//
const VERSION_INFO = {
  latest:                manifest.version,          // ← always in sync with manifest.json
  reinstallRequiredBelow: "1.4.6" as string | null,
  reloadRequiredBelow:   manifest.version as string | null,
  notes: [
    "v1.4.9: Fix company scraping: new Strategy 5 scans <a href='/company/'> links in",
    "        <main> — LinkedIn stopped using alt='Company logo' in 2024, breaking all",
    "        logo-based strategies. Fix photo scraping: score candidates by -cr- URL",
    "        suffix (+200) and srcset width instead of DOM order — mutual-connection",
    "        thumbnails in the top-card section no longer beat the real profile photo.",
    "        Fix asCompany: reject strings > 60 chars (was treating long headline",
    "        segments like 'Tokenized deposits and Tokenized securities' as company).",
    "v1.4.8: Live debug panel in popup — opens on any LinkedIn /in/ profile and shows",
    "        scraped name/company/role/photo + full strategy log. Copy buttons for log",
    "        and all fields. Re-scrape button to retry without closing popup.",
    "v1.4.7: Fix photo wrong-pick: scope profile-displayphoto search to top-card section",
    "        only (was scanning all of <main>, matching mutual-connection thumbnails).",
    "        Remove overly-broad Strategy 0 selector. Add [6D photo]/[6D company] debug",
    "        logging — open DevTools console on a profile to see which strategy fires.",
    "v1.4.6: Auto-save credentials — visiting 6degrees.aequus.money backs up your",
    "        token to localStorage so reinstalling the extension reconnects",
    "        automatically without re-entering the URL/token.",
    "        ⚠ Reinstall required (new host permission for 6degrees.aequus.money).",
    "v1.4.5: Fix wrong photo: use DOM order instead of getBoundingClientRect sort.",
    "        Lazy-loaded thumbnails report top=0 (off-screen), sorting before the",
    "        real profile photo. DOM order is always correct: top-card comes first.",
    "v1.4.4: Fix wrong photo (mutual connections / Open to Work): pick topmost",
    "        profile-displayphoto by vertical position, not widest srcset.",
    "v1.4.3: Fix company from experience section logos (Strategy 4 scans full <main>,",
    "        not just top-card; catches profiles where logos aren't in the top snippet).",
    "v1.4.2: Fix company always scraped from DOM (JSON-LD/logo) first — headline parsing",
    "        was overriding the real company when separator order was ambiguous.",
    "v1.4.1: Robust profile photo — exact photo-class Strategy 0, tighter topCard scope, squarish guard.",
    "v1.4.0: Fix company scraping: dot-separator direction detection (Company·Role vs Role·Company),",
    "        location guard (city/region no longer stored as company name).",
    "v1.3.9: Fix auto-queue SPA navigation (subtree observer), fix Open to Work wrong photo.",
    "v1.3.7: Fix company scraping (JSON-LD + logo img + modern selectors), fix auto-queue path check.",
    "v1.3.6: Infer country from region when LinkedIn omits it (e.g. 'Île-de-France' → 'France').",
    "v1.3.5: Fix 'Followed' label (skipped for 1st-degree connections), improve location scraping.",
    "v1.3.4: Auto-queue visited profiles (toggle in extension popup).",
    "v1.3.3: Download photo as base64 at save time so photos don't expire.",
    "v1.3.2: Fix photo (isValidPhoto too aggressive), add company/title parsing",
    "        from headline ('CEO at Acme' → position=CEO company=Acme), fix mutual",
    "        connections for French LinkedIn, auto-tag saved contacts as 'Followed'.",
    "v1.3.1: Simplify scraper — collect same data as export_list.py script.",
    "v1.3.0: Import LinkedIn follows from /mynetwork/following/ page.",
    "        ⚠ Reinstall required if upgrading from < 1.3.0.",
    "v1.2.5: Port proven photo + location logic from export_list.py.",
  ].join("\n"),
}
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return Response.json(VERSION_INFO, { headers: CORS })
}
