const urlInput    = document.getElementById("apiUrl")
const tokenInput  = document.getElementById("apiToken")
const saveBtn     = document.getElementById("saveBtn")
const statusEl    = document.getElementById("status")
const statusDot   = document.getElementById("statusDot")
const statusText  = document.getElementById("statusText")
const updateBanner = document.getElementById("updateBanner")
const versionLine  = document.getElementById("versionLine")
const installedVersionEl = document.getElementById("installedVersion")

const { version: INSTALLED_VERSION } = chrome.runtime.getManifest()
installedVersionEl.textContent = INSTALLED_VERSION
document.getElementById("headerVersion").textContent = `v${INSTALLED_VERSION}`

// Simple semver comparison — returns negative if a < b, 0 if equal, positive if a > b
function semverCmp(a, b) {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

// Fetch version info from the server and show a banner if the extension is outdated
async function checkForUpdates(apiUrl) {
  try {
    const res = await fetch(`${apiUrl}/api/extension/version`, { cache: "no-store" })
    if (!res.ok) return
    const info = await res.json()

    const needsReinstall = info.reinstallRequiredBelow &&
      semverCmp(INSTALLED_VERSION, info.reinstallRequiredBelow) < 0

    const needsReload = !needsReinstall &&
      info.reloadRequiredBelow &&
      semverCmp(INSTALLED_VERSION, info.reloadRequiredBelow) < 0

    if (needsReinstall) {
      updateBanner.className = "update-banner reinstall"
      updateBanner.innerHTML =
        `<strong>⚠ Reinstall required (v${info.latest} available)</strong><br>` +
        `1. Download the new ZIP from <a href="${apiUrl}/extension" target="_blank">6Degrees → Extension page</a><br>` +
        `2. Extract it, replacing your current extension folder<br>` +
        `3. Go to <span class="ext-link" data-url="chrome://extensions">chrome://extensions</span> and click ↺ reload`
      updateBanner.style.display = "block"
    } else if (needsReload) {
      updateBanner.className = "update-banner reload"
      updateBanner.innerHTML =
        `<strong>↻ Update available (v${info.latest})</strong><br>` +
        `1. Download the new ZIP from <a href="${apiUrl}/extension" target="_blank">6Degrees → Extension page</a><br>` +
        `2. Extract it, replacing your current extension folder<br>` +
        `3. Go to <span class="ext-link" data-url="chrome://extensions">chrome://extensions</span> and click ↺ reload`
      updateBanner.style.display = "block"
    } else {
      updateBanner.style.display = "none"
    }
    // Wire up chrome:// links (href doesn't work in extension popups)
    updateBanner.querySelectorAll(".ext-link").forEach(el => {
      el.style.cssText = "cursor:pointer;text-decoration:underline;color:inherit"
      el.addEventListener("click", () => chrome.tabs.create({ url: el.dataset.url }))
    })
  } catch {
    // Version check is best-effort; ignore network errors
  }
}

const autoQueueEl = document.getElementById("autoQueue")

// Load saved settings
chrome.storage.local.get(["apiUrl", "apiToken", "autoQueue"], ({ apiUrl, apiToken, autoQueue }) => {
  const url = apiUrl || "https://6degrees.aequus.money"
  urlInput.value = url
  if (apiToken) tokenInput.value = apiToken
  if (autoQueueEl) autoQueueEl.checked = !!autoQueue
  updateConnectionIndicator(apiUrl, apiToken)
  checkForUpdates(url)
})

// Persist autoQueue immediately on change
if (autoQueueEl) {
  autoQueueEl.addEventListener("change", () => {
    chrome.storage.local.set({ autoQueue: autoQueueEl.checked })
  })
}

saveBtn.addEventListener("click", async () => {
  const apiUrl   = urlInput.value.trim().replace(/\/$/, "")
  const apiToken = tokenInput.value.trim()

  if (!apiUrl) { showStatus("Please enter your 6Degrees URL", "err"); return }
  if (!apiToken) { showStatus("Please enter your extension token", "err"); return }

  saveBtn.disabled = true
  saveBtn.textContent = "Verifying…"

  try {
    const res = await fetch(`${apiUrl}/api/extension/enrich`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    })
    if (res.status === 404) {
      showStatus("URL not found — check your 6Degrees URL", "err")
      saveBtn.disabled = false; saveBtn.textContent = "Save settings"
      return
    }
    if (res.status === 401) {
      showStatus("Invalid token — generate a new one in Settings", "err")
      saveBtn.disabled = false; saveBtn.textContent = "Save settings"
      return
    }
    if (!res.ok) {
      showStatus(`Server error (${res.status}) — try again or regenerate token`, "err")
      saveBtn.disabled = false; saveBtn.textContent = "Save settings"
      return
    }
  } catch {
    showStatus("Cannot reach that URL — check it and try again", "err")
    saveBtn.disabled = false; saveBtn.textContent = "Save settings"
    return
  }

  await chrome.storage.local.set({ apiUrl, apiToken })
  showStatus("✓ Saved!", "ok")
  updateConnectionIndicator(apiUrl, apiToken)
  checkForUpdates(apiUrl)
  // Tell any open 6Degrees tab to refresh the localStorage backup immediately.
  chrome.runtime.sendMessage({ type: "BACKUP_TO_APP_TAB" })
  saveBtn.disabled = false
  saveBtn.textContent = "Save settings"
})

function updateConnectionIndicator(apiUrl, apiToken) {
  if (apiUrl && apiToken) {
    statusDot.className = "status-dot connected"
    try { statusText.textContent = new URL(apiUrl).hostname } catch { statusText.textContent = apiUrl }
  } else {
    statusDot.className = "status-dot"
    statusText.textContent = "Not configured"
  }
}

function showStatus(msg, type) {
  statusEl.textContent = msg
  statusEl.className = `status ${type}`
  setTimeout(() => { statusEl.textContent = ""; statusEl.className = "status" }, 3000)
}

// ─── Profile debug panel ──────────────────────────────────────────────────────
// When the popup opens on a LinkedIn /in/ page, automatically run the scraper
// via a message to the content script and display the results — no DevTools needed.

const profilePanel   = document.getElementById("profilePanel")
const scrapeStatusEl = document.getElementById("scrapeStatus")
const dbgName        = document.getElementById("dbg-name")
const dbgCompany     = document.getElementById("dbg-company")
const dbgRole        = document.getElementById("dbg-role")
const dbgPhoto       = document.getElementById("dbg-photo")
const dbgHeadline    = document.getElementById("dbg-headline")
const dbgLogEl       = document.getElementById("dbg-log")
const toggleLogBtn   = document.getElementById("toggleLog")
const copyDebugBtn   = document.getElementById("copy-debug")
const copyAllBtn     = document.getElementById("copy-all")
const rescrapeBtn    = document.getElementById("rescrape-btn")

let lastDebugLines = []
let lastProfile = null
let activeTabId = null
let pageKind = null   // "profile" | "messaging"

toggleLogBtn?.addEventListener("click", () => {
  const visible = dbgLogEl.style.display !== "none"
  dbgLogEl.style.display = visible ? "none" : "block"
  toggleLogBtn.textContent = (visible ? "▶" : "▼") + " raw log"
})

function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + "…" : (s || "—") }

function populatePanel(profile, debugLines, error) {
  lastDebugLines = debugLines || []
  lastProfile = profile

  if (error && !profile) {
    scrapeStatusEl.textContent = "error"
    dbgName.textContent = "Error: " + error
    dbgName.className = "dbg-val err"
    return
  }

  scrapeStatusEl.textContent = ""

  if (profile) {
    const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ")
    dbgName.textContent = name || "—"
    dbgName.className = "dbg-val"

    // Company: extract strategy number from debug log for quick reference
    let companyStrategy = ""
    for (const line of lastDebugLines) {
      const m = line.match(/\[6D company\] Strategy (\d+)[^:]*:\s*(.+)/)
      if (m) companyStrategy = `  [via strategy ${m[1]}]`
    }
    dbgCompany.textContent = (profile.company || "—") + companyStrategy
    dbgCompany.className = "dbg-val" + (profile.company ? "" : " warn")

    dbgRole.textContent = truncate(profile.position, 70)
    dbgRole.className = "dbg-val"

    // Photo: show strategy + truncated URL
    let photoStrategy = ""
    for (const line of lastDebugLines) {
      const m = line.match(/\[6D photo\] Strategy (\d+) (win|hit)/)
      if (m) { photoStrategy = ` [s${m[1]}]`; break }
    }
    if (profile.photoUrl) {
      dbgPhoto.textContent = "✓" + photoStrategy + "  " + profile.photoUrl.slice(0, 55) + "…"
      dbgPhoto.className = "dbg-val ok"
    } else {
      dbgPhoto.textContent = "✗ not found"
      dbgPhoto.className = "dbg-val err"
    }

    dbgHeadline.textContent = truncate(profile.headline, 80)
  }

  dbgLogEl.value = lastDebugLines.join("\n")
  // Auto-expand log if there's content
  if (lastDebugLines.length > 0) {
    dbgLogEl.style.display = "block"
    toggleLogBtn.textContent = "▼ raw log"
  }
}

function runScrape(tabId) {
  scrapeStatusEl.textContent = "scraping…"
  dbgName.textContent = "—"
  dbgCompany.textContent = "—"
  dbgRole.textContent = "—"
  dbgPhoto.textContent = "—"
  dbgHeadline.textContent = "—"
  dbgLogEl.value = ""

  chrome.tabs.sendMessage(tabId, { type: "SCRAPE_DEBUG" }, (response) => {
    if (chrome.runtime.lastError) {
      scrapeStatusEl.textContent = "error"
      dbgName.textContent = chrome.runtime.lastError.message || "content script not ready"
      dbgName.className = "dbg-val err"
      return
    }
    if (!response) {
      scrapeStatusEl.textContent = "no response"
      dbgName.textContent = "Page may still be loading — try re-scrape"
      dbgName.className = "dbg-val warn"
      return
    }
    populatePanel(response.profile, response.debugLines, response.error)
  })
}

// Auto-run when popup opens on a LinkedIn /in/ profile or /messaging page
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0]
  if (!tab || !tab.url) return

  if (tab.url.includes("linkedin.com/in/")) {
    activeTabId = tab.id
    pageKind = "profile"
    profilePanel.style.display = "block"
    runScrape(tab.id)
  } else if (tab.url.includes("linkedin.com/messaging")) {
    activeTabId = tab.id
    pageKind = "messaging"
    profilePanel.style.display = "block"
    // Repurpose the panel for messaging: hide the profile-only debug rows and
    // relabel the fixture button so one click captures the messaging DOM.
    const title = document.querySelector("#profilePanel .panel-title")
    if (title) title.innerHTML = "💬 Messaging page debug"
    if (scrapeStatusEl) scrapeStatusEl.textContent = ""
    for (const row of document.querySelectorAll("#profilePanel .dbg-row")) {
      row.style.display = "none"
    }
    const logWrap = document.querySelector("#profilePanel .dbg-log-wrap")
    if (logWrap) logWrap.style.display = "none"
    const firstCopyRow = document.querySelector("#profilePanel .copy-row")
    if (firstCopyRow) firstCopyRow.style.display = "none"
    if (copyFixtureBtn) {
      copyFixtureBtn.textContent = "📋 Copy messaging debug"
      copyFixtureBtn.title = "Capture the messaging-page DOM structure for debugging"
    }
  }
})

rescrapeBtn?.addEventListener("click", () => {
  if (activeTabId) runScrape(activeTabId)
})

copyDebugBtn?.addEventListener("click", () => {
  const text = dbgLogEl.value
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    copyDebugBtn.textContent = "Copied!"
    setTimeout(() => { copyDebugBtn.textContent = "Copy log" }, 1500)
  }).catch(() => {
    dbgLogEl.select()
    document.execCommand("copy")
    copyDebugBtn.textContent = "Copied!"
    setTimeout(() => { copyDebugBtn.textContent = "Copy log" }, 1500)
  })
})

copyAllBtn?.addEventListener("click", () => {
  if (!lastProfile) return
  const p = lastProfile
  const lines = [
    `Name:     ${[p.firstName, p.lastName].filter(Boolean).join(" ")}`,
    `Company:  ${p.company || "(none)"}`,
    `Role:     ${p.position || "(none)"}`,
    `Photo:    ${p.photoUrl || "(none)"}`,
    `Headline: ${p.headline || "(none)"}`,
    `Location: ${p.location || "(none)"}`,
    `URL:      ${p.profileUrl || "(none)"}`,
    "",
    "=== DEBUG LOG ===",
    ...lastDebugLines,
  ].join("\n")
  navigator.clipboard.writeText(lines).then(() => {
    copyAllBtn.textContent = "Copied!"
    setTimeout(() => { copyAllBtn.textContent = "Copy all fields" }, 1500)
  }).catch(() => {
    dbgLogEl.value = lines
    dbgLogEl.select()
    document.execCommand("copy")
    copyAllBtn.textContent = "Copied!"
    setTimeout(() => { copyAllBtn.textContent = "Copy all fields" }, 1500)
  })
})

// ─── Copy test fixture ────────────────────────────────────────────────────────
const copyFixtureBtn = document.getElementById("copy-fixture")
copyFixtureBtn?.addEventListener("click", () => {
  if (!activeTabId) {
    copyFixtureBtn.textContent = "Not on a LinkedIn page"
    setTimeout(() => { copyFixtureBtn.textContent = "📋 Copy test fixture" }, 2000)
    return
  }

  // Messaging page: capture DOM diagnostics instead of a profile fixture.
  if (pageKind === "messaging") {
    copyFixtureBtn.textContent = "Capturing…"
    chrome.tabs.sendMessage(activeTabId, { type: "CAPTURE_MSG_FIXTURE" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        copyFixtureBtn.textContent = "Error — reload page"
        setTimeout(() => { copyFixtureBtn.textContent = "📋 Copy messaging debug" }, 2000)
        return
      }
      const json = JSON.stringify(response, null, 2)
      navigator.clipboard.writeText(json).then(() => {
        copyFixtureBtn.textContent = "✓ Messaging debug copied!"
        setTimeout(() => { copyFixtureBtn.textContent = "📋 Copy messaging debug" }, 2500)
      }).catch(() => {
        copyFixtureBtn.textContent = "Error — check console"
        setTimeout(() => { copyFixtureBtn.textContent = "📋 Copy messaging debug" }, 2500)
      })
    })
    return
  }

  copyFixtureBtn.textContent = "Capturing…"
  chrome.tabs.sendMessage(activeTabId, { type: "CAPTURE_FIXTURE" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      copyFixtureBtn.textContent = "Error — reload page"
      setTimeout(() => { copyFixtureBtn.textContent = "📋 Copy test fixture" }, 2000)
      return
    }
    const p = response.profile ?? {}
    // Build the fixture JSON — "expected" is pre-filled from current scrape result.
    // Edit the expected values if the scrape is wrong before committing the fixture.
    const fixture = {
      name: [p.firstName, p.lastName].filter(Boolean).join(" ") || response.slug,
      slug: response.slug,
      title: response.title,
      url: response.url,
      expected: {
        firstName: p.firstName ?? null,
        lastName: p.lastName ?? null,
        company: p.company ?? null,
        position: p.position ?? null,
        city: p.city ?? null,
        country: p.country ?? null,
        hasPhoto: !!p.photoUrl,
        photoIdContains: p.photoUrl
          ? (p.photoUrl.match(/\/([A-Za-z0-9_-]{20,})\//)?.[1] ?? null)
          : null,
      },
      // mainHtml is large — paste this JSON into tests/scraper/fixtures/<name>.json
      // then verify "expected" values match ground truth before committing.
      mainHtml: response.mainHtml,
    }
    const json = JSON.stringify(fixture, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      copyFixtureBtn.textContent = "✓ Fixture copied!"
      setTimeout(() => { copyFixtureBtn.textContent = "📋 Copy test fixture" }, 2000)
    }).catch(() => {
      copyFixtureBtn.textContent = "Error — check console"
      setTimeout(() => { copyFixtureBtn.textContent = "📋 Copy test fixture" }, 2000)
    })
  })
})
