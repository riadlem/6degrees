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
  latest:                "1.2.5",
  reinstallRequiredBelow: null as string | null,
  reloadRequiredBelow:   "1.2.5",
  notes: [
    "v1.2.5: Port proven photo + location logic from export_list.py script.",
    "        Photo: positive 'profile-displayphoto' URL filter + largest srcset",
    "        width ≥ 200px — same algorithm that worked for 1500+ profiles.",
    "        Location: text-based scan of main.innerText anchored on 'Contact info'",
    "        marker (any locale) — immune to CSS class churn.",
    "v1.2.4: Banner exclusion by aspect ratio + 'background' URL check.",
    "v1.2.3: Photo quality upgrade — 400px CDN URL rewriting.",
    "v1.2.2: Improve photo scraping with 5 ordered strategies.",
    "v1.2.1: Fix token verification in popup.",
    "v1.2.0: Fix photo picking logged-in user's nav avatar.",
  ].join("\n"),
}
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return Response.json(VERSION_INFO, { headers: CORS })
}
