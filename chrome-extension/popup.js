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
        `<strong>⚠ Reinstall required (v${info.latest} available)</strong>` +
        `Download the new version from <a href="${apiUrl}/extension" target="_blank">6Degrees → Extension</a> ` +
        `and replace the loaded folder in <code>chrome://extensions</code>.`
      updateBanner.style.display = "block"
    } else if (needsReload) {
      updateBanner.className = "update-banner reload"
      updateBanner.innerHTML =
        `<strong>↻ Reload needed (v${info.latest} available)</strong>` +
        `Open <a href="chrome://extensions" target="_blank">chrome://extensions</a> ` +
        `and click the <strong>↺ reload</strong> icon next to 6Degrees.`
      updateBanner.style.display = "block"
    } else {
      updateBanner.style.display = "none"
    }
  } catch {
    // Version check is best-effort; ignore network errors
  }
}

// Load saved settings
chrome.storage.local.get(["apiUrl", "apiToken"], ({ apiUrl, apiToken }) => {
  const url = apiUrl || "https://6degrees-one.vercel.app"
  urlInput.value = url
  if (apiToken) tokenInput.value = apiToken
  updateConnectionIndicator(apiUrl, apiToken)
  checkForUpdates(url)
})

saveBtn.addEventListener("click", async () => {
  const apiUrl   = urlInput.value.trim().replace(/\/$/, "")
  const apiToken = tokenInput.value.trim()

  if (!apiUrl) { showStatus("Please enter your 6Degrees URL", "err"); return }
  if (!apiToken) { showStatus("Please enter your extension token", "err"); return }

  saveBtn.disabled = true
  saveBtn.textContent = "Verifying…"

  try {
    const res = await fetch(`${apiUrl}/api/extension/token`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    })
    if (res.status === 404) {
      showStatus("URL not found — check your 6Degrees URL", "err")
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
