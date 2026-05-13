;(function () {
  "use strict"

  if (!window.location.pathname.startsWith("/in/")) return

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
      "main h1",
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
    console.debug("[6Degrees] name not found via selectors, falling back to URL slug")
    return humanizeSlug(slugFromUrl())
  }

  function scrapePhoto() {
    const img = q([
      ".pv-top-card-profile-picture__image--show",
      "img[data-anonymize='headshot-photo']",
      ".profile-photo-edit__preview",
      ".pv-top-card__photo img",
      "section.artdeco-card img.EntityPhoto-circle-9",
    ])
    if (!img) return null
    const src = img.src || img.getAttribute("data-delayed-url") || ""
    return src && !src.includes("ghost") && !src.includes("placeholder") ? src : null
  }

  function scrapeHeadline() {
    return text([
      ".text-body-medium.break-words",
      "[data-field='headline']",
      ".pv-top-card--list .text-body-medium",
    ])
  }

  function scrapeLocation() {
    const candidates = document.querySelectorAll(".text-body-small")
    for (const el of candidates) {
      const t = (el.textContent ?? "").trim()
      if (
        t && t.length > 2 && t.length < 100 &&
        !t.includes("1st") && !t.includes("2nd") && !t.includes("3rd") &&
        (t.includes(",") || /Area|Region|Greater|France|Germany|Spain|Italy|UK|US|Canada/.test(t) || t.split(" ").length <= 4)
      ) return t
    }
    return text([".pv-top-card--list-bullet li", "[data-field='location']"])
  }

  function scrapeConnectionDegree() {
    const el = q([".dist-value", ".pv-member-badge span[aria-hidden='true']", ".distance-badge span[aria-hidden='true']"])
    if (!el) return null
    const t = el.textContent.trim()
    const m = t.match(/([123])/)
    return m ? m[1] : null
  }

  function scrapeMutualConnections() {
    for (const a of document.querySelectorAll("a")) {
      const t = (a.textContent ?? "").trim()
      if (t.includes("mutual connection")) {
        const m = t.match(/(\d+)/)
        return m ? parseInt(m[1]) : null
      }
    }
    return null
  }

  function scrapeSharedConnections() {
    const results = []
    const section = [...document.querySelectorAll("section")].find(
      (s) => s.textContent.includes("mutual connection")
    )
    if (!section) return results
    section.querySelectorAll("a[href*='/in/']").forEach((a) => {
      const name = (a.querySelector("span[aria-hidden='true']")?.textContent ?? a.textContent).trim()
      const profileUrl = a.href.split("?")[0]
      if (name && profileUrl.includes("/in/")) results.push({ name, profileUrl })
    })
    return results
  }

  function scrapeSection(id, heading) {
    return (
      document.getElementById(id) ??
      [...document.querySelectorAll("section")].find(
        (s) => s.querySelector("h2")?.textContent?.trim().toLowerCase().includes(heading.toLowerCase())
      ) ??
      null
    )
  }

  function parseDateRange(str) {
    if (!str) return null
    const cleaned = str.replace(/·.*$/, "").trim()
    const parts = cleaned.split(/–|—/)
    return { start: parts[0]?.trim() || null, end: parts[1]?.trim() || null }
  }

  function scrapeExperience() {
    const section = scrapeSection("experience", "Experience")
    if (!section) return []
    const items = []
    const durationRe = /yr|mo|Present/i
    const dateStartRe = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})/

    section.querySelectorAll("li.artdeco-list__item, li[class*='pvs-list__item']").forEach((li) => {
      const allSpans = [...li.querySelectorAll("span[aria-hidden='true']")]
        .map((s) => s.textContent.trim()).filter(Boolean)
      const dateSpans = allSpans.filter((s) => durationRe.test(s) || dateStartRe.test(s))
      const textSpans = allSpans.filter((s) => !durationRe.test(s) && !dateStartRe.test(s) && s.length > 1)
      if (textSpans.length === 0) return

      const nested = li.querySelectorAll("li.artdeco-list__item, li[class*='pvs-list__item']")
      if (nested.length > 0) {
        const company = textSpans[0]
        nested.forEach((role) => {
          const rs = [...role.querySelectorAll("span[aria-hidden='true']")].map((s) => s.textContent.trim()).filter(Boolean)
          const rd = rs.filter((s) => durationRe.test(s) || dateStartRe.test(s))
          const rt = rs.filter((s) => !durationRe.test(s) && !dateStartRe.test(s) && s.length > 1)
          if (rt[0]) items.push({ title: rt[0], company, location: rt[2] ?? null, ...parseDateRange(rd[0]) })
        })
      } else {
        items.push({
          title: textSpans[0],
          company: textSpans[1] ?? null,
          location: textSpans[2] ?? null,
          ...parseDateRange(dateSpans[0]),
        })
      }
    })
    return items.filter((e) => e.title)
  }

  function scrapeEducation() {
    const section = scrapeSection("education", "Education")
    if (!section) return []
    const items = []
    section.querySelectorAll("li.artdeco-list__item, li[class*='pvs-list__item']").forEach((li) => {
      const allSpans = [...li.querySelectorAll("span[aria-hidden='true']")].map((s) => s.textContent.trim()).filter(Boolean)
      const yearRe = /^\d{4}/
      const dateSpans = allSpans.filter((s) => yearRe.test(s) && s.length < 20)
      const textSpans = allSpans.filter((s) => !(yearRe.test(s) && s.length < 20) && s.length > 1)
      if (textSpans.length === 0) return
      items.push({ school: textSpans[0], degree: textSpans[1] ?? null, field: textSpans[2] ?? null, ...parseDateRange(dateSpans[0]) })
    })
    return items.filter((e) => e.school)
  }

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
    const profileUrl = "https://www.linkedin.com/in/" + slugFromUrl() + "/"

    const profile = {
      profileUrl,
      firstName,
      lastName,
      headline: scrapeHeadline(),
      photoUrl: scrapePhoto(),
      location,
      city,
      country,
      degree: scrapeConnectionDegree(),
      commonConnections: scrapeMutualConnections(),
      sharedConnections: scrapeSharedConnections(),
      experience: scrapeExperience(),
      education: scrapeEducation(),
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

    const expHtml = p.experience.length > 0
      ? `<ul class="sd-list">${p.experience.map((e) => `
          <li>
            <span class="sd-list-title">${esc(e.title ?? "")}</span>
            ${e.company ? `<span class="sd-list-sub">${esc(e.company)}</span>` : ""}
            ${e.start ? `<span class="sd-list-sub">${esc(e.start)}${e.end ? " – " + esc(e.end) : ""}</span>` : ""}
          </li>`).join("")}</ul>`
      : `<p class="sd-empty">Not found — scroll the full profile first</p>`

    const eduHtml = p.education.length > 0
      ? `<ul class="sd-list">${p.education.map((e) => `
          <li>
            <span class="sd-list-title">${esc(e.school ?? "")}</span>
            ${e.degree ? `<span class="sd-list-sub">${esc(e.degree)}${e.field ? " · " + esc(e.field) : ""}</span>` : ""}
            ${e.start ? `<span class="sd-list-sub">${esc(e.start)}${e.end ? " – " + esc(e.end) : ""}</span>` : ""}
          </li>`).join("")}</ul>`
      : `<p class="sd-empty">Not found — scroll the full profile first</p>`

    const mutualHtml = p.sharedConnections.length > 0
      ? p.sharedConnections.slice(0, 8).map((sc) => `<span class="sd-badge">${esc(sc.name)}</span>`).join("") +
        (p.sharedConnections.length > 8 ? `<span class="sd-empty"> +${p.sharedConnections.length - 8} more</span>` : "")
      : p.commonConnections
        ? `<span class="sd-empty">${p.commonConnections} mutual (scroll profile to load names)</span>`
        : `<span class="sd-empty">None found</span>`

    panel.innerHTML = `
      <div id="sd-panel-header">
        <h2>Save to 6Degrees</h2>
        <button id="sd-close" title="Close">×</button>
      </div>
      <div id="sd-panel-body">
        <div class="sd-profile-header">
          ${avatarHtml}
          <div>
            <p class="sd-name">${esc((p.firstName ?? "") + " " + (p.lastName ?? "")).trim()}</p>
            ${p.headline ? `<p class="sd-headline">${esc(p.headline)}</p>` : ""}
            <div class="sd-meta">${degreeBadge}${p.location ? esc(p.location) : ""}${p.commonConnections != null ? ` · ${p.commonConnections} mutual` : ""}</div>
          </div>
        </div>
        <div class="sd-section"><p class="sd-section-title">Experience</p>${expHtml}</div>
        <div class="sd-section"><p class="sd-section-title">Education</p>${eduHtml}</div>
        <div class="sd-section"><p class="sd-section-title">Mutual connections</p>${mutualHtml}</div>
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

    const result = await new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: "ENRICH_CONTACT", data: currentProfile }, resolve)
    )

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
    setTimeout(injectFab, 1500)
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
