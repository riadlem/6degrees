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
  latest:                "1.1.0",
  reinstallRequiredBelow: null as string | null,
  reloadRequiredBelow:   "1.1.0",
  notes: [
    "v1.1.0: Fixed photo detection (avatar vs background), company name parsing,",
    "        location scraping, CORS, pagination bug (sync now completes fully),",
    "        mutual-connection deduplication, 45s stream-stall detection.",
  ].join("\n"),
}
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return Response.json(VERSION_INFO, { headers: CORS })
}
