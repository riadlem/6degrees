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
  latest:                "1.2.4",
  reinstallRequiredBelow: null as string | null,
  reloadRequiredBelow:   "1.2.4",
  notes: [
    "v1.2.4: Fix banner captured instead of profile photo; fix empty profile fields.",
    "        Photo scraping: banner excluded by aspect ratio + 'background' URL check;",
    "        og:image moved to last resort (was causing SPA stale-page banner capture).",
    "        FAB delay 1.5s → 3s; shows warning when profile not fully loaded yet.",
    "v1.2.3: Photo quality upgrade — 400px CDN URL rewriting, shrink_400_400.",
    "v1.2.2: Improve photo scraping with 5 ordered strategies.",
    "v1.2.1: Fix token verification in popup.",
    "v1.2.0: Fix photo picking logged-in user's nav avatar.",
  ].join("\n"),
}
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return Response.json(VERSION_INFO, { headers: CORS })
}
