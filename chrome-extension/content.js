;(function () {
  "use strict"

  const path = window.location.pathname

  // ─── Following-page importer ─────────────────────────────────────────────────
  if (path.startsWith("/mynetwork/network-manager/following")) {
    initFollowsImporter()
    return
  }

  if (!path.startsWith("/in/")) return

  // ─── Shadow DOM host ──────────────────────────────────────────────────────────
  // We render the FAB and panel inside a shadow root so:
  //   1. LinkedIn's nonce-based CSP cannot block our styles (extension URL origin)
  //   2. LinkedIn's own CSS cannot bleed into our UI (shadow encapsulation)

  let _shadow = null

  function getShadow() {
    if (_shadow) return _shadow

    const host = document.createElement("div")
    host.id = "sd-root"
    // Reset all inherited styles on the host so LinkedIn's global CSS can't
    // affect the shadow root container itself.
    host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483639; overflow: visible; pointer-events: none;"
    document.body.appendChild(host)

    _shadow = host.attachShadow({ mode: "open" })

    // Load styles from extension origin — bypasses the page's CSP entirely.
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = chrome.runtime.getURL("content.css")
    _shadow.appendChild(link)

    return _shadow
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function q(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel)
        if (el) return el
      } catch { /* invalid selector — skip */ }
    }
    return null
  }

  function text(selectors, root = document) {
    const el = q(selectors, root)
    return el ? el.textContent.trim() || null : null
  }

  // ─── Scraper ─────────────────────────────────────────────────────────────────

  function slugFromUrl() {
    return window.location.pathname
      .replace(/^\/in\//, "")
      .replace(/\/$/, "")
      .split("/")[0] ?? ""
  }

  function humanizeSlug(slug) {
    const parts = slug
      .split("-")
      .filter((p) => p.length > 0 && !/^\d+$/.test(p))
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    if (parts.length === 0) return { firstName: slug || "Unknown", lastName: null }
    if (parts.length === 1) return { firstName: parts[0], lastName: null }
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] }
  }

  function scrapeName() {
    const selectors = [
      "h1.text-heading-xlarge",
      "h1[class*='text-heading']",
      ".pv-text-details__left-panel h1",
      ".ph5 h1",
      "section.artdeco-card h1",
      "main h1",
      "h1",
    ]
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel)
        if (!el) continue
        const inner = el.querySelector("span[aria-hidden='true']")
        const full = ((inner ?? el).textContent ?? "").trim()
        if (!full || full.length > 100) continue
        const parts = full.split(/\s+/).filter(Boolean)
        if (parts.length >= 1) {
          return { firstName: parts[0], lastName: parts.slice(1).join(" ") || null }
        }
      } catch { /* continue */ }
    }
    // Reliable fallback: page title is always "First Last - Headline | LinkedIn"
    const titleName = (document.title || "").split("|")[0].split(" - ")[0].trim()
    if (titleName && titleName.length > 1 && titleName !== "LinkedIn") {
      const parts = titleName.split(/\s+/).filter(Boolean)
      if (parts.length >= 2) return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
      if (parts.length === 1) return { firstName: parts[0], lastName: null }
    }
    console.debug("[6Degrees] name not found, falling back to URL slug")
    return humanizeSlug(slugFromUrl())
  }

  // Upgrade LinkedIn CDN URLs to 400×400 resolution.
  // LinkedIn media URLs contain a size suffix like "shrink_100_100" or "shrink_200_200".
  // Replacing it with "shrink_400_400" requests a higher-res version the CDN always has.
  function upgradePhotoUrl(src) {
    if (!src) return src
    // Replace any shrink_NxN with 400×400 (covers 100, 200, 800, etc.)
    return src.replace(/shrink_\d+_\d+/g, "shrink_400_400")
  }

  function imgSrc(img) {
    return (
      img.src ||
      img.getAttribute("data-delayed-url") ||
      img.getAttribute("data-ghost-url") ||
      img.currentSrc ||
      ""
    )
  }

  // Returns true if the image element has a squarish aspect ratio (profile photos are ~1:1).
  // Banners are ~4:1 or wider. We reject anything wider than 2× its height.
  function isSquarishImage(img) {
    const w = img.naturalWidth  || img.getBoundingClientRect().width  || img.width  || 0
    const h = img.naturalHeight || img.getBoundingClientRect().height || img.height || 0
    if (!w || !h) return true  // dimensions unknown — don't reject
    return (w / h) < 2.5
  }

  function scrapePhoto() {
    const mainEl = document.querySelector("main")

    // ── Strategy 1: profile-displayphoto positive filter + largest srcset ─────
    // LinkedIn CDN URLs for profile headshots always contain 'profile-displayphoto'.
    // Banners always contain 'displaybackgroundimage'. Using a positive filter
    // (rather than just excluding banners) is far more reliable across DOM changes.
    // Among matching imgs, the top-card headshot has srcset variants up to 400-800px;
    // sidebar thumbnails (mutual connections, PYMK) only go to 50-100px.
    // Picking the largest srcset width ≥ 200px reliably selects the right image.
    if (mainEl) {
      const profileImgs = [...mainEl.querySelectorAll("img")].filter((img) => {
        const s = (img.currentSrc || img.src || "") + " " + (img.srcset || "")
        return /profile-displayphoto/i.test(s) && !/displaybackgroundimage/i.test(s)
      })

      let bestUrl = "", bestW = 0
      for (const img of profileImgs) {
        for (const part of (img.srcset || "").split(",")) {
          const [u, w] = part.trim().split(/\s+/)
          const width = parseInt((w || "0").replace(/\D/g, ""), 10)
          if (width > bestW) { bestW = width; bestUrl = u }
        }
      }
      if (bestW >= 200 && bestUrl) return upgradePhotoUrl(bestUrl)

      // srcset absent (rare) — fall back to dedicated class or first filtered img
      const tc = mainEl.querySelector(".pv-top-card-profile-picture__image")
      if (tc) {
        const src = tc.currentSrc || tc.src || ""
        if (src && isValidPhoto(src)) return upgradePhotoUrl(src)
      }
      if (profileImgs.length > 0) {
        const src = profileImgs[0].currentSrc || profileImgs[0].src || ""
        if (src && isValidPhoto(src)) return upgradePhotoUrl(src)
      }
    }

    // ── Strategy 2: tight profile-photo containers ────────────────────────────
    const photoRoots = [
      document.querySelector(".pv-top-card-profile-picture"),
      document.querySelector(".profile-photo-edit__container"),
      document.querySelector(".pv-top-card__photo-wrapper"),
      document.querySelector("[data-anonymize='headshot-photo']")?.closest("div"),
    ].filter(Boolean)

    for (const root of photoRoots) {
      for (const picture of root.querySelectorAll("picture")) {
        const src = picture.querySelector("source")?.srcset?.split(",")?.[0]?.trim()?.split(" ")?.[0] || ""
        if (src && isValidPhoto(src)) return upgradePhotoUrl(src)
      }
      for (const img of root.querySelectorAll("img")) {
        const src = imgSrc(img)
        if (isValidPhoto(src) && isSquarishImage(img)) return upgradePhotoUrl(src)
      }
    }

    // ── Strategy 3: aria-label / data-anonymize attributes ────────────────────
    for (const sel of [
      "img[data-anonymize='headshot-photo']",
      "img[aria-label*='photo' i]",
      "img[alt*='photo' i]",
      ".pv-top-card-profile-picture__image--show",
      ".profile-photo-edit__preview",
      "img[class*='EntityPhoto']",
      "img[class*='profile-photo']",
    ]) {
      try {
        for (const img of document.querySelectorAll(sel)) {
          const src = imgSrc(img)
          if (isValidPhoto(src) && isSquarishImage(img)) return upgradePhotoUrl(src)
        }
      } catch { /* bad selector */ }
    }

    // ── Strategy 4: <picture> elements, guarded by aspect ratio ──────────────
    for (const picture of document.querySelectorAll("picture")) {
      const src = picture.querySelector("source")?.srcset?.split(",")?.[0]?.trim()?.split(" ")?.[0] || ""
      if (!src || !isValidPhoto(src)) continue
      const img = picture.querySelector("img")
      if (img && !isSquarishImage(img)) continue
      return upgradePhotoUrl(src)
    }

    // ── Strategy 5 (last resort): og:image ────────────────────────────────────
    // In LinkedIn's SPA, og:image stays stale on client-side navigations.
    // Only use it if nothing else worked AND URL contains 'displayphoto'.
    const og = document.querySelector('meta[property="og:image"], meta[name="og:image"]')
    if (og) {
      const src = og.content || og.getAttribute("content") || ""
      if (isValidPhoto(src) && src.includes("displayphoto")) return upgradePhotoUrl(src)
    }

    return null
  }

  function isValidPhoto(src) {
    if (!src || src.length < 10) return false
    // Exclude banner/background images — use the specific URL marker (same as export_list.py)
    if (
      src.includes("displaybackgroundimage") ||
      src.includes("ghost") ||
      src.includes("placeholder") ||
      src.includes("static.licdn") ||
      src.startsWith("data:") ||
      src.includes("/icons/") ||
      src.includes("icon-")
    ) return false
    // Accept any LinkedIn CDN origin
    return (
      src.includes("media.licdn.com") ||
      src.includes("mediaproxy.linkedin.com") ||
      src.includes("dms.licdn.com") ||
      src.includes("media-exp") ||
      src.includes("licdn.com")
    )
  }

  function scrapeHeadline() {
    // ── Text-based (locale-immune, ported from export_list.py) ────────────────
    // The headline is always the 1st "real" line after the name in main's text.
    // Skip pronouns, degree badges, and separators.
    const mainEl = document.querySelector("main")
    if (mainEl) {
      const lines = (mainEl.innerText || mainEl.textContent || "")
        .split("\n").map((l) => l.trim()).filter(Boolean)

      for (const line of lines.slice(1, 10)) {
        if (/^(He|She|They|Il|Elle)\/(Him|Her|Them|Lui|Elle)$/i.test(line)) continue
        if (/^·?\s*(1er|2e|3e|1st|2nd|3rd)\b/.test(line)) continue
        if (line === "·" || line.length < 6) continue
        if (/^\d/.test(line)) continue
        if (/\bconnection|\bfollower|\brelation/i.test(line)) continue
        // A headline is typically > 8 chars and doesn't look like a location
        // (we'll pick up location separately) — accept the first qualifying line
        if (line.length > 8 && line.length < 220) return line
      }
    }

    // ── CSS fallback ──────────────────────────────────────────────────────────
    const topCard = document.querySelector(
      ".pv-top-card, .scaffold-layout__main > section:first-of-type, main section"
    )
    if (topCard) {
      for (const sel of [
        ".text-body-medium.break-words",
        "[data-field='headline']",
        "div.text-body-medium",
        "span.text-body-medium",
      ]) {
        try {
          for (const el of topCard.querySelectorAll(sel)) {
            const t = el?.textContent?.trim()
            if (t && t.length > 8 && !t.match(/^\d+/) && !t.includes("connection") && !t.includes("follower")) {
              return t
            }
          }
        } catch { /* skip */ }
      }
    }
    return null
  }

  function scrapeLocation() {
    // ── Text-based approach (ported from export_list.py) ───────────────────────
    // CSS classes on LinkedIn's profile page change frequently; the text layout
    // does not.  The location line always sits just above the "Contact info"
    // link (any locale), so we scan main's inner text and look for that anchor.
    const mainEl = document.querySelector("main")
    if (mainEl) {
      const lines = (mainEl.innerText || mainEl.textContent || "")
        .split("\n").map((l) => l.trim()).filter(Boolean)

      const CONTACT_MARKERS = [
        "Coordonnées", "Contact info", "Kontaktinfo",
        "Información de contacto", "Informazioni di contatto",
        "Kontaktoplysninger", "Kontaktinformationen",
      ]

      function looksLikeLocation(s) {
        return s.length > 2 && s.length < 100 &&
          !s.match(/^\d/) && !s.includes("|") && !s.includes("@") &&
          !s.includes("connection") && !s.includes("follower") &&
          s !== "·"
      }

      // 1) Line just above the "Contact info" marker (skip bare "·" separators)
      for (let i = 0; i < lines.length; i++) {
        if (CONTACT_MARKERS.some((m) => lines[i] === m || lines[i].startsWith(m))) {
          let j = i - 1
          while (j >= 0 && lines[j] === "·") j--
          if (j >= 0 && looksLikeLocation(lines[j])) return lines[j]
          break
        }
      }

      // 2) Fallback: the 2nd "real" line after the name (headline, then location).
      //    Skip pronouns, degree badges, and separator lines.
      const kept = []
      for (const line of lines.slice(1, 15)) {
        if (/^(He|She|They|Il|Elle)\/(Him|Her|Them|Lui|Elle)$/i.test(line)) continue
        if (/^·?\s*(1er|2e|3e|1st|2nd|3rd)\b/.test(line)) continue
        if (line === "·") continue
        if (!line.includes("@") && !/^\d/.test(line)) kept.push(line)
        if (kept.length >= 2) break
      }
      if (kept.length >= 2 && looksLikeLocation(kept[1])) return kept[1]
    }

    // ── CSS fallback (still useful if innerText is empty or restricted) ───────
    for (const sel of [
      ".text-body-small.inline.t-black--light.break-words",
      "span.text-body-small.inline.t-black--light",
      "[data-field='location']",
    ]) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          const t = (el.textContent ?? "").trim()
          if (
            t.length > 3 && t.length < 100 &&
            !t.match(/^\d/) && !t.includes("connection") && !t.includes("follower")
          ) return t
        }
      } catch { /* skip */ }
    }
    return null
  }

  function scrapeConnectionDegree() {
    const el = q([".dist-value", ".pv-member-badge span[aria-hidden='true']", ".distance-badge span[aria-hidden='true']"])
    if (!el) return null
    const t = el.textContent.trim()
    const m = t.match(/([123])/)
    return m ? m[1] : null
  }

  // Multilingual mutual-connections keywords (same approach as export_list.py)
  const MUTUAL_RE = /mutual\s+connection|relation[s]?\s+en\s+commun|gemeinsame[n]?\s+Kontakt|contatto\s+in\s+comune|contacto[s]?\s+en\s+com[uú]n/i

  function scrapeMutualConnections() {
    // DOM-first: look for a link or span whose text mentions mutual connections
    for (const el of document.querySelectorAll("a, span, button")) {
      const t = (el.textContent ?? "").trim()
      if (!MUTUAL_RE.test(t)) continue
      // "42 mutual connections" or "42 relations en commun"
      let m = t.match(/(\d[\d\s]*)\s+(?:mutual|relation|gemeinsam|contatto|contacto)/i)
      if (m) return parseInt(m[1].replace(/\s/g, ""), 10)
      // "Name, Name2 et 35 autres relations en commun" → 37
      m = t.match(/,\s*[^,]+\s+et\s+(\d+)\s+autres/i)
      if (m) return parseInt(m[1], 10) + 2
      m = t.match(/[^\s,]+\s+et\s+(\d+)\s+autres/i)
      if (m) return parseInt(m[1], 10) + 1
      // "Name and N others"
      m = t.match(/and\s+(\d+)\s+other/i)
      if (m) return parseInt(m[1], 10) + 1
    }
    // Text fallback in main innerText
    const body = document.querySelector("main")?.innerText ?? ""
    const patterns = [
      [/(\d[\d\s]*)\s+mutual\s+connections?/i,                           (m) => parseInt(m[1].replace(/\s/g, ""), 10)],
      [/(\d[\d\s]*)\s+relations?\s+en\s+commun/i,                       (m) => parseInt(m[1].replace(/\s/g, ""), 10)],
      [/[^\n,]+,\s*[^\n,]+?\s+et\s+(\d+)\s+autres?\s+relations?\s+en\s+commun/i, (m) => parseInt(m[1], 10) + 2],
      [/[^\n,]+?\s+et\s+(\d+)\s+autres?\s+relations?\s+en\s+commun/i,  (m) => parseInt(m[1], 10) + 1],
    ]
    for (const [pat, extract] of patterns) {
      const m = body.match(pat)
      if (m) return extract(m)
    }
    return null
  }

  function scrapeSharedConnections() {
    const currentSlug = slugFromUrl()
    const seen = new Set()
    const results = []
    const section = [...document.querySelectorAll("section")].find(
      (s) => s.textContent.includes("mutual connection")
    )
    if (!section) return results
    section.querySelectorAll("a[href*='/in/']").forEach((a) => {
      // Skip links to the profile currently being viewed
      if (a.href.toLowerCase().includes(`/in/${currentSlug}`)) return
      const name = (a.querySelector("span[aria-hidden='true']")?.textContent ?? a.textContent).trim()
      const profileUrl = a.href.split("?")[0]
      // Skip empty names and deduplicate
      if (!name || !profileUrl.includes("/in/") || seen.has(profileUrl)) return
      seen.add(profileUrl)
      results.push({ name, profileUrl })
    })
    return results
  }

  // Parse "Title at Company" / "Title chez Company" / "Title · Company" patterns
  // from a LinkedIn headline.  Returns { position, company } — either may be null.
  function parsePositionCompany(headline) {
    if (!headline) return { position: null, company: null }
    // "Role at Company" (EN), "Role chez Company" (FR), "Role bei Company" (DE),
    // "Role presso Company" (IT), "Role en Company" (ES), "Role @ Company"
    const atPatterns = [
      /^(.+?)\s+at\s+(.+)$/i,
      /^(.+?)\s+chez\s+(.+)$/i,
      /^(.+?)\s+bei\s+(.+)$/i,
      /^(.+?)\s+presso\s+(.+)$/i,
      /^(.+?)\s*@\s*(.+)$/,
    ]
    for (const pat of atPatterns) {
      const m = headline.match(pat)
      if (m && m[1].trim().length > 1 && m[2].trim().length > 1) {
        // strip trailing badges like "| Board Member"
        const company = m[2].split(/\s*[|·]\s*/)[0].trim()
        return { position: m[1].trim(), company: company || null }
      }
    }
    // "Role · Company" — only accept if second part doesn't look like a location
    const dotM = headline.match(/^(.+?)\s*·\s*(.+)$/)
    if (dotM) {
      const right = dotM[2].trim()
      if (right.length > 1 && !/^\d/.test(right) && !/connection|follower|relation/i.test(right)) {
        return { position: dotM[1].trim(), company: right.split(/\s*[|·]\s*/)[0].trim() || null }
      }
    }
    // No separator — whole headline is the position
    return { position: headline, company: null }
  }

  // Same data as export_list.py: photo · location · mutual connections.
  // Plus name + headline + position + company which the extension needs for new contacts.
  function extractCityCountry(location) {
    if (!location) return { city: null, country: null }
    const parts = location.split(",").map((p) => p.trim())
    return parts.length >= 2
      ? { city: parts[0], country: parts[parts.length - 1] }
      : { city: null, country: location }
  }

  function scrapeProfile() {
    const { firstName, lastName } = scrapeName()
    const location = scrapeLocation()
    const { city, country } = extractCityCountry(location)
    const headline = scrapeHeadline()
    const { position, company } = parsePositionCompany(headline)
    const profileUrl = "https://www.linkedin.com/in/" + slugFromUrl() + "/"

    const profile = {
      profileUrl,
      firstName,
      lastName,
      headline,
      position,
      company,
      photoUrl: scrapePhoto(),
      location,
      city,
      country,
      degree: scrapeConnectionDegree(),
      commonConnections: scrapeMutualConnections(),
      sharedConnections: scrapeSharedConnections(),
    }

    console.debug("[6Degrees] scraped profile:", profile)
    return profile
  }

  // ─── UI ──────────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  }

  function initials(first, last) {
    return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase() || "?"
  }

  let panelEl = null
  let fabEl = null
  let currentProfile = null

  function injectFab() {
    if (fabEl) return
    const shadow = getShadow()

    const fab = document.createElement("button")
    fab.id = "sd-fab"
    fab.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" fill="white"/>
        <circle cx="4" cy="6" r="2.5" fill="white"/>
        <circle cx="20" cy="6" r="2.5" fill="white"/>
        <circle cx="4" cy="18" r="2.5" fill="white"/>
        <circle cx="20" cy="18" r="2.5" fill="white"/>
        <line x1="6.2" y1="7.3" x2="10.2" y2="10.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="17.8" y1="7.3" x2="13.8" y2="10.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="6.2" y1="16.7" x2="10.2" y2="13.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="17.8" y1="16.7" x2="13.8" y2="13.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Save to 6Degrees
    `
    fab.addEventListener("click", () => panelEl ? closePanel() : openPanel())
    shadow.appendChild(fab)
    fabEl = fab
  }

  function openPanel() {
    if (panelEl) return

    let p
    try {
      p = scrapeProfile()
    } catch (err) {
      console.error("[6Degrees] scrapeProfile error:", err)
      p = { profileUrl: "https://www.linkedin.com/in/" + slugFromUrl() + "/",
            firstName: humanizeSlug(slugFromUrl()).firstName,
            lastName: humanizeSlug(slugFromUrl()).lastName,
            headline: null, photoUrl: null, location: null, city: null, country: null,
            degree: null, commonConnections: null, sharedConnections: [], experience: [], education: [] }
    }
    currentProfile = p

    const shadow = getShadow()
    const panel = document.createElement("div")
    panel.id = "sd-panel"

    const avatarHtml = p.photoUrl
      ? `<img class="sd-avatar" src="${esc(p.photoUrl)}" />`
      : `<div class="sd-avatar-initials">${esc(initials(p.firstName, p.lastName))}</div>`

    const degreeBadge = p.degree ? `<span class="sd-badge">${esc(p.degree)}°</span>` : ""

    const mutualHtml = p.sharedConnections.length > 0
      ? p.sharedConnections.slice(0, 8).map((sc) => `<span class="sd-badge">${esc(sc.name)}</span>`).join("") +
        (p.sharedConnections.length > 8 ? `<span class="sd-empty"> +${p.sharedConnections.length - 8} more</span>` : "")
      : p.commonConnections
        ? `<span class="sd-empty">${p.commonConnections} mutual connection${p.commonConnections !== 1 ? "s" : ""}</span>`
        : null

    // Sub-line: "Position · Company" or just position or just company
    const subLine = [p.position, p.company].filter(Boolean).join(" · ")

    panel.innerHTML = `
      <div id="sd-panel-header">
        <h2>Save to 6Degrees</h2>
        <button id="sd-refresh" title="Re-scrape">↻</button>
        <button id="sd-close" title="Close">×</button>
      </div>
      <div id="sd-panel-body">
        <div class="sd-profile-header">
          ${avatarHtml}
          <div>
            <p class="sd-name">${esc((p.firstName ?? "") + " " + (p.lastName ?? "")).trim()}</p>
            ${subLine ? `<p class="sd-headline">${esc(subLine)}</p>` : ""}
            <div class="sd-meta">
              ${degreeBadge}
              ${p.location ? `<span>${esc(p.location)}</span>` : ""}
            </div>
          </div>
        </div>
        ${mutualHtml
          ? `<div class="sd-section"><p class="sd-section-title">Mutual connections</p>${mutualHtml}</div>`
          : ""}
        <p class="sd-empty" style="font-size:11px;margin-top:8px">Will be tagged <strong>Followed</strong></p>
      </div>
      <div id="sd-panel-footer">
        <button id="sd-save-btn">Save contact</button>
        <span id="sd-status"></span>
      </div>
    `

    shadow.appendChild(panel)
    panelEl = panel

    panel.querySelector("#sd-close").addEventListener("click", closePanel)
    panel.querySelector("#sd-save-btn").addEventListener("click", saveContact)
    panel.querySelector("#sd-refresh").addEventListener("click", () => {
      closePanel()
      openPanel()
    })
  }

  function closePanel() {
    panelEl?.remove()
    panelEl = null
  }

  async function saveContact() {
    const btn = panelEl?.querySelector("#sd-save-btn")
    const status = panelEl?.querySelector("#sd-status")
    if (!btn || !status) return

    btn.disabled = true
    btn.textContent = "Saving…"
    status.textContent = ""
    status.className = ""

    let result
    try {
      // Always tag contacts saved via the extension as "Followed"
      const payload = { ...currentProfile, addLabels: ["Followed"] }

      result = await Promise.race([
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "ENRICH_CONTACT", data: payload }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || "Extension messaging error"))
            } else {
              resolve(response)
            }
          })
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timed out — check API URL and token in the popup")), 15000)
        ),
      ])
    } catch (err) {
      result = { ok: false, error: err.message }
    }

    btn.disabled = false
    btn.textContent = "Save contact"

    if (result?.ok) {
      status.textContent = result.action === "created" ? "✓ Contact created!" : "✓ Contact updated!"
      status.className = "ok"
      setTimeout(closePanel, 1800)
    } else {
      status.textContent = result?.error || "Something went wrong"
      status.className = "err"
    }
  }

  // ─── Init & SPA navigation ────────────────────────────────────────────────────

  function init() {
    if (!window.location.pathname.startsWith("/in/")) return
    // Wait 3 seconds — LinkedIn's SPA lazily renders the profile sections and
    // the 1.5 s delay was too short for slower connections / large profiles.
    setTimeout(injectFab, 3000)
  }

  let lastPath = location.pathname
  new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname
      closePanel()
      fabEl?.remove()
      fabEl = null
      init()
    }
  }).observe(document.body, { childList: true, subtree: false })

  init()
})()

// ─── Following-page importer (runs when initFollowsImporter() is called) ──────
// Defined outside the main IIFE because the main IIFE returns early for
// non-profile pages; this function is invoked before that return.
function initFollowsImporter() {
  "use strict"

  // Inject a floating banner at the top of the LinkedIn following page.
  // Uses an inline <style> tag so it works even before shadow root is available.
  const banner = document.createElement("div")
  banner.id = "sd-follows-banner"
  banner.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483641",
    "background:#0A66C2", "color:#fff",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:14px", "font-weight:500",
    "display:flex", "align-items:center", "gap:12px",
    "padding:10px 20px", "box-shadow:0 2px 8px rgba(0,0,0,.25)",
  ].join(";")

  banner.innerHTML = `
    <span style="flex:1" id="sd-follows-msg">
      6Degrees · Import people you follow into your contacts
    </span>
    <button id="sd-follows-btn" style="
      background:#fff;color:#0A66C2;border:none;border-radius:8px;
      padding:6px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap
    ">Import follows</button>
    <button id="sd-follows-close" style="
      background:transparent;border:none;color:#fff;font-size:20px;
      cursor:pointer;line-height:1;padding:0 4px;opacity:.8
    ">×</button>
  `
  document.body.prepend(banner)
  document.body.style.paddingTop = "44px"

  banner.querySelector("#sd-follows-close").addEventListener("click", () => {
    banner.remove()
    document.body.style.paddingTop = ""
  })

  banner.querySelector("#sd-follows-btn").addEventListener("click", runImport)

  async function runImport() {
    const btn = document.getElementById("sd-follows-btn")
    const msg = document.getElementById("sd-follows-msg")
    if (!btn || !msg) return
    btn.disabled = true
    btn.textContent = "Scrolling…"

    // ── Step 1: auto-scroll to load all follows ──────────────────────────────
    msg.textContent = "Scrolling to load all follows…"
    await autoScrollFollows(msg)

    // ── Step 2: harvest all /in/ links ──────────────────────────────────────
    msg.textContent = "Collecting profiles…"
    const follows = harvestFollows()

    if (follows.length === 0) {
      msg.textContent = "⚠ No profiles found. Try scrolling manually first, then click again."
      btn.disabled = false
      btn.textContent = "Retry"
      return
    }

    // ── Step 3: send to 6Degrees API ─────────────────────────────────────────
    msg.textContent = `Importing ${follows.length} profiles…`
    btn.textContent = "Importing…"

    try {
      const { apiUrl, apiToken } = await new Promise((resolve) =>
        chrome.storage.local.get(["apiUrl", "apiToken"], resolve)
      )
      if (!apiUrl || !apiToken) {
        msg.textContent = "⚠ Not configured — open the 6Degrees extension popup and save your URL + token first."
        btn.disabled = false
        btn.textContent = "Retry"
        return
      }

      const res = await fetch(`${apiUrl}/api/linkedin/follows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ follows }),
      })

      if (res.status === 401) {
        msg.textContent = "⚠ Invalid token — regenerate it in 6Degrees Settings."
        btn.disabled = false; btn.textContent = "Retry"
        return
      }
      if (!res.ok) {
        msg.textContent = `⚠ Server error (${res.status}) — try again.`
        btn.disabled = false; btn.textContent = "Retry"
        return
      }

      const data = await res.json()
      msg.textContent = `✓ Done! ${data.created} new contacts, ${data.updated} updated (${follows.length} total)`
      btn.textContent = "Close"
      btn.disabled = false
      btn.addEventListener("click", () => {
        banner.remove()
        document.body.style.paddingTop = ""
      }, { once: true })
    } catch (err) {
      msg.textContent = `⚠ Network error — check your 6Degrees URL. (${err.message})`
      btn.disabled = false
      btn.textContent = "Retry"
    }
  }

  async function autoScrollFollows(msgEl) {
    return new Promise((resolve) => {
      let prevHeight = -1
      let stableRounds = 0

      function tick() {
        window.scrollTo(0, document.body.scrollHeight)
        const n = document.querySelectorAll('a[href*="/in/"]').length
        if (msgEl) msgEl.textContent = `Scrolling to load all follows… (${n} found so far)`
        const h = document.body.scrollHeight
        if (h === prevHeight) {
          stableRounds++
          if (stableRounds >= 3) { resolve(); return }
        } else {
          stableRounds = 0
        }
        prevHeight = h
        setTimeout(tick, 1800)
      }
      tick()
    })
  }

  function harvestFollows() {
    const seen = new Set()
    const follows = []

    for (const a of document.querySelectorAll('a[href*="/in/"]')) {
      const href = (a.href || "").split("?")[0].split("#")[0]
      const m = href.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
      if (!m) continue
      const slug = m[1]
      if (seen.has(slug)) continue

      // Skip the "Me" nav link (your own profile) and other nav elements
      if (a.closest("nav, header, #global-nav, .global-nav")) continue

      // Name: LinkedIn consistently puts visible text in span[aria-hidden="true"]
      const nameEl = a.querySelector("span[aria-hidden='true']") ||
                     a.querySelector("span:not([class*='visually-hidden'])") ||
                     a
      const full = (nameEl.textContent || "").trim().replace(/\s+/g, " ")
      if (!full || full.length > 80 || full.toLowerCase().includes("linkedin")) continue

      const parts = full.split(/\s+/).filter(Boolean)
      if (parts.length === 0) continue

      seen.add(slug)

      const profileUrl = `https://www.linkedin.com/in/${slug}/`
      const firstName = parts[0]
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null

      // Headline: look in the surrounding card for a subtitle line
      const card = a.closest("li, article, [class*='result'], [class*='card'], [class*='member']")
      let headline = null
      if (card) {
        for (const el of card.querySelectorAll("span[aria-hidden='true'], div, p")) {
          if (el === nameEl || nameEl.contains(el) || a.contains(el)) continue
          const t = (el.textContent || "").trim().replace(/\s+/g, " ")
          if (
            t.length > 5 && t.length < 150 &&
            !t.toLowerCase().includes("follow") &&
            !t.toLowerCase().includes("connect") &&
            !t.toLowerCase().includes("message") &&
            !t.includes("·")
          ) {
            headline = t
            break
          }
        }
      }

      follows.push({ profileUrl, firstName, lastName, headline })
    }

    return follows
  }
}
