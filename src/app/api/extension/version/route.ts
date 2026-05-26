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
  reinstallRequiredBelow: "1.3.0" as string | null,
  reloadRequiredBelow:   manifest.version as string | null,
  notes: [
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
