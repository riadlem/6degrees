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
  latest:                "1.2.1",
  reinstallRequiredBelow: null as string | null,
  reloadRequiredBelow:   "1.2.1",
  notes: [
    "v1.2.1: Fix token verification in popup — use Bearer-token-authenticated endpoint.",
    "v1.2.0: Fix photo picking logged-in user's nav avatar instead of profile photo.",
    "        Fix name showing 'Unknown' when h1 selectors miss — now falls back to",
    "        page title ('First Last - Headline | LinkedIn') before slug heuristic.",
    "v1.1.1: Version shown in popup header; photo scraping checks data-ghost-url.",
  ].join("\n"),
}
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return Response.json(VERSION_INFO, { headers: CORS })
}
