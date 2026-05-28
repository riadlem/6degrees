;(function () {
  "use strict"

  // ─── UI helpers ───────────────────────────────────────────────────────────────

  let _bannerEl = null

  function getBanner() {
    if (_bannerEl && document.body.contains(_bannerEl)) return _bannerEl
    _bannerEl = document.createElement("div")
    _bannerEl.id = "sd-m2020-banner"
    Object.assign(_bannerEl.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
      background: "#1e3a8a",
      color: "#fff",
      borderRadius: "16px",
      padding: "16px 20px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.30)",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fontSize: "13px",
      lineHeight: "1.5",
      maxWidth: "340px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    })
    document.body.appendChild(_bannerEl)
    return _bannerEl
  }

  function showBanner(html, actions) {
    const banner = getBanner()
    banner.innerHTML = html
    if (actions?.length) {
      const row = document.createElement("div")
      row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;"
      for (const { label, style = {}, onClick } of actions) {
        const btn = document.createElement("button")
        btn.textContent = label
        Object.assign(btn.style, {
          padding: "7px 14px", borderRadius: "8px", border: "none",
          cursor: "pointer", fontSize: "12px", fontWeight: "600",
          fontFamily: "inherit", ...style,
        })
        btn.addEventListener("click", onClick)
        row.appendChild(btn)
      }
      banner.appendChild(row)
    }
  }

  function hideBanner() { _bannerEl?.remove(); _bannerEl = null }

  // ─── Scraper ──────────────────────────────────────────────────────────────────
  // The M2020 site uses Next.js SSR — all 421 speakers are in the HTML on load.
  // Emotion CSS-in-JS generates hashed class names so data-testid is the only
  // stable selector.

  function scrapeSpeakers() {
    const nameEls = document.querySelectorAll('[data-testid="content-profile-name"]')
    if (nameEls.length === 0) return []

    const speakers = []
    const seen = new Set()

    for (const nameEl of nameEls) {
      const fullName = nameEl.textContent?.trim()
      if (!fullName) continue

      // Split on first space: "Onur Genç" → ["Onur", "Genç"]
      const spaceIdx = fullName.indexOf(" ")
      const firstName = spaceIdx > 0 ? fullName.slice(0, spaceIdx) : fullName
      const lastName  = spaceIdx > 0 ? fullName.slice(spaceIdx + 1) : ""

      const key = `${firstName}|${lastName}`
      if (seen.has(key)) continue
      seen.add(key)

      // Walk up to the inner card body that holds title/company/country/tag
      // Structure: name-p → div.wrapper → div.inner-card-body (.eo8h9sq5)
      // Use .closest() with data-testid siblings as fallback
      const cardBody = nameEl.closest('[data-testid="content-profile-name"]')
        ?.parentElement?.parentElement ?? nameEl.parentElement?.parentElement

      const role        = cardBody?.querySelector('[data-testid="job-title"]')?.textContent?.trim() ?? null
      const company     = cardBody?.querySelector('[data-testid="company-name"]')?.textContent?.trim() ?? null
      const country     = cardBody?.querySelector('[data-testid="country"]')?.textContent?.trim() ?? null
      const tag         = cardBody?.querySelector('[data-testid="tag"]')?.textContent?.trim() ?? null

      // Anchor wraps the whole card — href is the speaker detail page
      const anchor   = nameEl.closest("a")
      const photoUrl = anchor?.querySelector("img")?.src ?? null
      // Omit data: URIs and tiny placeholder images
      const cleanPhoto = (photoUrl && photoUrl.startsWith("http") && !photoUrl.includes("placeholder"))
        ? photoUrl : null

      speakers.push({
        firstName,
        lastName,
        role,
        company,
        // Use tag ("Headliner", "Keynote", etc.) as a session-topic label
        sessionTopic: tag ?? null,
        description: country ? `Based in ${country}` : null,
        linkedinUrl: null,   // not available on the listing page
        photoUrl: cleanPhoto,
      })
    }

    return speakers
  }

  // ─── API call ─────────────────────────────────────────────────────────────────

  async function sendToApp(speakers) {
    const { apiUrl, apiToken } = await new Promise((r) =>
      chrome.storage.local.get(["apiUrl", "apiToken"], r)
    )
    if (!apiUrl || !apiToken) {
      return { ok: false, error: "Not configured — open the 6Degrees extension popup." }
    }
    try {
      const res = await fetch(apiUrl.replace(/\/$/, "") + "/api/events/speakers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({
          eventSlug: "money2020-europe-2026",
          eventName: "Money 20/20 Europe 2026",
          speakers,
        }),
      })
      const json = await res.json().catch(() => ({}))
      return { ok: res.ok, ...json }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  // ─── Main flow ────────────────────────────────────────────────────────────────

  function showImportBanner(speakers) {
    showBanner(
      `<div style="font-weight:700;font-size:15px;margin-bottom:2px">6Degrees — Money 20/20</div>
       <div style="opacity:0.9">Found <strong>${speakers.length}</strong> speakers ready to import.</div>`,
      [
        {
          label: `Import ${speakers.length} speakers`,
          style: { background: "#fff", color: "#1e3a8a" },
          onClick: async (e) => {
            const btn = e.currentTarget
            btn.textContent = "Importing…"
            btn.disabled = true
            const result = await sendToApp(speakers)
            if (result.ok) {
              showBanner(
                `<div style="font-weight:700;font-size:15px">✓ Done!</div>
                 <div style="opacity:0.9"><strong>${result.imported ?? speakers.length}</strong> speakers saved.</div>
                 <div style="font-size:11px;opacity:0.7">Go to 6Degrees → Events to manage them.</div>`,
                [{ label: "Close", style: { background: "rgba(255,255,255,0.2)", color: "#fff" }, onClick: hideBanner }]
              )
            } else {
              showBanner(
                `<div style="font-weight:700">⚠ Error</div>
                 <div style="opacity:0.9">${result.error || "Something went wrong."}</div>`,
                [
                  { label: "Retry", style: { background: "#fff", color: "#1e3a8a" }, onClick: () => showImportBanner(speakers) },
                  { label: "Close", style: { background: "rgba(255,255,255,0.2)", color: "#fff" }, onClick: hideBanner },
                ]
              )
            }
          },
        },
        { label: "Dismiss", style: { background: "rgba(255,255,255,0.15)", color: "#fff" }, onClick: hideBanner },
      ]
    )
  }

  async function run() {
    if (!location.pathname.includes("/speaker") && !location.pathname.includes("/agenda")) return

    // Page is SSR — speakers are in the DOM immediately. Brief wait for hydration.
    await new Promise((r) => setTimeout(r, 1200))

    const speakers = scrapeSpeakers()

    if (speakers.length >= 2) {
      showImportBanner(speakers)
      return
    }

    // Retry once after a bit more time (slow connections)
    await new Promise((r) => setTimeout(r, 2000))
    const retry = scrapeSpeakers()

    if (retry.length >= 2) {
      showImportBanner(retry)
      return
    }

    showBanner(
      `<div style="font-weight:700;font-size:14px">6Degrees — Money 20/20</div>
       <div style="font-size:12px;opacity:0.85">No speakers detected.<br>Make sure you're on the speakers list page.</div>`,
      [
        {
          label: "Try again",
          style: { background: "#fff", color: "#1e3a8a" },
          onClick: async (e) => {
            const btn = e.currentTarget
            btn.textContent = "Scanning…"
            btn.disabled = true
            await new Promise((r) => setTimeout(r, 1000))
            const found = scrapeSpeakers()
            if (found.length >= 2) { showImportBanner(found); return }
            btn.textContent = "Try again"
            btn.disabled = false
          },
        },
        { label: "Close", style: { background: "rgba(255,255,255,0.15)", color: "#fff" }, onClick: hideBanner },
      ]
    )
  }

  // SPA navigation support
  function startUI() {
    let _lastPath = location.pathname
    new MutationObserver(() => {
      if (location.pathname !== _lastPath) {
        _lastPath = location.pathname
        hideBanner()
        run()
      }
    }).observe(document.body, { childList: true, subtree: true })
    run()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startUI)
  } else {
    startUI()
  }
})()
