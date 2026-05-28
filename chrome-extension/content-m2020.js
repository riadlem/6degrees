;(function () {
  "use strict"

  // ─── Network interception (must run early) ────────────────────────────────────
  // We wrap fetch/XHR before the page's own JS runs to intercept speaker API data.
  // This fires even at document_idle because the speakers are usually loaded lazily
  // after the initial render (triggered by scroll or component mount).

  const _capturedSpeakers = []   // accumulated from API intercepts
  let   _domSpeakers      = []   // accumulated from DOM scraping

  function tryExtractSpeakersFromJson(url, data) {
    if (!data || typeof data !== "object") return

    // Walk the JSON looking for arrays of person-like objects
    function walk(obj, depth) {
      if (depth > 6) return
      if (Array.isArray(obj)) {
        if (obj.length >= 3 && obj.every(isSpeakerLike)) {
          obj.forEach((s) => {
            const spk = normalizeApiSpeaker(s)
            if (spk) _capturedSpeakers.push(spk)
          })
          return
        }
        obj.forEach((item) => walk(item, depth + 1))
      } else if (obj && typeof obj === "object") {
        Object.values(obj).forEach((v) => walk(v, depth + 1))
      }
    }

    walk(data, 0)
  }

  function isSpeakerLike(obj) {
    if (!obj || typeof obj !== "object") return false
    const keys = Object.keys(obj).map((k) => k.toLowerCase())
    const nameHints  = ["name", "firstname", "first_name", "fullname", "full_name", "displayname"]
    const titleHints = ["title", "role", "position", "jobtitle", "job_title", "headline"]
    const hasName  = nameHints.some((h)  => keys.some((k) => k.includes(h)))
    const hasTitle = titleHints.some((h) => keys.some((k) => k.includes(h)))
    return hasName && hasTitle
  }

  function pick(obj, ...candidates) {
    for (const key of candidates) {
      for (const k of Object.keys(obj)) {
        if (k.toLowerCase() === key.toLowerCase() && obj[k]) return String(obj[k])
      }
    }
    return null
  }

  function normalizeApiSpeaker(obj) {
    const fullName = pick(obj, "name", "fullName", "full_name", "displayName", "display_name")
    let firstName  = pick(obj, "firstName", "first_name", "forename")
    let lastName   = pick(obj, "lastName",  "last_name",  "surname", "familyName", "family_name")

    if (!firstName && !lastName && fullName) {
      const parts = fullName.trim().split(/\s+/)
      firstName = parts[0]
      lastName  = parts.slice(1).join(" ")
    }
    if (!firstName) return null

    const role        = pick(obj, "title", "role", "position", "jobTitle", "job_title", "headline")
    const company     = pick(obj, "company", "companyName", "company_name", "organization", "employer", "worksFor")
    const description = pick(obj, "bio", "biography", "description", "about", "summary")
    const sessionTopic= pick(obj, "session", "sessionTitle", "panel", "topic", "talk", "presentation")
    const photoUrl    = pick(obj, "photo", "photoUrl", "photo_url", "image", "imageUrl", "avatar", "picture", "headshot")
    const linkedinUrl = pick(obj, "linkedin", "linkedinUrl", "linkedin_url", "linkedIn", "social_linkedin")

    return { firstName, lastName: lastName || "", role, company, description, sessionTopic, photoUrl, linkedinUrl }
  }

  // Wrap window.fetch
  const _origFetch = window.fetch
  window.fetch = async function (...args) {
    const res = await _origFetch.apply(this, args)
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0]?.url ?? "")
      const clone = res.clone()
      clone.json().then((data) => tryExtractSpeakersFromJson(url, data)).catch(() => {})
    } catch {}
    return res
  }

  // Wrap XHR
  const _origOpen = XMLHttpRequest.prototype.open
  const _origSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (method, url) {
    this._sd_url = url
    return _origOpen.apply(this, arguments)
  }
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", () => {
      try {
        const data = JSON.parse(this.responseText)
        tryExtractSpeakersFromJson(this._sd_url, data)
      } catch {}
    })
    return _origSend.apply(this, arguments)
  }

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
          padding: "7px 14px",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: "600",
          fontFamily: "inherit",
          ...style,
        })
        btn.addEventListener("click", onClick)
        row.appendChild(btn)
      }
      banner.appendChild(row)
    }
  }

  function hideBanner() {
    _bannerEl?.remove()
    _bannerEl = null
  }

  // ─── DOM scraper ──────────────────────────────────────────────────────────────

  function extractLiKey(url) {
    const m = url?.match(/linkedin\.com\/in\/([^/?#]+)/)
    return m ? m[1].toLowerCase() : null
  }

  function splitRoleCompany(text) {
    if (!text) return { role: null, company: null }
    const m = text.match(/^(.+?)\s+(?:at|@|,|–|-|·)\s+(.+)$/i)
    if (m) return { role: m[1].trim(), company: m[2].trim() }
    return { role: text.trim(), company: null }
  }

  // Find the dominant repeated container by counting tagName+className combos
  function findDominantCard() {
    const counts = {}
    const elements = document.querySelectorAll("*")
    for (const el of elements) {
      if (!el.className || typeof el.className !== "string") continue
      const cls = el.className.trim().split(/\s+/).filter((c) => c.length > 3 && c.length < 50).join(" ")
      if (!cls) continue
      const key = el.tagName + "|" + cls
      counts[key] = (counts[key] || 0) + 1
    }
    // Find class combos that appear 8-500 times — likely speaker cards
    return Object.entries(counts)
      .filter(([, n]) => n >= 6 && n <= 600)
      .sort((a, b) => {
        // Prefer elements whose count looks like a "reasonable" speaker count
        const scoreA = Math.abs(b[1] - 50) // penalise counts far from 50
        const scoreB = Math.abs(a[1] - 50)
        return scoreA - scoreB
      })
      .slice(0, 5)
      .map(([key, count]) => ({ key, count, tag: key.split("|")[0], cls: key.split("|").slice(1).join("|") }))
  }

  // Generic person-card heuristic: element contains a name-like heading + role text
  const NAME_RE   = /^[A-ZÁÀÂÄÉÈÊËÍÌÏÓÒÔÖÚÙÛÜ][a-záàâäéèêëíìïóòôöúùûü'-]+ [A-ZÁÀÂÄÉÈÊËÍÌÏÓÒÔÖÚÙÛÜ]/
  const TITLE_RE  = /\b(CEO|CTO|CFO|COO|VP|Director|Head|President|Founder|Partner|Manager|Officer|Lead|Principal|MD|General|Chief|Senior|Global|Regional)\b/i

  function scoreCard(el) {
    const text = el.textContent || ""
    const hasName  = NAME_RE.test(text.trim())
    const hasTitle = TITLE_RE.test(text)
    const hasImg   = !!el.querySelector("img")
    const hasLi    = !!el.querySelector('a[href*="linkedin.com"]')
    return (hasName ? 3 : 0) + (hasTitle ? 2 : 0) + (hasImg ? 1 : 0) + (hasLi ? 2 : 0)
  }

  function extractFromCard(card) {
    // Name: first heading, or element with name-like class
    const nameEl =
      card.querySelector("h1,h2,h3,h4,h5,h6") ||
      card.querySelector('[class*="name"i],[class*="speaker"i],[class*="person"i]') ||
      null

    const nameText = nameEl?.textContent?.trim()
    if (!nameText || !NAME_RE.test(nameText)) return null

    const parts     = nameText.split(/\s+/)
    const firstName = parts[0]
    const lastName  = parts.slice(1).join(" ")

    // Role + company: look for elements after the name
    let role = null, company = null
    const siblings = Array.from(card.querySelectorAll("p,span,div"))
    for (const el of siblings) {
      if (el === nameEl || el.contains(nameEl)) continue
      const t = el.textContent?.trim()
      if (!t || t.length > 120 || t === nameText) continue
      if (TITLE_RE.test(t)) {
        const split = splitRoleCompany(t)
        role    = split.role
        company = split.company
        break
      }
    }

    // Company fallback: element with company/org in class
    if (!company) {
      const compEl = card.querySelector('[class*="company"i],[class*="org"i],[class*="employer"i]')
      company = compEl?.textContent?.trim() || null
    }

    // LinkedIn
    const liLink    = card.querySelector('a[href*="linkedin.com/in/"]')
    const linkedinUrl = liLink?.href || null

    // Photo
    const img      = card.querySelector("img")
    const photoUrl = img?.src?.startsWith("http") && !img.src.includes("logo") ? img.src : null

    // Session
    const sessEl   = card.querySelector('[class*="session"i],[class*="topic"i],[class*="panel"i],[class*="talk"i]')
    const sessionTopic = sessEl?.textContent?.trim() || null

    // Description
    const bioEl    = card.querySelector('[class*="bio"i],[class*="description"i],[class*="about"i]')
    const description = bioEl?.textContent?.trim() || null

    return { firstName, lastName, role, company, description, sessionTopic, linkedinUrl, photoUrl }
  }

  function scrapeDOM() {
    const speakers = []
    const seen = new Set()

    // 1. Explicit speaker containers
    const explicitSels = [
      '[class*="speaker"i]',
      '[class*="Speaker"i]',
      '[data-component*="speaker"i]',
      '[data-testid*="speaker"i]',
      '[class*="presenter"i]',
      '[class*="panelist"i]',
    ]
    for (const sel of explicitSels) {
      const cards = document.querySelectorAll(sel)
      if (cards.length < 3) continue
      for (const card of cards) {
        const s = extractFromCard(card)
        if (s && !seen.has(`${s.firstName}|${s.lastName}`)) {
          seen.add(`${s.firstName}|${s.lastName}`)
          speakers.push(s)
        }
      }
      if (speakers.length > 0) return speakers
    }

    // 2. LinkedIn-link traversal
    const liLinks = document.querySelectorAll('a[href*="linkedin.com/in/"]')
    for (const link of liLinks) {
      let card = link.parentElement
      for (let i = 0; i < 10; i++) {
        if (!card?.parentElement) break
        card = card.parentElement
        const r = card.getBoundingClientRect()
        if (r.height > 80 && r.height < 900 && r.width > 100) break
      }
      if (!card) continue
      const s = extractFromCard(card)
      if (s && !seen.has(`${s.firstName}|${s.lastName}`)) {
        seen.add(`${s.firstName}|${s.lastName}`)
        s.linkedinUrl = link.href
        speakers.push(s)
      }
    }
    if (speakers.length > 0) return speakers

    // 3. Dominant-card heuristic
    const dominant = findDominantCard()
    for (const { tag, cls } of dominant) {
      const clsParts = cls.split(" ").filter((c) => c.length > 3)
      if (!clsParts.length) continue
      const sel = `${tag}.${clsParts[0]}`
      const cards = document.querySelectorAll(sel)
      if (cards.length < 3) continue
      const scored = Array.from(cards).map((c) => ({ c, score: scoreCard(c) })).filter((x) => x.score >= 3)
      for (const { c } of scored) {
        const s = extractFromCard(c)
        if (s && !seen.has(`${s.firstName}|${s.lastName}`)) {
          seen.add(`${s.firstName}|${s.lastName}`)
          speakers.push(s)
        }
      }
      if (speakers.length > 0) return speakers
    }

    return speakers
  }

  // ─── Auto-scroll ──────────────────────────────────────────────────────────────

  async function autoScroll() {
    return new Promise((resolve) => {
      const maxScroll = document.body.scrollHeight
      let pos = 0
      const step = Math.max(400, Math.round(window.innerHeight * 0.8))
      const interval = setInterval(() => {
        window.scrollTo(0, pos)
        pos += step
        if (pos >= maxScroll) {
          clearInterval(interval)
          window.scrollTo(0, 0)
          setTimeout(resolve, 600)
        }
      }, 250)
    })
  }

  // ─── API send ─────────────────────────────────────────────────────────────────

  async function getConfig() {
    return new Promise((resolve) => chrome.storage.local.get(["apiUrl", "apiToken"], resolve))
  }

  async function sendToApp(speakers) {
    const { apiUrl, apiToken } = await getConfig()
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

  // Send a DOM snapshot to a debug endpoint so we can inspect the page structure
  async function sendDebugReport() {
    const { apiUrl, apiToken } = await getConfig()
    if (!apiUrl || !apiToken) return

    // Collect: unique tag+class combos and their counts, plus sample HTML
    const counts = {}
    for (const el of document.querySelectorAll("*")) {
      if (!el.className || typeof el.className !== "string") continue
      const cls = el.className.trim().split(/\s+/).slice(0, 3).join(" ")
      if (!cls || cls.length > 120) continue
      const key = `${el.tagName}.${cls}`
      counts[key] = (counts[key] || 0) + 1
    }

    // Top 40 repeated classes
    const topClasses = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([key, count]) => ({ key, count }))

    // Sample HTML of first candidate card
    const dominant = findDominantCard()
    let sampleHtml = ""
    if (dominant.length) {
      const { tag, cls } = dominant[0]
      const clsPart = cls.split(" ")[0]
      if (clsPart) {
        const el = document.querySelector(`${tag}.${clsPart}`)
        if (el) sampleHtml = el.outerHTML.slice(0, 3000)
      }
    }

    // LI links found
    const liLinks = Array.from(document.querySelectorAll('a[href*="linkedin.com/in/"]'))
      .map((a) => a.href)
      .slice(0, 20)

    const report = {
      url: location.href,
      title: document.title,
      topClasses,
      dominantCards: dominant,
      liLinksFound: liLinks.length,
      liLinkSamples: liLinks,
      capturedFromApi: _capturedSpeakers.length,
      sampleHtml,
    }

    fetch(apiUrl.replace(/\/$/, "") + "/api/events/page-report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify(report),
    }).catch(() => {})
  }

  // ─── Import UI ────────────────────────────────────────────────────────────────

  function showImportBanner(speakers) {
    const liCount = speakers.filter((s) => s.linkedinUrl).length
    showBanner(
      `<div style="font-weight:700;font-size:15px;margin-bottom:2px">🎯 6Degrees — Money 20/20</div>
       <div style="opacity:0.9">Found <strong>${speakers.length}</strong> speakers · <strong>${liCount}</strong> with LinkedIn</div>`,
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
                 <div style="opacity:0.9"><strong>${result.imported ?? speakers.length}</strong> speakers saved to 6Degrees.</div>
                 <div style="font-size:11px;opacity:0.7">Open 6Degrees → Events to manage them.</div>`,
                [{ label: "Close", style: { background: "rgba(255,255,255,0.2)", color: "#fff" }, onClick: hideBanner }]
              )
            } else {
              showBanner(
                `<div style="font-weight:700">⚠ Error</div><div style="opacity:0.9">${result.error || "Something went wrong."}</div>`,
                [{ label: "Retry", style: { background: "#fff", color: "#1e3a8a" }, onClick: () => showImportBanner(speakers) },
                 { label: "Close", style: { background: "rgba(255,255,255,0.2)", color: "#fff" }, onClick: hideBanner }]
              )
            }
          },
        },
        { label: "Dismiss", style: { background: "rgba(255,255,255,0.15)", color: "#fff" }, onClick: hideBanner },
      ]
    )
  }

  // ─── Main flow ────────────────────────────────────────────────────────────────

  async function run() {
    if (!location.pathname.includes("/speaker") && !location.pathname.includes("/agenda")) return

    // Show a "waiting" state immediately so the user knows the extension is active
    showBanner(
      `<div style="font-weight:700;font-size:15px;margin-bottom:2px">6Degrees — Money 20/20</div>
       <div style="opacity:0.8;font-size:12px">Loading speakers… scrolling page to detect all cards.</div>`,
      [{ label: "Cancel", style: { background: "rgba(255,255,255,0.15)", color: "#fff" }, onClick: hideBanner }]
    )

    // Wait for initial render
    await new Promise((r) => setTimeout(r, 2000))

    // Auto-scroll to trigger lazy loading
    await autoScroll()

    // Wait for any post-scroll renders / API responses
    await new Promise((r) => setTimeout(r, 1500))

    // Merge network-captured + DOM-scraped speakers, deduplicating by name
    _domSpeakers = scrapeDOM()
    const byName = new Map()
    for (const s of [..._capturedSpeakers, ..._domSpeakers]) {
      const key = `${s.firstName}|${s.lastName}`
      if (!byName.has(key)) byName.set(key, s)
      else {
        // Merge: prefer non-null fields
        const existing = byName.get(key)
        byName.set(key, { ...existing, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v != null)) })
      }
    }
    const speakers = Array.from(byName.values())

    if (speakers.length >= 2) {
      showImportBanner(speakers)
      return
    }

    // Nothing found — show debug controls
    showBanner(
      `<div style="font-weight:700;font-size:14px">6Degrees — Money 20/20</div>
       <div style="font-size:12px;opacity:0.85">No speakers detected yet.<br>
       Try scrolling the page manually, then click <strong>Scan again</strong>.<br>
       Click <strong>Send report</strong> to help diagnose.</div>`,
      [
        {
          label: "Scan again",
          style: { background: "#fff", color: "#1e3a8a" },
          onClick: async (e) => {
            e.currentTarget.textContent = "Scanning…"
            e.currentTarget.disabled = true
            await autoScroll()
            await new Promise((r) => setTimeout(r, 1500))
            _domSpeakers = scrapeDOM()
            const merged = new Map()
            for (const s of [..._capturedSpeakers, ..._domSpeakers]) {
              const key = `${s.firstName}|${s.lastName}`
              if (!merged.has(key)) merged.set(key, s)
            }
            const found = Array.from(merged.values())
            if (found.length >= 2) { showImportBanner(found); return }
            showBanner(
              `<div style="font-weight:700;font-size:14px">Still no speakers found</div>
               <div style="font-size:12px;opacity:0.85">Make sure you are on the speakers list page with cards visible.<br>Send a page report so we can fix the scraper.</div>`,
              [
                { label: "Send report", style: { background: "#fff", color: "#1e3a8a" }, onClick: async (e2) => { e2.currentTarget.textContent = "Sending…"; await sendDebugReport(); e2.currentTarget.textContent = "Report sent ✓" } },
                { label: "Close", style: { background: "rgba(255,255,255,0.15)", color: "#fff" }, onClick: hideBanner },
              ]
            )
          },
        },
        {
          label: "Send report",
          style: { background: "rgba(255,255,255,0.2)", color: "#fff" },
          onClick: async (e) => {
            e.currentTarget.textContent = "Sending…"
            await sendDebugReport()
            e.currentTarget.textContent = "Sent ✓"
          },
        },
        { label: "Close", style: { background: "rgba(255,255,255,0.15)", color: "#fff" }, onClick: hideBanner },
      ]
    )
  }

  // SPA navigation support + initial run — deferred until DOM is ready
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
