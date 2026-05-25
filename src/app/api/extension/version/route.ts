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
  latest:                "1.3.0",
  reinstallRequiredBelow: "1.3.0" as string | null,
  reloadRequiredBelow:   null as string | null,
  notes: [
    "v1.3.0: Import LinkedIn follows — visit linkedin.com/mynetwork/network-manager/following/",
    "        A banner appears; click 'Import follows' to auto-scroll + import all",
    "        people you follow as contacts in 6Degrees.",
    "        ⚠ Reinstall required (new content-script match pattern added).",
    "v1.2.5: Port proven photo + location logic from export_list.py.",
    "v1.2.4: Banner exclusion by aspect ratio + 'background' URL check.",
    "v1.2.3: Photo quality upgrade — 400px CDN URL rewriting.",
  ].join("\n"),
}
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  return Response.json(VERSION_INFO, { headers: CORS })
}
