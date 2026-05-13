;(function () {
  "use strict"

  if (!window.location.pathname.startsWith("/in/")) return

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function q(selectors, root = document) {
    for (const sel of selectors) {
      const el = root.querySelector(sel)
      if (el) return el
    }
    return null
  }

  function text(selectors, root = document) {
    const el = q(selectors, root)
    return el ? el.textContent.trim() : null
  }

  function waitFor(selector, timeout = 8000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector)
      if (el) return resolve(el)
      const t = setTimeout(() => { observer.disconnect(); resolve(null) }, timeout)
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector)
        if (found) { clearTimeout(t); observer.disconnect(); resolve(found) }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
  }

  // ─── Scraper ─────────────────────────────────────────────────────────────────

  function scrapeName() {
    const el = q(["h1.text-heading-xlarge", "h1[data-anonymize='name']", ".pv-top-card h1"])
    if (!el) return { firstName: null, lastName: null }
    const full = el.textContent.trim()
    const parts = full.split(/\s+/)
    return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null }
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
    // Exclude placeholder/ghost images
    return src.includes("ghost") || src.includes("placeholder") ? null : src
  }

  function scrapeHeadline() {
    return text([
      ".text-body-medium.break-words",
      "[data-field='headline']",
      ".pv-top-card--list .text-body-medium",
    ])
  }

  function scrapeLocation() {
    // Location is typically the first .text-body-small that isn't a distance indicator
    const candidates = document.querySelectorAll(".text-body-small")
    for (const el of candidates) {
      const t = el.textContent.trim()
      if (t && !t.includes("1st") && !t.includes("2nd") && !t.includes("3rd") && t.length > 2 && t.length < 100) {
        // Heuristic: location text tends to contain commas or common geographic terms
        if (/,|Area|Region|Greater|Metropolitan|Province|County|State|France|US|UK|Germany|Spain|Italy/.test(t) || t.split(" ").length <= 5) {
          return t
        }
      }
    }
    return text([".pv-top-card--list-bullet li", "[data-field='location']"])
  }

  function scrapeConnectionDegree() {
    const degreeEl = q([".dist-value", ".pv-member-badge--member .visually-hidden"])
    if (degreeEl) {
      const t = degreeEl.textContent.trim()
      const m = t.match(/(\d+)/)
      return m ? m[1] : null
    }
    // Look for "1st", "2nd", "3rd" text near the name
    const badge = q([
      ".pv-member-badge span[aria-hidden='true']",
      ".distance-badge span[aria-hidden='true']",
    ])
    return badge ? badge.textContent.replace(/[^123]/g, "") : null
  }

  function scrapeMutualConnections() {
    const links = document.querySelectorAll("a")
    for (const a of links) {
      const t = a.textContent.trim()
      if (t.includes("mutual connection")) {
        const m = t.match(/(\d+)/)
        return m ? parseInt(m[1]) : null
      }
    }
    return null
  }

  function scrapeSharedConnections() {
    const results = []
    // LinkedIn sometimes lists mutual connections in a section
    const section = [...document.querySelectorAll("section")].find(
      (s) => s.textContent.includes("mutual connection")
    )
    if (!section) return results

    section.querySelectorAll("a[href*='/in/']").forEach((a) => {
      const name = a.querySelector("span[aria-hidden='true']")?.textContent?.trim() ||
                   a.textContent.trim()
      const profileUrl = a.href.split("?")[0]
      if (name && profileUrl.includes("/in/")) {
        results.push({ name, profileUrl })
      }
    })
    return results
  }

  function scrapeSection(sectionId, headingText) {
    // Try id first
    let section = document.getElementById(sectionId)
    if (!section) {
      // Fall back to finding by heading text
      section = [...document.querySelectorAll("section")].find((s) => {
        const h = s.querySelector("h2")
        return h && h.textContent.trim().toLowerCase().includes(headingText.toLowerCase())
      })
    }
    return section
  }

  function scrapeExperience() {
    const section = scrapeSection("experience", "Experience")
    if (!section) return []
    const items = []

    section.querySelectorAll("li.artdeco-list__item, li[class*='profile-section-card']").forEach((li) => {
      // Check if this is a grouped company (multiple roles under one employer)
      const allSpans = [...li.querySelectorAll("span[aria-hidden='true']")].map((s) => s.textContent.trim()).filter(Boolean)

      // Date/duration pattern: "Month YYYY – Month YYYY · X yrs Y mos"
      const datePattern = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})/
      const durationPattern = /yr|mo|Present/i

      const dateSpans = allSpans.filter((s) => durationPattern.test(s) || datePattern.test(s))
      const textSpans = allSpans.filter((s) => !durationPattern.test(s) && !datePattern.test(s) && s.length > 1)

      if (textSpans.length === 0) return

      // Determine if grouped (company at top, roles below)
      const nestedRoles = li.querySelectorAll("li.artdeco-list__item, li[class*='pvs-list__item']")
      if (nestedRoles.length > 0) {
        // Grouped: first textSpan is company, nested items are individual roles
        const company = textSpans[0]
        nestedRoles.forEach((role) => {
          const roleSpans = [...role.querySelectorAll("span[aria-hidden='true']")].map((s) => s.textContent.trim()).filter(Boolean)
          const roleDates = roleSpans.filter((s) => durationPattern.test(s) || datePattern.test(s))
          const roleTexts = roleSpans.filter((s) => !durationPattern.test(s) && !datePattern.test(s) && s.length > 1)
          items.push({
            title: roleTexts[0] ?? null,
            company,
            location: roleTexts[2] ?? null,
            start: parseDateRange(roleDates[0])?.start ?? null,
            end: parseDateRange(roleDates[0])?.end ?? null,
          })
        })
      } else {
        // Single role
        items.push({
          title: textSpans[0] ?? null,
          company: textSpans[1] ?? null,
          location: textSpans[2] ?? null,
          start: parseDateRange(dateSpans[0])?.start ?? null,
          end: parseDateRange(dateSpans[0])?.end ?? null,
        })
      }
    })

    return items.filter((e) => e.title)
  }

  function scrapeEducation() {
    const section = scrapeSection("education", "Education")
    if (!section) return []
    const items = []

    section.querySelectorAll("li.artdeco-list__item, li[class*='profile-section-card']").forEach((li) => {
      const allSpans = [...li.querySelectorAll("span[aria-hidden='true']")].map((s) => s.textContent.trim()).filter(Boolean)
      const durationPattern = /\d{4}/
      const dateSpans = allSpans.filter((s) => durationPattern.test(s) && s.length < 20)
      const textSpans = allSpans.filter((s) => !(durationPattern.test(s) && s.length < 20) && s.length > 1)

      if (textSpans.length === 0) return

      const dateRange = parseDateRange(dateSpans[0])
      items.push({
        school: textSpans[0] ?? null,
        degree: textSpans[1] ?? null,
        field: textSpans[2] ?? null,
        start: dateRange?.start ?? null,
        end: dateRange?.end ?? null,
      })
    })

    return items.filter((e) => e.school)
  }

  function parseDateRange(str) {
    if (!str) return null
    // "Jan 2020 – Present · 4 yrs" or "2020 – 2024"
    const cleaned = str.replace(/·.*$/, "").trim()
    const parts = cleaned.split(/–|—|-/)
    return {
      start: parts[0]?.trim() || null,
      end: parts[1]?.trim() || null,
    }
  }

  function extractCityCountry(location) {
    if (!location) return { city: null, country: null }
    const parts = location.split(",").map((p) => p.trim())
    if (parts.length >= 2) {
      return { city: parts[0], country: parts[parts.length - 1] }
    }
    return { city: null, country: location }
  }

  function scrapeProfile() {
    const { firstName, lastName } = scrapeName()
    const location = scrapeLocation()
    const { city, country } = extractCityCountry(location)
    const degree = scrapeConnectionDegree()
    const commonConnections = scrapeMutualConnections()
    const sharedConnections = scrapeSharedConnections()
    const experience = scrapeExperience()
    const education = scrapeEducation()

    return {
      profileUrl: window.location.href.split("?")[0].replace(/\/$/, "") + "/",
      firstName,
      lastName,
      headline: scrapeHeadline(),
      photoUrl: scrapePhoto(),
      location,
      city,
      country,
      degree,
      commonConnections,
      sharedConnections,
      experience,
      education,
    }
  }

  // ─── UI ──────────────────────────────────────────────────────────────────────

  const STYLES = `
    #sd-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483640;
      background: #0A66C2;
      color: #fff;
      border-radius: 24px;
      padding: 9px 16px;
      font-size: 13px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(10,102,194,0.4);
      display: flex;
      align-items: center;
      gap: 8px;
      user-select: none;
      border: none;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    #sd-fab:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(10,102,194,0.5); }
    #sd-fab:active { transform: translateY(0); }

    #sd-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 360px;
      background: #fff;
      box-shadow: -4px 0 24px rgba(0,0,0,0.15);
      z-index: 2147483641;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
    }
    #sd-panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    #sd-panel-header h2 {
      font-size: 15px;
      font-weight: 700;
      color: #1a1a1a;
      margin: 0;
    }
    #sd-close {
      width: 28px; height: 28px;
      border-radius: 8px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 18px;
      color: #888;
      display: flex; align-items: center; justify-content: center;
    }
    #sd-close:hover { background: #f4f4f4; color: #444; }
    #sd-panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }
    .sd-profile-header {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .sd-avatar {
      width: 56px; height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0A66C2, #004182);
      flex-shrink: 0;
      object-fit: cover;
    }
    .sd-avatar-initials {
      width: 56px; height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0A66C2, #004182);
      flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 18px; font-weight: 700;
    }
    .sd-name { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0 0 2px; }
    .sd-headline { font-size: 12px; color: #666; margin: 0; line-height: 1.4; }
    .sd-meta { font-size: 11px; color: #888; margin-top: 4px; }

    .sd-section { margin-bottom: 14px; }
    .sd-section-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
      margin: 0 0 8px;
    }
    .sd-list { list-style: none; padding: 0; margin: 0; }
    .sd-list li {
      font-size: 12px;
      color: #444;
      padding: 6px 0;
      border-bottom: 1px solid #f4f4f4;
      line-height: 1.4;
    }
    .sd-list li:last-child { border-bottom: none; }
    .sd-list-title { font-weight: 600; color: #1a1a1a; font-size: 12px; }
    .sd-list-sub { color: #666; font-size: 11px; }
    .sd-badge {
      display: inline-block;
      background: #EBF3FF;
      color: #0A66C2;
      border-radius: 12px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
      margin-right: 4px;
    }
    .sd-empty { color: #aaa; font-size: 12px; font-style: italic; }

    #sd-panel-footer {
      padding: 14px 20px;
      border-top: 1px solid #f0f0f0;
      flex-shrink: 0;
    }
    #sd-save-btn {
      width: 100%;
      background: #0A66C2;
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 11px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    #sd-save-btn:hover { background: #004182; }
    #sd-save-btn:disabled { background: #7ab0e0; cursor: not-allowed; }
    #sd-status {
      margin-top: 8px;
      font-size: 12px;
      text-align: center;
      min-height: 16px;
    }
    #sd-status.ok { color: #16a34a; }
    #sd-status.err { color: #dc2626; }
  `

  function injectStyles() {
    if (document.getElementById("sd-styles")) return
    const style = document.createElement("style")
    style.id = "sd-styles"
    style.textContent = STYLES
    document.head.appendChild(style)
  }

  function initials(first, last) {
    return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase()
  }

  let panelEl = null
  let fabEl = null
  let currentProfile = null

  function openPanel() {
    if (panelEl) return
    currentProfile = scrapeProfile()
    const p = currentProfile

    const panel = document.createElement("div")
    panel.id = "sd-panel"

    // Degree badge
    const degreeBadge = p.degree ? `<span class="sd-badge">${p.degree}°</span>` : ""

    // Avatar
    const avatarHtml = p.photoUrl
      ? `<img class="sd-avatar" src="${escHtml(p.photoUrl)}" />`
      : `<div class="sd-avatar-initials">${escHtml(initials(p.firstName, p.lastName))}</div>`

    // Experience
    const expHtml = p.experience.length > 0
      ? `<ul class="sd-list">${p.experience.map((e) => `
          <li>
            <div class="sd-list-title">${escHtml(e.title ?? "")}</div>
            ${e.company ? `<div class="sd-list-sub">${escHtml(e.company)}</div>` : ""}
            ${e.start ? `<div class="sd-list-sub">${escHtml(e.start)}${e.end ? " – " + escHtml(e.end) : ""}</div>` : ""}
          </li>`).join("")}</ul>`
      : `<p class="sd-empty">Not found</p>`

    // Education
    const eduHtml = p.education.length > 0
      ? `<ul class="sd-list">${p.education.map((e) => `
          <li>
            <div class="sd-list-title">${escHtml(e.school ?? "")}</div>
            ${e.degree ? `<div class="sd-list-sub">${escHtml(e.degree)}${e.field ? " · " + escHtml(e.field) : ""}</div>` : ""}
            ${e.start ? `<div class="sd-list-sub">${escHtml(e.start)}${e.end ? " – " + escHtml(e.end) : ""}</div>` : ""}
          </li>`).join("")}</ul>`
      : `<p class="sd-empty">Not found</p>`

    // Mutual connections
    const mutualHtml = p.sharedConnections.length > 0
      ? p.sharedConnections.slice(0, 8).map((sc) =>
          `<span class="sd-badge">${escHtml(sc.name)}</span>`).join("") +
        (p.sharedConnections.length > 8 ? `<span class="sd-empty"> +${p.sharedConnections.length - 8} more</span>` : "")
      : p.commonConnections
        ? `<span class="sd-empty">${p.commonConnections} mutual (names not loaded)</span>`
        : `<span class="sd-empty">None found</span>`

    panel.innerHTML = `
      <div id="sd-panel-header">
        <h2>Save to 6Degrees</h2>
        <button id="sd-close">×</button>
      </div>
      <div id="sd-panel-body">
        <div class="sd-profile-header">
          ${avatarHtml}
          <div>
            <p class="sd-name">${escHtml((p.firstName ?? "") + " " + (p.lastName ?? ""))}</p>
            ${p.headline ? `<p class="sd-headline">${escHtml(p.headline)}</p>` : ""}
            <div class="sd-meta">
              ${degreeBadge}
              ${p.location ? escHtml(p.location) : ""}
              ${p.commonConnections != null ? ` · ${p.commonConnections} mutual` : ""}
            </div>
          </div>
        </div>

        <div class="sd-section">
          <p class="sd-section-title">Experience</p>
          ${expHtml}
        </div>

        <div class="sd-section">
          <p class="sd-section-title">Education</p>
          ${eduHtml}
        </div>

        <div class="sd-section">
          <p class="sd-section-title">Mutual connections</p>
          ${mutualHtml}
        </div>
      </div>
      <div id="sd-panel-footer">
        <button id="sd-save-btn">Save contact</button>
        <div id="sd-status"></div>
      </div>
    `

    document.body.appendChild(panel)
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

  function escHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  }

  function injectFab() {
    if (fabEl) return
    injectStyles()

    const fab = document.createElement("button")
    fab.id = "sd-fab"
    fab.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

    fab.addEventListener("click", () => {
      if (panelEl) closePanel()
      else openPanel()
    })

    document.body.appendChild(fab)
    fabEl = fab
  }

  // ─── Init & SPA navigation ────────────────────────────────────────────────────

  function init() {
    if (!window.location.pathname.startsWith("/in/")) return
    setTimeout(injectFab, 2000)
  }

  // Handle LinkedIn's SPA navigation via URL changes
  let lastPath = location.pathname
  const navObserver = new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname
      closePanel()
      fabEl?.remove()
      fabEl = null
      init()
    }
  })
  navObserver.observe(document.body, { childList: true, subtree: false })

  init()
})()
