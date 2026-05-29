;(function () {
  "use strict"

  const path = window.location.pathname

  // ─── Following-page importer ─────────────────────────────────────────────────
  if (path.startsWith("/mynetwork/network-manager/following")) {
    initFollowsImporter()
    return
  }

  // ─── LinkedIn inbox scraper ───────────────────────────────────────────────────
  // On the messaging page, scrape the conversation list and POST to inbox-scan.
  if (path.startsWith("/messaging")) {
    applyMessagingFullWidth()
    setTimeout(initInboxScraper, 2500)
  }

  // ─── Shadow DOM host ──────────────────────────────────────────────────────────
  // NOTE: This script now loads on all LinkedIn pages (manifest matches /*).
  // All profile-specific code below is only *invoked* when path is /in/*.
  // Function definitions are safe on any page — only init() causes side effects.
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

  // LinkedIn CDN URLs are HMAC-signed per URL path — modifying the path
  // (e.g. shrink_100_100 → shrink_400_400) invalidates the ?t= signature.
  // Since photos are downloaded as base64 at save time anyway, return as-is.
  function upgradePhotoUrl(src) { return src }

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

  // Pick the best (widest) URL from an img element's srcset attribute.
  function bestSrcset(img) {
    let best = "", bestW = 0
    for (const part of (img.srcset || "").split(",")) {
      const [u, w] = part.trim().split(/\s+/)
      const width = parseInt((w || "0").replace(/\D/g, ""), 10)
      if (width > bestW) { bestW = width; best = u }
    }
    return bestW > 0 ? { url: best, width: bestW } : null
  }

  function scrapePhoto() {
    const mainEl = document.querySelector("main")

    // ── Strategy 0: exact profile-photo class selectors (most specific) ─────
    // These class names / attributes are used only on the actual profile photo
    // element and are safe on every profile layout, including Open to Work,
    // Premium frames, and creator profiles.
    // NOTE: The broad "div[class*='profile-picture'] img[class*='profile-picture__image']"
    // selector was removed — it also matches mutual-connection card thumbnails.
    const PHOTO_SELECTORS = [
      ".pv-top-card-profile-picture__image--show",  // loaded state class
      ".pv-top-card-profile-picture__image",         // general class
      "img[data-anonymize='headshot-photo']",        // LinkedIn anon attribute
      ".profile-photo-edit__preview",               // own profile (edit mode)
      ".pv-top-card--photo img",
    ]
    for (const sel of PHOTO_SELECTORS) {
      let img
      try { img = document.querySelector(sel) } catch { continue }
      if (!img) continue
      const ss = bestSrcset(img)
      if (ss && ss.width >= 100 && isValidPhoto(ss.url)) {
        console.debug("[6D photo] Strategy 0 hit:", sel, ss.url)
        return upgradePhotoUrl(ss.url)
      }
      const src = img.currentSrc || img.src || ""
      if (src && isValidPhoto(src)) {
        console.debug("[6D photo] Strategy 0 hit (src):", sel, src)
        return upgradePhotoUrl(src)
      }
    }

    // ── Strategy 1: profile-displayphoto — scoped to top-card section ──────────
    // LinkedIn CDN URLs for profile headshots always contain 'profile-displayphoto'.
    // We scope the search to the FIRST section in <main> (= top card) to avoid
    // picking up mutual-connection thumbnails from later sections, which also use
    // 'profile-displayphoto' URLs and appear later in the DOM.
    //
    // NOTE: do NOT sort by getBoundingClientRect().top — lazy-loaded images that
    // haven't entered the viewport yet report top=0, which breaks the sort order.
    if (mainEl) {
      // Scope to the top-card section (first <section> inside <main>).
      // Fall back to all of <main> if no section found.
      const topCardEl = mainEl.querySelector("section") ?? mainEl
      const pdImgs = [...topCardEl.querySelectorAll("img")].filter((img) => {
        if (img.closest("aside")) return false  // exclude sidebar
        const s = (img.currentSrc || img.src || "") + " " + (img.srcset || "")
        return /profile-displayphoto/i.test(s) &&
               !/displaybackgroundimage/i.test(s) &&
               isSquarishImage(img)
      })

      console.debug("[6D photo] Strategy 1: found", pdImgs.length, "profile-displayphoto imgs in top-card section",
        pdImgs.map(img => ({ src: (img.currentSrc || img.src || "").slice(0, 80), class: img.className.slice(0, 60) })))

      if (pdImgs.length > 0) {
        // Score each candidate:
        //   +200 if URL contains "-cr-" (circular crop = the actual profile headshot)
        //   + best srcset width (higher resolution = main profile photo, not thumbnail)
        //   + rendered display width (profile photo ~96-120px; mutual connection thumbnail ~24-48px)
        // The rendered width is the key tiebreaker when srcset is absent (some profiles
        // lazy-load without srcset). DOM order is used only as the final tiebreaker.
        const scored = pdImgs.map((img, domIdx) => {
          const ss = bestSrcset(img)
          const combined = (img.currentSrc || img.src || "") + " " + (img.srcset || "")
          const isCrop = /-cr[-/]/.test(combined)
          // getBoundingClientRect().width is reliable for visible elements (popup opens
          // on an already-loaded page). Off-screen elements return 0, which is fine.
          const renderedW = Math.round(img.getBoundingClientRect().width) || img.naturalWidth || 0
          const score = (isCrop ? 200 : 0) + (ss ? ss.width : 0) + renderedW
          const url = (ss && ss.width >= 100) ? ss.url : (img.currentSrc || img.src || "")
          return { url, score, domIdx }
        }).filter(({ url }) => isValidPhoto(url))
        scored.sort((a, b) => b.score - a.score || a.domIdx - b.domIdx)
        if (scored.length > 0) {
          console.debug("[6D photo] Strategy 1 win (scored):", scored[0].url.slice(0, 80), "score=" + scored[0].score)
          return upgradePhotoUrl(scored[0].url)
        }
        console.debug("[6D photo] Strategy 1: all candidates failed isValidPhoto")
      }
    }

    // ── Strategy 2: tight profile-photo containers ────────────────────────────
    const photoRoots = [
      document.querySelector(".pv-top-card-profile-picture"),
      document.querySelector(".profile-photo-edit__container"),
      document.querySelector(".pv-top-card__photo-wrapper"),
      document.querySelector("[data-anonymize='headshot-photo']")?.closest("div"),
    ].filter(Boolean)

    console.debug("[6D photo] Strategy 2: roots found =", photoRoots.length)
    for (const root of photoRoots) {
      for (const picture of root.querySelectorAll("picture")) {
        const src = picture.querySelector("source")?.srcset?.split(",")?.[0]?.trim()?.split(" ")?.[0] || ""
        if (src && isValidPhoto(src)) {
          console.debug("[6D photo] Strategy 2 win (picture):", src.slice(0, 80))
          return upgradePhotoUrl(src)
        }
      }
      for (const img of root.querySelectorAll("img")) {
        const src = imgSrc(img)
        if (isValidPhoto(src) && isSquarishImage(img)) {
          console.debug("[6D photo] Strategy 2 win (img):", src.slice(0, 80))
          return upgradePhotoUrl(src)
        }
      }
    }

    // ── Strategy 3: aria-label / data-anonymize attributes ────────────────────
    console.debug("[6D photo] trying Strategy 3")
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
          if (isValidPhoto(src) && isSquarishImage(img)) {
            console.debug("[6D photo] Strategy 3 win:", sel, src.slice(0, 80))
            return upgradePhotoUrl(src)
          }
        }
      } catch { /* bad selector */ }
    }

    // ── Strategy 4: <picture> elements, guarded by aspect ratio ──────────────
    console.debug("[6D photo] trying Strategy 4 (all <picture> elements)")
    for (const picture of document.querySelectorAll("picture")) {
      const src = picture.querySelector("source")?.srcset?.split(",")?.[0]?.trim()?.split(" ")?.[0] || ""
      if (!src || !isValidPhoto(src)) continue
      const img = picture.querySelector("img")
      if (img && !isSquarishImage(img)) continue
      console.debug("[6D photo] Strategy 4 win:", src.slice(0, 80))
      return upgradePhotoUrl(src)
    }

    // ── Strategy 5 (last resort): og:image ────────────────────────────────────
    // In LinkedIn's SPA, og:image stays stale on client-side navigations.
    // Only use it if nothing else worked AND URL contains 'displayphoto'.
    const og = document.querySelector('meta[property="og:image"], meta[name="og:image"]')
    if (og) {
      const src = og.content || og.getAttribute("content") || ""
      if (isValidPhoto(src) && src.includes("displayphoto")) {
        console.debug("[6D photo] Strategy 5 win (og:image):", src.slice(0, 80))
        return upgradePhotoUrl(src)
      }
    }

    console.debug("[6D photo] ALL strategies failed — returning null")
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
      //    Skip pronouns, degree badges, separator lines, AND mutual-connection lines
      //    (which can appear between headline and location in the DOM text).
      const kept = []
      for (const line of lines.slice(1, 20)) {
        if (/^(He|She|They|Il|Elle)\/(Him|Her|Them|Lui|Elle)$/i.test(line)) continue
        if (/^·?\s*(1er|2e|3e|1st|2nd|3rd)\b/.test(line)) continue
        if (/\bconnection|\bfollower|\brelation\b|\bsuivi/i.test(line)) continue
        if (/^\d+\s+mutual/i.test(line)) continue
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

    // Role-keyword heuristic — used to detect which side of a separator is the title
    const ROLE_RE = /\b(director|directeur|manager|head|lead|chief|officer|president|ceo|cto|coo|cfo|ciso|cmo|vp|vice|founder|co-founder|partner|associate|analyst|engineer|architect|consultant|specialist|advisor|advisor|intern|stagiaire|responsable|chargé|student|researcher|professor|lecturer|designer|developer|scientist|strategist|entrepreneur|executive|chairman|trustee)\b/i

    // Rejects strings that look like geographic locations rather than company names.
    function looksLikeLocation(s) {
      if (!s) return false
      // "Paris, France" / "City, Region" pattern — comma inside
      if (/^[A-ZÀ-Ö][\w\s'-]+,\s*[A-ZÀ-Ö]/.test(s)) return true
      return /\b(region|area|greater|metropolitan|province|county|district|département|territory|zone|île|canton|prefecture)\b/i.test(s) ||
        /\b(france|england|germany|usa|uk|united states|united kingdom|sweden|norway|denmark|netherlands|spain|italy|australia|canada|switzerland|belgium|singapore|india|china|japan|brazil|mexico|russia|poland|portugal|greece|turkey|south korea|taiwan|indonesia|malaysia|thailand|vietnam|philippines|new zealand|ireland|scotland|wales|austria|czech|hungary|romania|bulgaria|croatia|ukraine|israel|south africa|nigeria|kenya|egypt|morocco|saudi arabia|uae|qatar|kuwait|bahrain|oman)\b/i.test(s)
    }

    // Returns s if it passes as a company name, null otherwise.
    // Reject strings > 60 chars — those are almost always headlines/taglines, not company names.
    function asCompany(s) {
      if (!s || s.length < 2 || s.length > 60 || looksLikeLocation(s)) return null
      return s
    }

    // ── Preposition patterns: "Role at Company" (and multilingual equivalents) ──
    const atPatterns = [
      /^(.+?)\s+at\s+(.+)$/i,
      /^(.+?)\s+chez\s+(.+)$/i,
      /^(.+?)\s+bei\s+(.+)$/i,
      /^(.+?)\s+presso\s+(.+)$/i,
      /^(.+?)\s+en\s+([A-Z].+)$/,   // "Directeur en Kering" — only if company starts uppercase
      /^(.+?)\s*@\s*(.+)$/,
    ]
    for (const pat of atPatterns) {
      const m = headline.match(pat)
      if (m && m[1].trim().length > 1 && m[2].trim().length > 1) {
        const company = asCompany(m[2].split(/\s*[|·]\s*/)[0].trim())
        return { position: m[1].trim(), company }
      }
    }

    // ── Middle-dot separator: "Role · Company" or "Company · Role" ──
    // Use ROLE_RE to detect direction — LinkedIn users write both orders.
    const dotM = headline.match(/^(.+?)\s*·\s*(.+)$/)
    if (dotM) {
      const [left, right] = [dotM[1].trim(), dotM[2].trim()]
      if (right.length > 1 && !/^\d/.test(right) && !/connection|follower|relation/i.test(right)) {
        const leftIsRole = ROLE_RE.test(left)
        const rightIsRole = ROLE_RE.test(right)
        if (rightIsRole && !leftIsRole) {
          // "Company · Role" — reversed order
          return { position: right, company: asCompany(left.split(/\s*[|·]\s*/)[0].trim()) }
        }
        // Default (leftIsRole, both, or neither): "Role · Company"
        return { position: left, company: asCompany(right.split(/\s*[|·]\s*/)[0].trim()) }
      }
    }

    // ── Pipe separator: "Company | Role" (common on LinkedIn) ──
    const pipeM = headline.match(/^(.+?)\s*\|\s*(.+)$/)
    if (pipeM) {
      const [left, right] = [pipeM[1].trim(), pipeM[2].trim()]
      if (left.length > 1 && right.length > 1) {
        // If right has a role keyword and left doesn't → left is company (default)
        // If left has a role keyword and right doesn't → right is company
        if (ROLE_RE.test(left) && !ROLE_RE.test(right)) {
          // "Role | Company | Tagline…" — strip anything after the first secondary pipe
          return { position: left, company: asCompany(right.split(/\s*[|·]\s*/)[0].trim()) }
        }
        return { position: right, company: asCompany(left.split(/\s*[|·]\s*/)[0].trim()) }
      }
    }

    // ── Dash separator: "Company - Role" or "Company – Role" ──
    // En-dash (–) and em-dash (—) are always field separators (optional surrounding spaces).
    // ASCII hyphen (-) is a separator ONLY when it has whitespace on both sides:
    //   "Sales Director - Nuvei"  ← separator (spaces around it)
    //   "Cross-Border Digital"    ← compound word (no spaces), NOT a separator
    const dashM = headline.match(/^(.+?)(?:\s*[–—]\s*|\s+-\s+)(.+)$/)
    if (dashM) {
      const [left, right] = [dashM[1].trim(), dashM[2].trim()]
      if (left.length > 1 && right.length > 1 && left.length < 60) {
        if (ROLE_RE.test(right) && !ROLE_RE.test(left)) {
          return { position: right, company: asCompany(left) }
        }
        if (ROLE_RE.test(left) && !ROLE_RE.test(right)) {
          return { position: left, company: asCompany(right) }
        }
        // Default: left = company, right = role
        return { position: right, company: asCompany(left) }
      }
    }

    // ── Comma separator: "Role, Company" ──
    // Strict guard: skip if right side looks like a location (city, region, country).
    const commaM = headline.match(/^([^,]+),\s*(.+)$/)
    if (commaM) {
      const [left, right] = [commaM[1].trim(), commaM[2].trim()]
      const company = asCompany(right)
      if (left.length > 1 && company && right.length < 60 && !/^\d/.test(right)) {
        return { position: left, company }
      }
    }

    // No separator — whole headline is the position; company resolved via DOM fallback
    return { position: headline, company: null }
  }

  // Fallback: if headline parsing gave no company, try to read the current company
  // from LinkedIn's top-card experience items (the buttons/links below the headline
  // that represent current positions). These often contain "Title at Company" text
  // or aria-labels even when the user's headline doesn't follow a standard format.
  function scrapeCompanyFromTopCard() {
    // Shared location guard (mirrors the one in parsePositionCompany)
    function isGeo(s) {
      if (!s) return false
      return /\b(region|area|greater|metropolitan|province|county|district|département|territory|zone|île|canton)\b/i.test(s) ||
        /\b(france|england|germany|usa|uk|united states|united kingdom|sweden|norway|denmark|netherlands|spain|italy|australia|canada|switzerland|belgium|singapore|india|china|japan|brazil|mexico|russia|poland|portugal|greece|turkey|south korea|taiwan|ireland|scotland|wales|austria|ukraine|israel|south africa|nigeria|kenya|egypt|morocco|saudi arabia|uae|qatar|kuwait)\b/i.test(s) ||
        /^[A-ZÀ-Ö][\w\s'-]+,\s*[A-ZÀ-Ö]/.test(s)
    }

    // ── Strategy 1: JSON-LD structured data ──────────────────────────────────
    // LinkedIn sometimes embeds a Person schema with worksFor populated.
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const d = JSON.parse(s.textContent ?? "")
        const co = d?.worksFor?.name || d?.worksFor?.[0]?.name
        if (co && co.length > 1 && co.length < 80 && !isGeo(co)) {
          console.debug("[6D company] Strategy 1 (JSON-LD):", co)
          return co
        }
      } catch { /* ignore */ }
    }

    // Use :has(h1) to target the profile card section — the <h1> holds the person's
    // name and only appears in the profile card, not in Activity or other sections.
    // For LinkedIn SDUI v2 (2024+) profiles the name is in an <h2> — fall back to
    // section[componentkey*='Topcard'] which LinkedIn consistently uses for the
    // profile-card container regardless of locale.
    const root = document.querySelector(
      "main section:has(h1), section.artdeco-card:has(h1), .pv-top-card, section[componentkey*='Topcard'], .scaffold-layout__main > section, main > section"
    ) ?? document

    // ── Strategy 2: company logo img alt text ─────────────────────────────────
    // LinkedIn renders logo alt text in locale-specific formats:
    //   English:  "Shiseido logo"
    //   French:   "Logo de Shiseido"
    //   German:   "Logo von Shiseido"
    //   Italian:  "Logo di Shiseido"
    // Scan ALL logo alt texts for debugging before returning the first match.
    const logoAlts2 = []
    for (const img of root.querySelectorAll("img[alt]")) {
      const alt = (img.getAttribute("alt") ?? "").trim()
      if (/\blogo\b/i.test(alt)) logoAlts2.push(alt)
      // Match "Company logo" (English) or "Logo de/von/di/del/do/da Company" (localized)
      const enMatch = alt.match(/^(.+?)\s+logo$/i)
      const l10nMatch = alt.match(/^logo\s+(?:de|von|di|del|do|da|d[''])\s+(.+)$/i)
      const company = ((enMatch?.[1] || l10nMatch?.[1]) ?? "").trim()
      if (
        company.length > 1 &&
        company.length < 80 &&
        !isGeo(company) &&
        !img.closest("[class*='profile-picture']") &&
        !img.closest("[class*='profile-photo']") &&
        !img.closest("[class*='photo-wrapper']")
      ) {
        console.debug("[6D company] Strategy 2 (top-card logo alt):", company)
        return company
      }
    }
    console.debug("[6D company] Strategy 2: no match. All logo alts in root:", logoAlts2)

    // ── Strategy 3: experience list items (multiple selector generations) ─────
    // LinkedIn has cycled through several class naming conventions; try them all.
    const experienceSelectors = [
      "[class*='pv-text-details__right-panel'] li",   // 2023 layout
      ".optional-action-btn-wrapper",                  // current button layout
      "button[class*='experience']",
      ".pv-top-card--experience-list-item",            // older layout
      "[class*='experience-list'] li",
      "[class*='experience-list'] button",
      "[class*='experience-list'] a",
    ]
    for (const sel of experienceSelectors) {
      for (const el of root.querySelectorAll(sel)) {
        const text = (
          el.getAttribute("aria-label") ||
          el.querySelector("span[aria-hidden='true']")?.textContent ||
          el.innerText ||
          ""
        ).trim().replace(/\s+/g, " ")
        if (!text || text.length > 200 || text.length < 4) continue
        const { company } = parsePositionCompany(text)
        if (company && company.length > 1 && company.length < 80 && !isGeo(company)) {
          console.debug("[6D company] Strategy 3 (experience list):", sel, "→", company)
          return company
        }
      }
    }

    // ── Strategy 4: full-page logo scan in <main> (experience section proper) ──
    // Strategies 2 & 3 are scoped to the top-card section only. The Experience
    // section further down the page (separate from the top card) contains the most
    // reliable company logos: <img alt="Newblack logo">. Search the full <main>
    // element, skipping <aside> (sidebar: PYMK, mutual connections, ads).
    // The experience section appears before the education section in the DOM, so
    // the first matching logo is typically the current employer.
    const mainEl2 = document.querySelector("main")
    if (mainEl2) {
      const logoAlts4 = []
      for (const img of mainEl2.querySelectorAll("img[alt]")) {
        if (img.closest("aside")) continue  // skip sidebar
        const alt = (img.getAttribute("alt") ?? "").trim()
        if (/\blogo\b/i.test(alt)) logoAlts4.push(alt)
        // Same locale-aware matching as Strategy 2
        const enMatch = alt.match(/^(.+?)\s+logo$/i)
        const l10nMatch = alt.match(/^logo\s+(?:de|von|di|del|do|da|d[''])\s+(.+)$/i)
        const company = ((enMatch?.[1] || l10nMatch?.[1]) ?? "").trim()
        if (
          company.length > 1 &&
          company.length < 80 &&
          !isGeo(company) &&
          !img.closest("[class*='profile-picture']") &&
          !img.closest("[class*='profile-photo']") &&
          !img.closest("[class*='photo-wrapper']")
        ) {
          console.debug("[6D company] Strategy 4 (main logo scan):", company)
          return company
        }
      }
      console.debug("[6D company] Strategy 4: no match. All logo alts in main:", logoAlts4)
    }

    // ── Strategy 5: /company/ links ─────────────────────────────────────────────
    // Priority order (most reliable → least):
    //   5a. Experience section — job entry with "Present" date (= confirmed current employer)
    //   5b. Profile card (root) — experience badge for current positions
    //   5c. Experience section — first company link (usually most recent, even if date unclear)
    //   5d. Full <main> — last resort (includes Activity posts, sidebar, etc.)
    //
    // "Present" check solves the case where the profile card badge shows a
    // secondary/old company first (e.g. TSYS before FIS when both are listed as
    // current), because the experience section sorts by start date descending.
    // Returns true if element is inside a post/article (shared/republished content).
    // LinkedIn wraps feed posts in <article>, [role='article'], or — in the SDUI v2
    // layout — inside section[data-testid='carousel'] (the Activity feed carousel).
    // Experience badges are plain divs, never inside any of these containers.
    function isInsideArticle(el) {
      return !!(
        el.closest("article") ||
        el.closest("[role='article']") ||
        el.closest("section[data-testid='carousel']")  // SDUI v2 Activity carousel
      )
    }
    function findCompanyLink(searchRoot) {
      if (!searchRoot) return null
      for (const a of searchRoot.querySelectorAll("a[href*='/company/']")) {
        if (a.closest("aside")) continue  // skip sidebar
        if (isInsideArticle(a)) continue  // skip republished posts / featured articles
        const nameEl = a.querySelector("span[aria-hidden='true']") || a
        const name = (nameEl.textContent ?? "").trim()
        if (name.length > 1 && name.length < 80 && !isGeo(name)) return name
      }
      return null
    }
    // Find the experience section by data attribute or localized heading text.
    function findExperienceSection() {
      const byAttr = document.querySelector("section[data-view-name*='experience']")
      if (byAttr) return byAttr
      for (const s of document.querySelectorAll("main section")) {
        const h = s.querySelector("h2, h3")
        if (!h) continue
        if (/^exp[eé]ri|^ervar|^erfahrung|^esperien|^experiencia|^do[sś]wiad/i.test(h.textContent.trim())) return s
      }
      return null
    }
    // Find the first company in the experience section that has a "currently working here"
    // date indicator.  LinkedIn uses locale-specific words for the end of an open date range.
    const PRESENT_RE = /\b(present|aujourd'hui|heute|heden|ahora|attuale|maintenant|현재|現在|сейчас|جاري)\b/i
    function findCurrentCompanyByPresent(expRoot) {
      if (!expRoot) return null
      // Each experience entry is typically an <li> or a pvs-entity div
      for (const item of expRoot.querySelectorAll("li, [class*='pvs-entity'], [class*='experience-item']")) {
        if (!PRESENT_RE.test(item.textContent)) continue
        for (const a of item.querySelectorAll("a[href*='/company/']")) {
          if (a.closest("aside")) continue
          if (isInsideArticle(a)) continue  // skip posts inside experience section too
          const nameEl = a.querySelector("span[aria-hidden='true']") || a
          const name = (nameEl.textContent ?? "").trim()
          if (name.length > 1 && name.length < 80 && !isGeo(name)) return name
        }
      }
      return null
    }
    const expSection = findExperienceSection()
    const sources5 = [
      [() => findCurrentCompanyByPresent(expSection), "experience(present)"],
      [() => findCompanyLink(root),                   "profile-card"],
      [() => findCompanyLink(expSection),             "experience-section"],
      [() => findCompanyLink(mainEl2),                "main"],
    ]
    for (const [fn, label] of sources5) {
      const co5 = fn()
      if (co5) {
        console.debug("[6D company] Strategy 5 (/company/ link):", co5, `(${label})`)
        return co5
      }
    }

    // ── Strategy 6: Topcard plain-text company ──────────────────────────────────
    // LinkedIn SDUI v2 (2024+) sometimes renders the company name as a plain <p>
    // element in the topcard rather than as a /company/ link — typically right after
    // the headline.  Layout: [h2: Name] → [p: Headline] → [p: Company] → [p: Location]
    // This fires only when Strategies 1–5 all returned null.
    {
      const topcardEl = document.querySelector("section[componentkey*='Topcard']") ||
        (root !== document ? root : null)
      if (topcardEl) {
        const SKIP6 = /^(connexions?|connections?|followers?|suivis?|abonnés?|voir\s+plus|show\s+more|open\s+to\s+work|disponible|afficher|message|coordonn|contact\s+info|plus\s+de)/i
        let seenHeadline = false
        for (const p of topcardEl.querySelectorAll("p")) {
          const t = (p.textContent ?? "").trim()
          if (t.length < 2) continue
          if (/^[·•]/.test(t) || t === "·") continue  // degree indicator / separator
          if (/^\d/.test(t)) continue                  // "500+ connections" etc.
          if (SKIP6.test(t)) continue
          if (/connection|follower|relation|commun|mutual/i.test(t)) continue
          if (!seenHeadline) {
            // First long text (>20 chars) = headline — mark seen and skip
            if (t.length > 20) seenHeadline = true
            continue
          }
          // After headline: first short non-geo, non-pipe text = company.
          // LinkedIn sometimes concatenates current company + school with " · ":
          //   "Nuvei · ESIEA - Ecole d'Ingénieurs..."  (full string > 60 chars, but first token is valid)
          // Split on " · " first, then apply length check on the token, not the full string.
          if (!t.includes("|")) {
            const firstToken = t.split(/\s*·\s*/)[0].trim()
            if (firstToken.length >= 2 && firstToken.length <= 60 && !isGeo(firstToken)) {
              console.debug("[6D company] Strategy 6 (topcard plain text):", firstToken)
              return firstToken
            }
          }
          // Location follows company in the topcard layout — stop here
          if (isGeo(t) || t.includes(",")) break
        }
      }
    }

    console.debug("[6D company] ALL strategies failed — returning null")
    return null
  }

  // Same data as export_list.py: photo · location · mutual connections.
  // Plus name + headline + position + company which the extension needs for new contacts.
  // Map region/state names → country for the cases LinkedIn omits the country.
  // French metropolitan regions are the primary use case; add others as needed.
  const REGION_TO_COUNTRY = {
    // France — 13 metropolitan regions + DOM-TOM
    "île-de-france": "France", "ile-de-france": "France",
    "auvergne-rhône-alpes": "France", "auvergne-rhone-alpes": "France",
    "provence-alpes-côte d'azur": "France", "provence-alpes-cote d'azur": "France",
    "nouvelle-aquitaine": "France",
    "occitanie": "France",
    "hauts-de-france": "France",
    "grand est": "France",
    "bretagne": "France",
    "pays de la loire": "France",
    "normandie": "France",
    "bourgogne-franche-comté": "France", "bourgogne-franche-comte": "France",
    "centre-val de loire": "France",
    "corse": "France",
    "la réunion": "France", "la reunion": "France",
    "martinique": "France", "guadeloupe": "France", "guyane": "France",
    // UK — England/Scotland/Wales/NI are regions, not countries
    "england": "United Kingdom", "scotland": "United Kingdom",
    "wales": "United Kingdom", "northern ireland": "United Kingdom",
    // US states (sampled — LinkedIn usually includes "United States" already)
    "california": "United States", "new york": "United States",
    "texas": "United States", "florida": "United States",
    // Germany — Bundesländer
    "bavaria": "Germany", "north rhine-westphalia": "Germany",
    "baden-württemberg": "Germany", "berlin": "Germany",
    "hamburg": "Germany",
    // French country names as last-segment of comma-separated location
    // e.g. "London, Royaume-Uni" → { city: "London", country: "United Kingdom" }
    "royaume-uni": "United Kingdom",
    "états-unis": "United States", "etats-unis": "United States",
    "allemagne": "Germany",
    "espagne": "Spain",
    "italie": "Italy",
    "pays-bas": "Netherlands",
    "belgique": "Belgium",
    "suisse": "Switzerland",
    "autriche": "Austria",
    "chine": "China",
    "japon": "Japan",
    "russie": "Russia",
    "pologne": "Poland",
    "grèce": "Greece", "grece": "Greece",
    "danemark": "Denmark",
    "norvège": "Norway", "norvege": "Norway",
    "suède": "Sweden", "suede": "Sweden",
    "finlande": "Finland",
    "irlande": "Ireland",
    "turquie": "Turkey",
    "maroc": "Morocco",
    "australie": "Australia",
    "brésil": "Brazil", "bresil": "Brazil",
    "mexique": "Mexico",
    "inde": "India",
    "égypte": "Egypt", "egypte": "Egypt",
    "afrique du sud": "South Africa",
    "emirats arabes unis": "United Arab Emirates",
    "émirats arabes unis": "United Arab Emirates",
    "arabie saoudite": "Saudi Arabia",
    "sénégal": "Senegal", "senegal": "Senegal",
    "côte d'ivoire": "Ivory Coast", "cote d'ivoire": "Ivory Coast",
    "cameroun": "Cameroon",
  }

  // Country names that, when the ENTIRE location segment is this value,
  // should be stored as country (not city).  Includes French + English names.
  const COUNTRY_NAMES = {
    // From REGION_TO_COUNTRY above — French/localized
    "royaume-uni": "United Kingdom",
    "états-unis": "United States", "etats-unis": "United States",
    "allemagne": "Germany", "espagne": "Spain", "italie": "Italy",
    "pays-bas": "Netherlands", "belgique": "Belgium", "suisse": "Switzerland",
    "autriche": "Austria", "chine": "China", "japon": "Japan",
    "russie": "Russia", "pologne": "Poland",
    "grèce": "Greece", "grece": "Greece",
    "danemark": "Denmark",
    "norvège": "Norway", "norvege": "Norway",
    "suède": "Sweden", "suede": "Sweden",
    "finlande": "Finland", "irlande": "Ireland", "turquie": "Turkey",
    "maroc": "Morocco", "australie": "Australia",
    "brésil": "Brazil", "bresil": "Brazil",
    "mexique": "Mexico", "inde": "India",
    "égypte": "Egypt", "egypte": "Egypt",
    "afrique du sud": "South Africa",
    "emirats arabes unis": "United Arab Emirates",
    "émirats arabes unis": "United Arab Emirates",
    "arabie saoudite": "Saudi Arabia",
    "sénégal": "Senegal", "senegal": "Senegal",
    // English country names that may appear as single-segment location
    "united kingdom": "United Kingdom", "united states": "United States",
    "germany": "Germany", "spain": "Spain", "italy": "Italy",
    "netherlands": "Netherlands", "belgium": "Belgium", "switzerland": "Switzerland",
    "austria": "Austria", "china": "China", "japan": "Japan",
    "russia": "Russia", "poland": "Poland", "greece": "Greece",
    "denmark": "Denmark", "norway": "Norway", "sweden": "Sweden",
    "finland": "Finland", "ireland": "Ireland", "turkey": "Turkey",
    "morocco": "Morocco", "australia": "Australia", "brazil": "Brazil",
    "mexico": "Mexico", "india": "India", "egypt": "Egypt",
    "south africa": "South Africa",
    "united arab emirates": "United Arab Emirates",
    "saudi arabia": "Saudi Arabia",
    "canada": "Canada", "france": "France", "portugal": "Portugal",
    "israel": "Israel", "singapore": "Singapore",
  }

  // Strip LinkedIn's "surrounding area" noise suffixes that appear in many locales.
  // Examples: "Paris et périphérie", "London and surrounding area",
  //           "Greater London", "Großraum München", "Région de Lyon",
  //           "Paris Area, France", "San Francisco Bay Area"
  const AREA_SUFFIX_RE = /\s+(?:et\s+p[eé]riph[eé]rie|et\s+environs?|et\s+r[eé]gion|und\s+umgebung|und\s+umland|and\s+surrounding\s+area|and\s+vicinity|area|bay\s+area|metropolitan\s+area|metro\s+area|r[eé]gion\s+m[eé]tropolitaine)\s*$/i
  const AREA_PREFIX_RE = /^(?:greater\s+|grand\s+|gro[ßs]raum\s+|r[eé]gion\s+(?:de\s+)?|grand[e]?\s+r[eé]gion\s+(?:de\s+)?)/i

  // Well-known cities → country, for single-segment locations where LinkedIn omits the country.
  const CITY_TO_COUNTRY = {
    "paris": "France", "lyon": "France", "marseille": "France", "toulouse": "France",
    "nice": "France", "nantes": "France", "bordeaux": "France", "lille": "France",
    "rennes": "France", "strasbourg": "France", "montpellier": "France",
    "london": "United Kingdom", "manchester": "United Kingdom", "birmingham": "United Kingdom",
    "edinburgh": "United Kingdom", "glasgow": "United Kingdom", "bristol": "United Kingdom",
    "leeds": "United Kingdom", "liverpool": "United Kingdom",
    "new york": "United States", "san francisco": "United States", "los angeles": "United States",
    "chicago": "United States", "boston": "United States", "seattle": "United States",
    "austin": "United States", "miami": "United States", "washington": "United States",
    "berlin": "Germany", "munich": "Germany", "münchen": "Germany", "hamburg": "Germany",
    "frankfurt": "Germany", "cologne": "Germany", "köln": "Germany", "düsseldorf": "Germany",
    "amsterdam": "Netherlands", "rotterdam": "Netherlands",
    "brussels": "Belgium", "bruxelles": "Belgium", "antwerp": "Belgium",
    "zurich": "Switzerland", "zürich": "Switzerland", "geneva": "Switzerland", "genève": "Switzerland",
    "madrid": "Spain", "barcelona": "Spain", "valencia": "Spain", "seville": "Spain",
    "milan": "Italy", "rome": "Italy", "milano": "Italy", "roma": "Italy", "florence": "Italy",
    "stockholm": "Sweden", "gothenburg": "Sweden", "göteborg": "Sweden",
    "oslo": "Norway", "copenhagen": "Denmark", "kobenhavn": "Denmark",
    "helsinki": "Finland", "dublin": "Ireland",
    "lisbon": "Portugal", "lisboa": "Portugal", "porto": "Portugal",
    "warsaw": "Poland", "warszawa": "Poland", "krakow": "Poland", "kraków": "Poland",
    "prague": "Czech Republic", "budapest": "Hungary", "vienna": "Austria", "wien": "Austria",
    "singapore": "Singapore", "hong kong": "Hong Kong", "tokyo": "Japan", "osaka": "Japan",
    "beijing": "China", "shanghai": "China", "shenzhen": "China",
    "dubai": "United Arab Emirates", "abu dhabi": "United Arab Emirates",
    "sydney": "Australia", "melbourne": "Australia", "toronto": "Canada", "montreal": "Canada",
    "vancouver": "Canada", "sao paulo": "Brazil", "são paulo": "Brazil",
    "mexico city": "Mexico", "ciudad de méxico": "Mexico",
    "tel aviv": "Israel", "jerusalem": "Israel",
    "johannesburg": "South Africa", "cape town": "South Africa",
    "nairobi": "Kenya", "lagos": "Nigeria", "cairo": "Egypt", "casablanca": "Morocco",
  }

  function extractCityCountry(location) {
    if (!location) return { city: null, country: null }

    // Normalise: collapse whitespace, strip leading/trailing spaces
    const raw = location.trim().replace(/\s+/g, " ")

    // Split on commas — LinkedIn format: "City, Region, Country" or "City, Country"
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean)

    // Clean the city part (first segment):
    //   • strip trailing noise ("et périphérie", "and surrounding area", etc.)
    //   • strip leading noise ("Greater", "Grand", "Großraum", "Région de", etc.)
    function cleanCity(raw) {
      return raw
        .replace(AREA_SUFFIX_RE, "")   // strip suffix noise
        .replace(AREA_PREFIX_RE, "")   // strip prefix noise
        .trim()
    }

    if (parts.length >= 2) {
      const city = cleanCity(parts[0])
      const lastPart = parts[parts.length - 1]
      // Check if the last segment is a known region rather than a country
      const inferredCountry = REGION_TO_COUNTRY[lastPart.toLowerCase()]
      const country = inferredCountry ?? lastPart
      // If city cleaned to empty fall back to original first part
      return { city: city || parts[0], country }
    }

    // Single segment — could be "Paris et périphérie", "Greater London", etc.
    const cleaned = cleanCity(parts[0])
    const key = cleaned.toLowerCase()
    const rawKey = parts[0].toLowerCase()

    // Check if the segment IS a country name (French or English).
    // Must come first so "Royaume-Uni" → {city:null, country:"United Kingdom"}
    // rather than being stored as a city.
    const countryNameMatch = COUNTRY_NAMES[key] || COUNTRY_NAMES[rawKey]
    if (countryNameMatch) return { city: null, country: countryNameMatch }

    // Try region → country first (e.g. "Bretagne")
    const regionCountry = REGION_TO_COUNTRY[key] || REGION_TO_COUNTRY[rawKey]
    if (regionCountry) return { city: cleaned || parts[0], country: regionCountry }

    // Try city → country lookup
    const strippedKey = rawKey.replace(AREA_SUFFIX_RE, "").replace(AREA_PREFIX_RE, "").trim()
    const cityCountry = CITY_TO_COUNTRY[key] || CITY_TO_COUNTRY[strippedKey]
    if (cityCountry) return { city: cleaned || parts[0], country: cityCountry }

    // Unknown single segment — store as country (safest default, avoids "Paris et périphérie" as city)
    return { city: cleaned || null, country: cleaned ? null : parts[0] }
  }


  // Scrape the title of the CURRENT role from the experience section.
  // This is more reliable than parsing the headline for people who use tagline-style
  // headlines like "Ex Morgan Stanley - Banking, Crypto, iGaming…" instead of
  // "Sales Director at BVNK". Returns { title, company } or null.
  //
  // When a person holds multiple concurrent roles (e.g. "Advisor at X" +
  // "Head of Y at Danske Bank") the first DOM entry isn't always the primary
  // job.  We collect all "Present" items, score them, and prefer operational
  // roles over advisory/board/non-exec ones.  Within the same tier we prefer
  // the role with the later start year.
  function scrapeCurrentTitle() {
    const PRESENT_RE = /\b(present|aujourd'hui|heute|heden|ahora|attuale|maintenant|현재|現在|сейчас|جاري)\b/i

    // Secondary/advisory/academic role keywords — deprioritized when a concurrent
    // operational role exists (e.g. "Lecturer at CBS" loses to "CTO at Monerium").
    const SECONDARY_RE = /\b(advisor|adviser|advisory|non-?executive|independent\s+director|board\s+(?:member|director|observer)|trustee|patron|mentor|ambassador|council|committee|bénévole|volunteer|professor|assoc(?:iate)?\s+professor|adjunct|lecturer|instructor|faculty|visiting\s+(?:scholar|professor|fellow|researcher)|research\s+fellow|academic|guest\s+(?:speaker|lecturer))\b/i

    // Employment type indicating a secondary engagement regardless of title.
    const PART_TIME_RE = /\bpart[\s-]?time\b/i

    // Helper: extract a clean title string from an experience item element.
    // LinkedIn renders experience items as <li> or pvs-entity blocks; the title is
    // typically in the first <span aria-hidden="true"> that is NOT the company name,
    // date range, or employment type.
    function titleFromItem(item) {
      // Try aria-label on the item's primary link first (often "Title at Company")
      const link = item.querySelector("a[href*='/company/'], a[href*='/in/']")
      if (link) {
        const label = (link.getAttribute("aria-label") ?? "").trim()
        if (label) {
          const { position } = parsePositionCompany(label)
          if (position && position.length > 1 && position.length < 80) return position
        }
      }
      // Fall through: grab all visible span texts and use the first short one
      // that doesn't look like a date, company name, or employment type.
      const DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|jan|fév|mar|avr|mai|juin|juil|août|sep|oct|nov|dec|\d{4})\b/i
      const EMP_TYPE_RE = /\b(full-time|part-time|freelance|contract|internship|self-employed|temps plein|temps partiel|indépendant)\b/i
      for (const span of item.querySelectorAll("span[aria-hidden='true']")) {
        const t = (span.textContent ?? "").trim()
        if (!t || t.length < 2 || t.length > 80) continue
        if (DATE_RE.test(t) || EMP_TYPE_RE.test(t)) continue
        if (/^\d/.test(t)) continue  // "2 years 3 months" etc.
        return t
      }
      return null
    }

    // Helper: extract the company name from an experience item.
    function companyFromItem(item) {
      // Best signal: aria-label on the company/profile link is often "Title at Company"
      const link = item.querySelector("a[href*='/company/'], a[href*='/in/']")
      if (link) {
        const label = (link.getAttribute("aria-label") ?? "").trim()
        if (label) {
          const { company } = parsePositionCompany(label)
          if (company && company.length > 1 && company.length < 80) return company
        }
        // Try the text of the company link itself
        for (const span of link.querySelectorAll("span[aria-hidden='true']")) {
          const t = (span.textContent ?? "").trim()
          if (t && t.length > 1 && t.length < 80) return t
        }
      }
      return null
    }

    // Helper: extract the start year of a role for recency scoring.
    function startYearFromItem(item) {
      const matches = [...(item.textContent ?? "").matchAll(/\b(19|20)(\d{2})\b/g)]
      const years = matches.map(m => parseInt(m[0]))
      return years.length ? Math.min(...years) : 0  // earliest year = start year
    }

    // Look inside the experience section for an item with a "Present" date range.
    function findExperienceSection() {
      const byAttr = document.querySelector("section[data-view-name*='experience']")
      if (byAttr) return byAttr
      for (const s of document.querySelectorAll("main section")) {
        const h = s.querySelector("h2, h3")
        if (!h) continue
        if (/^exp[eé]ri|^ervar|^erfahrung|^esperien|^experiencia|^do[sś]wiad/i.test(h.textContent.trim())) return s
      }
      return null
    }

    const expSection = findExperienceSection()
    if (!expSection) return null

    // Collect all concurrent "Present" roles.
    const candidates = []
    for (const item of expSection.querySelectorAll("li, [class*='pvs-entity'], [class*='experience-item']")) {
      if (!PRESENT_RE.test(item.textContent)) continue
      const title = titleFromItem(item)
      if (!title || title.length < 2 || title.length >= 80) continue
      const company   = companyFromItem(item)
      const startYear = startYearFromItem(item)
      // Mark as secondary if the title is advisory/academic OR if LinkedIn shows
      // the employment type as "Part-time" anywhere in the item's text.
      const secondary = SECONDARY_RE.test(title) || PART_TIME_RE.test(item.textContent)
      candidates.push({ title, company, startYear, secondary })
    }

    if (!candidates.length) return null

    // Sort: primary (non-advisory) roles first, then by most recent start year.
    candidates.sort((a, b) => {
      if (a.secondary !== b.secondary) return a.secondary ? 1 : -1
      return b.startYear - a.startYear
    })

    const best = candidates[0]
    console.debug("[6D title] candidates:", candidates, "→ best:", best)
    return { title: best.title, company: best.company }
  }

  function scrapeProfile() {
    const { firstName, lastName } = scrapeName()
    const location = scrapeLocation()
    const { city, country } = extractCityCountry(location)
    const headline = scrapeHeadline()
    const parsed = parsePositionCompany(headline)

    // DOM-based company (JSON-LD worksFor + company logo alt text) is more reliable
    // than headline string parsing — headline separators are ambiguous (e.g.
    // "Unified Commerce | Newblack" where "Unified Commerce" is a specialty, not a
    // company). scrapeCurrentTitle() now returns { title, company } from the ranked
    // experience entry — use that company first so title and company stay in sync
    // (avoids storing "Advisor" title but JSON-LD company from a different role).
    const currentRole = scrapeCurrentTitle()  // { title, company } | null
    const company = currentRole?.company || scrapeCompanyFromTopCard() || parsed.company || null

    // Prefer the current role title from the experience section over the headline-parsed
    // position. Headlines are often taglines ("Ex Morgan Stanley - Banking, Crypto…")
    // that don't encode the actual current title cleanly. Only fall back to the
    // headline-derived position when the DOM experience section yields nothing.
    const position = currentRole?.title || parsed.position
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

    console.debug("[6D profile] final result:", {
      firstName: profile.firstName,
      lastName: profile.lastName,
      company: profile.company,
      position: profile.position,
      photoUrl: profile.photoUrl ? profile.photoUrl.slice(0, 80) + "…" : null,
      location: profile.location,
    })
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
        ${p.degree !== "1" ? '<p class="sd-empty" style="font-size:11px;margin-top:8px">Will be tagged <strong>Followed</strong></p>' : ''}
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

  // Download a LinkedIn CDN photo and return it as a base64 data URI.
  // Runs in the LinkedIn tab so auth cookies are available.
  // Resizes to maxPx×maxPx to keep the DB payload small.
  async function fetchPhotoAsBase64(url, maxPx = 200) {
    if (!url) return null
    try {
      const resp = await fetch(url, { credentials: "include" })
      if (!resp.ok) return null
      const blob = await resp.blob()
      if (!blob.type.startsWith("image/")) return null
      return await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const scale = Math.min(1, maxPx / Math.max(img.width || maxPx, img.height || maxPx))
          canvas.width  = Math.round((img.width  || maxPx) * scale)
          canvas.height = Math.round((img.height || maxPx) * scale)
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82)
          URL.revokeObjectURL(img.src)
          resolve(dataUrl.length > 500 ? dataUrl : null)
        }
        img.onerror = () => resolve(null)
        img.src = URL.createObjectURL(blob)
      })
    } catch {
      return null
    }
  }

  async function saveContact() {
    const btn = panelEl?.querySelector("#sd-save-btn")
    const status = panelEl?.querySelector("#sd-status")
    if (!btn || !status) return

    btn.disabled = true
    btn.textContent = "Saving…"
    status.textContent = ""
    status.className = ""

    // Download photo as base64 so it's stored permanently (LinkedIn CDN URLs expire)
    let photoUrl = currentProfile.photoUrl
    if (photoUrl) {
      status.textContent = "Downloading photo…"
      const b64 = await fetchPhotoAsBase64(photoUrl)
      if (b64) photoUrl = b64
      status.textContent = ""
    }

    let result
    try {
      // Tag as "Followed" only for non-1st-degree contacts.
      // 1st-degree = already connected on LinkedIn — "Followed" doesn't apply.
      const addLabels = currentProfile.degree !== "1" ? ["Followed"] : []
      const payload = { ...currentProfile, photoUrl, addLabels }

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
      const errMsg = result?.error || "Something went wrong"
      // "Extension context invalidated" means the service worker was killed
      // (e.g. after an extension update). Reloading the page restores it.
      if (errMsg.toLowerCase().includes("context invalidated")) {
        status.textContent = "Extension reloaded — please refresh this page and try again"
      } else {
        status.textContent = errMsg
      }
      status.className = "err"
    }
  }

  // ─── Init & SPA navigation ────────────────────────────────────────────────────

  function showQueuedToast() {
    const shadow = getShadow()
    const existing = shadow.getElementById("sd-queued-toast")
    if (existing) existing.remove()
    const toast = document.createElement("div")
    toast.id = "sd-queued-toast"
    toast.textContent = "✓ Queued for review"
    shadow.appendChild(toast)
    setTimeout(() => toast.remove(), 2500)
  }

  async function init() {
    // Capture the path at init time — used to abort if the user navigates away
    // before the 3.5 s scrape delay fires (SPA navigation race condition).
    const initPath = window.location.pathname
    if (!initPath.startsWith("/in/")) return
    // Wait 3 seconds — LinkedIn's SPA lazily renders the profile sections and
    // the 1.5 s delay was too short for slower connections / large profiles.
    setTimeout(injectFab, 3000)

    // Auto-queue: silently capture this profile if toggle is enabled
    let cfg
    try {
      cfg = await new Promise((r) => chrome.storage.local.get(["autoQueue"], r))
    } catch {
      return // Extension context invalidated — service worker reloaded; skip silently.
    }
    if (!cfg.autoQueue) return

    setTimeout(async () => {
      // Abort if the user navigated away before the delay fired.
      // Normalize trailing slashes — LinkedIn sometimes redirects /in/slug → /in/slug/
      // which would cause a strict equality check to wrongly abort.
      const normPath = p => p.replace(/\/$/, "")
      if (normPath(window.location.pathname) !== normPath(initPath)) {
        console.debug("[6Degrees] auto-queue: path changed, aborting", initPath, "→", window.location.pathname)
        return
      }

      let profile
      try { profile = scrapeProfile() } catch (e) {
        console.debug("[6Degrees] auto-queue: scrapeProfile threw", e)
        return
      }
      if (!profile.firstName) {
        console.debug("[6Degrees] auto-queue: no firstName, aborting")
        return
      }

      console.debug("[6Degrees] auto-queue: queueing", profile.firstName, profile.lastName, "company:", profile.company)

      let photoUrl = profile.photoUrl
      if (photoUrl) {
        const b64 = await fetchPhotoAsBase64(photoUrl)
        if (b64) photoUrl = b64
      }

      const payload = { ...profile, photoUrl, pendingReview: true }
      try {
        chrome.runtime.sendMessage({ type: "QUEUE_CONTACT", data: payload })
        showQueuedToast()
        console.debug("[6Degrees] auto-queue: sent ✓")
      } catch (e) {
        console.debug("[6Degrees] auto-queue: sendMessage failed", e)
      }
    }, 3500)
  }

  // ─── SCRAPE_DEBUG message handler ───────────────────────────────────────────
  // The popup sends this to get a real-time profile scrape with captured debug
  // output, without the user needing to open DevTools.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "SCRAPE_DEBUG") return false

    // Temporarily intercept console.debug to capture [6D ...] log lines
    const debugLines = []
    const origDebug = console.debug
    console.debug = function (...args) {
      try {
        const line = args.map(a => {
          if (a === null || a === undefined) return String(a)
          if (typeof a === "object") { try { return JSON.stringify(a) } catch { return "[object]" } }
          return String(a)
        }).join(" ")
        if (line.startsWith("[6D")) debugLines.push(line)
      } catch { /* ignore capture errors */ }
      origDebug.apply(console, args)
    }

    let profile = null
    let error = null
    try {
      profile = scrapeProfile()
    } catch (e) {
      error = e.message
      debugLines.push("[ERROR] " + e.message)
    } finally {
      console.debug = origDebug
    }

    sendResponse({ profile, debugLines, error })
    return false // sendResponse called synchronously
  })

  // ─── Test fixture capture ─────────────────────────────────────────────────
  // Responds to CAPTURE_FIXTURE with the main element's HTML + current scrape
  // result so the popup can write a test fixture file.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "CAPTURE_FIXTURE") return false
    let profile = null, error = null
    try { profile = scrapeProfile() } catch (e) { error = e.message }
    const mainHtml = document.querySelector("main")?.innerHTML ?? ""
    sendResponse({
      profile,
      error,
      mainHtml,
      title: document.title,
      url: window.location.href,
      slug: window.location.pathname.replace(/^\/in\//, "").replace(/\/$/, "").split("/")[0],
    })
    return false
  })

  // ─── SPA navigation detection ─────────────────────────────────────────────
  // Uses subtree:true so any DOM mutation (not just direct body children) is
  // detected — required because LinkedIn's SPA sometimes mutates nested nodes.
  // The guard on location.pathname change prevents spurious re-inits.
  let lastPath = location.pathname
  new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname
      closePanel()
      fabEl?.remove()
      fabEl = null
      if (location.pathname.startsWith("/in/")) init()
      if (location.pathname.startsWith("/messaging")) {
        applyMessagingFullWidth()
        setTimeout(initInboxScraper, 2500)
      }
    }
  }).observe(document.body, { childList: true, subtree: true })

  // Only run profile-page logic when we're actually on a profile.
  if (path.startsWith("/in/")) init()
})()

// ─── Messaging full-width layout ─────────────────────────────────────────────
// Hides LinkedIn's right rail on /messaging so the inbox list gets full width.
function applyMessagingFullWidth() {
  if (document.getElementById("sd-msg-fullwidth")) return
  const style = document.createElement("style")
  style.id = "sd-msg-fullwidth"
  style.textContent = `
    /* Hide the right-rail aside */
    .scaffold-layout__aside,
    aside.scaffold-layout__aside { display: none !important; }
    /* Collapse any sidebar grid column */
    .scaffold-layout--main-two-sidebars,
    .scaffold-layout--main-one-sidebar {
      grid-template-columns: 1fr !important;
    }
    /* Expand the main messaging pane */
    .scaffold-layout__main {
      max-width: 100% !important;
      width: 100% !important;
      padding-right: 0 !important;
    }
    /* Remove the outer container's max-width cap */
    .scaffold-layout-container,
    .scaffold-layout-container--reflow {
      max-width: 100% !important;
      padding-right: 0 !important;
    }
  `
  document.head.appendChild(style)
}

// ─── LinkedIn inbox scraper (runs when initInboxScraper() is called) ─────────
// Scrapes the conversation list on linkedin.com/messaging and POSTs to
// /api/linkedin-dm/inbox-scan so the unified messages tab stays current.
async function initInboxScraper() {
  "use strict"

  let apiUrl, apiToken
  try {
    const cfg = await new Promise((r) => chrome.storage.local.get(["apiUrl", "apiToken"], r))
    apiUrl = cfg.apiUrl
    apiToken = cfg.apiToken
  } catch { return }
  if (!apiUrl || !apiToken) return

  const conversations = []
  const seen = new Set()

  // Thread links are the most stable anchor — LinkedIn always uses this URL pattern.
  // We iterate each link, find its closest <li>, then extract name / profile info.
  const threadLinks = document.querySelectorAll('a[href*="/messaging/thread/"]')

  for (const link of threadLinks) {
    const li = link.closest("li")
    if (!li) continue

    // ── Name extraction ──────────────────────────────────────────────────────
    let chatName = null

    // 1. aria-label on the thread link: "Conversation with John Doe" or just "John Doe"
    const ariaLabel = (link.getAttribute("aria-label") ?? "").trim()
    if (ariaLabel.length > 0 && ariaLabel.length < 100) {
      chatName = ariaLabel.replace(/^(conversation\s+with|chat\s+with)\s*/i, "").trim()
    }

    // 2. h3 / h4 / participant-name element
    if (!chatName) {
      const h = li.querySelector("h3, h4, [class*='participant-name'], [class*='conversation-name']")
      if (h) {
        const inner = h.querySelector("span[aria-hidden='true']") || h
        const t = (inner.textContent ?? "").trim()
        if (t.length > 0 && t.length < 100) chatName = t
      }
    }

    // 3. First visible span that looks like a name (not a timestamp / snippet)
    if (!chatName) {
      for (const span of li.querySelectorAll("span[aria-hidden='true']")) {
        const t = (span.textContent ?? "").trim()
        if (t.length < 2 || t.length > 80) continue
        if (/^\d/.test(t)) continue  // timestamps like "2h" or "Jan 15"
        if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) continue
        chatName = t
        break
      }
    }

    if (!chatName) continue

    const key = chatName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    // ── Profile URL extraction ────────────────────────────────────────────────
    let profileSlug = null
    let profileUrl = null
    for (const a of li.querySelectorAll('a[href*="/in/"]')) {
      const m = (a.href || "").match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/)
      if (m) {
        profileSlug = decodeURIComponent(m[1]).toLowerCase().replace(/[/?#].*/, "")
        profileUrl = `https://www.linkedin.com/in/${profileSlug}/`
        break
      }
    }

    // ── Last message direction ────────────────────────────────────────────────
    // Outbound messages start with "You: " / "Vous : " in the preview snippet.
    let lastInboxOutbound = null
    const spans = li.querySelectorAll("span[aria-hidden='true'], p")
    for (const el of spans) {
      const t = (el.textContent ?? "").trim()
      if (!t || t === chatName || t.length < 3 || t.length > 250) continue
      if (/^\d/.test(t)) continue
      if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t)) continue
      lastInboxOutbound = /^(you|vous)\s*:/i.test(t)
      break
    }

    const conversationId = profileSlug
      ? `inbox:${profileSlug}`
      : `inbox:name:${chatName.toLowerCase().replace(/\s+/g, "-")}`

    conversations.push({
      conversationId,
      chatName,
      profileUrl,
      lastInboxAt: new Date().toISOString(),
      lastInboxOutbound,
    })
  }

  if (!conversations.length) {
    console.debug("[6Degrees] inbox scraper: no conversations found")
    return
  }

  console.debug("[6Degrees] inbox scraper: found", conversations.length, "conversations")

  try {
    const res = await fetch(`${apiUrl}/api/linkedin-dm/inbox-scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ conversations }),
    })
    if (res.ok) {
      const data = await res.json()
      console.debug("[6Degrees] inbox scan saved:", data.upserted, "conversations")
    } else {
      console.debug("[6Degrees] inbox scan error:", res.status)
    }
  } catch (e) {
    console.debug("[6Degrees] inbox scan network error:", e)
  }
}

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
