;(function () {
  "use strict"

  // Only run on the speakers page
  if (!window.location.pathname.includes("/speakers") && !window.location.pathname.includes("/agenda")) return

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  let _bannerEl = null

  function getBanner() {
    if (_bannerEl) return _bannerEl
    _bannerEl = document.createElement("div")
    _bannerEl.id = "sd-m2020-banner"
    Object.assign(_bannerEl.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
      background: "#1e40af",
      color: "#fff",
      borderRadius: "16px",
      padding: "16px 20px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "14px",
      lineHeight: "1.4",
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
    if (actions) {
      const row = document.createElement("div")
      row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;"
      for (const { label, style, onClick } of actions) {
        const btn = document.createElement("button")
        btn.textContent = label
        Object.assign(btn.style, {
          padding: "8px 16px",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
          fontSize: "13px",
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
    if (_bannerEl) { _bannerEl.remove(); _bannerEl = null }
  }

  // ─── Scraper ─────────────────────────────────────────────────────────────────

  function getText(el, selectors) {
    for (const sel of selectors) {
      const found = el.querySelector(sel)
      if (found?.textContent?.trim()) return found.textContent.trim()
    }
    return null
  }

  function getAttr(el, selectors, attr) {
    for (const sel of selectors) {
      const found = el.querySelector(sel)
      if (found?.getAttribute(attr)) return found.getAttribute(attr)
    }
    return null
  }

  // Attempt to split "CEO at Acme Corp" or "CEO, Acme Corp" into role+company
  function splitRoleCompany(text) {
    if (!text) return { role: null, company: null }
    const atMatch = text.match(/^(.+?)\s+(?:at|@|,)\s+(.+)$/i)
    if (atMatch) return { role: atMatch[1].trim(), company: atMatch[2].trim() }
    return { role: text.trim(), company: null }
  }

  function extractLinkedInKey(url) {
    if (!url) return null
    const m = url.match(/linkedin\.com\/in\/([^/?#]+)/)
    return m ? m[1].toLowerCase() : null
  }

  function scrapeSpeakers() {
    const speakers = []

    // Strategy 1: JSON-LD structured data
    const jsonLds = document.querySelectorAll('script[type="application/ld+json"]')
    for (const script of jsonLds) {
      try {
        const data = JSON.parse(script.textContent)
        const items = Array.isArray(data) ? data : [data]
        for (const item of items) {
          const performers = item["performer"] || item["speakers"] || []
          for (const p of Array.isArray(performers) ? performers : []) {
            if (p["name"]) {
              const nameParts = p["name"].split(/\s+/)
              speakers.push({
                firstName: nameParts[0] || "",
                lastName: nameParts.slice(1).join(" ") || "",
                role: p["jobTitle"] || null,
                company: p["worksFor"]?.["name"] || null,
                description: p["description"] || null,
                sessionTopic: item["name"] || null,
                linkedinUrl: null,
                photoUrl: p["image"] || null,
              })
            }
          }
        }
      } catch { /* skip */ }
    }

    if (speakers.length > 0) return speakers

    // Strategy 2: HTML card scraping — find all LinkedIn links and walk up to find the speaker card
    const liLinks = document.querySelectorAll('a[href*="linkedin.com/in/"]')
    const processedCards = new Set()

    for (const link of liLinks) {
      // Walk up to find a card container (up to 8 levels)
      let card = link
      for (let i = 0; i < 8; i++) {
        if (!card.parentElement) break
        card = card.parentElement
        const rect = card.getBoundingClientRect()
        if (rect.height > 80 && rect.height < 800 && rect.width > 100) break
      }
      if (processedCards.has(card)) continue
      processedCards.add(card)

      const linkedinUrl = link.href
      const linkedinKey = extractLinkedInKey(linkedinUrl)

      // Extract name: look for headings or bold text
      const nameEl = card.querySelector("h1,h2,h3,h4,h5,[class*='name'],[class*='Name']")
      const nameText = nameEl?.textContent?.trim()
      if (!nameText) continue

      const nameParts = nameText.split(/\s+/)
      const firstName = nameParts[0] || ""
      const lastName = nameParts.slice(1).join(" ") || ""
      if (!firstName) continue

      // Role + company
      const roleEl = card.querySelector("[class*='title'],[class*='Title'],[class*='role'],[class*='Role'],[class*='position'],[class*='Position'],p,span")
      const roleText = roleEl?.textContent?.trim() || null
      const { role, company } = splitRoleCompany(roleText)

      // Photo
      const img = card.querySelector("img")
      const photoUrl = img?.src && !img.src.includes("logo") ? img.src : null

      // Session: look for any element that might contain panel/session info
      const sessionEl = card.querySelector("[class*='session'],[class*='Session'],[class*='topic'],[class*='panel']")
      const sessionTopic = sessionEl?.textContent?.trim() || null

      speakers.push({ firstName, lastName, role, company, description: null, sessionTopic, linkedinUrl, linkedinKey, photoUrl })
    }

    if (speakers.length > 0) return speakers

    // Strategy 3: Generic card detection without LinkedIn links
    // Look for common speaker card class patterns
    const cardSelectors = [
      "[class*='speaker-card']",
      "[class*='SpeakerCard']",
      "[class*='speaker_card']",
      "[class*='speakerCard']",
      "[class*='speaker-item']",
      "[class*='SpeakerItem']",
      "[class*='speaker-tile']",
      "[class*='speaker-block']",
      "[data-component='speaker']",
      "[data-testid*='speaker']",
    ]

    for (const sel of cardSelectors) {
      const cards = document.querySelectorAll(sel)
      if (cards.length < 2) continue

      for (const card of cards) {
        const nameEl = card.querySelector("h1,h2,h3,h4,[class*='name'],[class*='Name']")
        const nameText = nameEl?.textContent?.trim()
        if (!nameText) continue

        const nameParts = nameText.split(/\s+/)
        const firstName = nameParts[0] || ""
        const lastName = nameParts.slice(1).join(" ") || ""
        if (!firstName) continue

        const roleText = getText(card, [
          "[class*='title']","[class*='Title']","[class*='role']",
          "[class*='position']","[class*='company']","p","span",
        ])
        const { role, company } = splitRoleCompany(roleText)

        const liLink = card.querySelector('a[href*="linkedin.com/in/"]')
        const linkedinUrl = liLink?.href || null
        const linkedinKey = extractLinkedInKey(linkedinUrl)

        const img = card.querySelector("img")
        const photoUrl = img?.src && !img.src.includes("logo") ? img.src : null

        const sessionEl = card.querySelector("[class*='session'],[class*='panel'],[class*='topic']")
        const sessionTopic = sessionEl?.textContent?.trim() || null

        const descEl = card.querySelector("[class*='bio'],[class*='Bio'],[class*='description'],[class*='about']")
        const description = descEl?.textContent?.trim() || null

        speakers.push({ firstName, lastName, role, company, description, sessionTopic, linkedinUrl, linkedinKey, photoUrl })
      }
      if (speakers.length > 0) break
    }

    // Strategy 4: Deduplicate by full name
    const seen = new Set()
    return speakers.filter((s) => {
      const key = `${s.firstName}|${s.lastName}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  // ─── API call ─────────────────────────────────────────────────────────────────

  async function sendToApp(speakers) {
    const config = await new Promise((resolve) =>
      chrome.storage.local.get(["apiUrl", "apiToken"], resolve)
    )
    const { apiUrl, apiToken } = config

    if (!apiUrl || !apiToken) {
      return { ok: false, error: "Not configured — open the 6Degrees extension popup to set up." }
    }

    const url = apiUrl.replace(/\/$/, "") + "/api/events/speakers"

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
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

  async function run() {
    // Wait for page to load
    await new Promise((resolve) => setTimeout(resolve, 2500))

    const speakers = scrapeSpeakers()

    if (speakers.length === 0) {
      // Page may still be loading — retry once after more delay
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const retry = scrapeSpeakers()
      if (retry.length === 0) {
        showBanner(
          `<div style="font-weight:700;margin-bottom:4px">6Degrees — Money 20/20</div>
           <div style="font-size:12px;opacity:0.85">No speakers detected on this page. Make sure you are on the speakers list page.</div>`,
          [{ label: "Dismiss", style: { background: "rgba(255,255,255,0.2)", color: "#fff" }, onClick: hideBanner }]
        )
        return
      }
      speakers.push(...retry)
    }

    // Show preview
    const liCount = speakers.filter((s) => s.linkedinUrl).length
    showBanner(
      `<div style="font-weight:700;font-size:15px;margin-bottom:2px">6Degrees — Money 20/20</div>
       <div style="font-size:13px;opacity:0.9">Found <strong>${speakers.length}</strong> speakers — ${liCount} with LinkedIn profiles.</div>
       <div style="font-size:12px;opacity:0.75">Import them to your 6Degrees contact base?</div>`,
      [
        {
          label: `Import ${speakers.length} speakers`,
          style: { background: "#fff", color: "#1e40af" },
          onClick: async (e) => {
            const btn = e.currentTarget
            btn.textContent = "Importing…"
            btn.disabled = true

            const result = await sendToApp(speakers)

            if (result.ok) {
              showBanner(
                `<div style="font-weight:700;font-size:15px;margin-bottom:2px">✓ Done!</div>
                 <div style="font-size:13px;opacity:0.9"><strong>${result.imported ?? speakers.length}</strong> speakers imported to 6Degrees.</div>
                 <div style="font-size:12px;opacity:0.75">Open 6Degrees → Events to manage them.</div>`,
                [{ label: "Close", style: { background: "rgba(255,255,255,0.2)", color: "#fff" }, onClick: hideBanner }]
              )
            } else {
              showBanner(
                `<div style="font-weight:700;font-size:15px;margin-bottom:2px">⚠ Error</div>
                 <div style="font-size:13px;opacity:0.9">${result.error || "Something went wrong."}</div>`,
                [{ label: "Dismiss", style: { background: "rgba(255,255,255,0.2)", color: "#fff" }, onClick: hideBanner }]
              )
            }
          },
        },
        {
          label: "Dismiss",
          style: { background: "rgba(255,255,255,0.15)", color: "#fff" },
          onClick: hideBanner,
        },
      ]
    )
  }

  // Trigger on page load and SPA navigation
  run()

  // Re-run when URL changes (SPA)
  let lastPath = location.pathname
  const observer = new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname
      if (location.pathname.includes("/speakers") || location.pathname.includes("/agenda")) {
        hideBanner()
        run()
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
})()
