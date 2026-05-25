// Public — no auth required. The extension popup fetches this to detect updates.
const CORS = { "Access-Control-Allow-Origin": "*" }

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

// ─── Update this block whenever a new extension version ships ────────────────
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
  latest:                "1.3.4",
  reinstallRequiredBelow: "1.3.0" as string | null,
  reloadRequiredBelow:   "1.3.4" as string | null,
  notes: [
    "v1.3.4: Auto-queue visited profiles (toggle in extension popup).",
    "v1.3.3: Download photo as base64 at save time so photos don't expire.",
    "v1.3.2: Fix photo (isValidPhoto too aggressive), add company/title parsing",
    "        from headline ('CEO at Acme' → position=CEO company=Acme), fix mutual",
    "        connections for French LinkedIn, auto-tag saved contacts as 'Followed'.",
    "v1.3.1: Simplify scraper — collect same data as export_list.py script.",
    "        Photo · location · mutual connections · name · headline.",
    "        Removed experience/education scraping (unreliable, not needed).",
    "        Panel is now compact and always shows correct data.",
    "v1.3.0: Import LinkedIn follows from /mynetwork/following/ page.",
    "        ⚠ Reinstall required if upgrading from < 1.3.0.",
    "v1.2.5: Port proven photo + location logic from export_list.py.",
  ].join("\n"),
}
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return Response.json(VERSION_INFO, { headers: CORS })
}
