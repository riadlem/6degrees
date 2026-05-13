const urlInput = document.getElementById("apiUrl")
const tokenInput = document.getElementById("apiToken")
const saveBtn = document.getElementById("saveBtn")
const statusEl = document.getElementById("status")
const statusDot = document.getElementById("statusDot")
const statusText = document.getElementById("statusText")

// Load saved settings
chrome.storage.local.get(["apiUrl", "apiToken"], ({ apiUrl, apiToken }) => {
  if (apiUrl) urlInput.value = apiUrl
  if (apiToken) tokenInput.value = apiToken
  updateConnectionIndicator(apiUrl, apiToken)
})

saveBtn.addEventListener("click", async () => {
  const apiUrl = urlInput.value.trim().replace(/\/$/, "")
  const apiToken = apiToken_ = tokenInput.value.trim()

  if (!apiUrl) {
    showStatus("Please enter your 6Degrees URL", "err")
    return
  }
  if (!apiToken) {
    showStatus("Please enter your extension token", "err")
    return
  }

  saveBtn.disabled = true
  saveBtn.textContent = "Verifying…"

  // Test connection
  try {
    const res = await fetch(`${apiUrl}/api/extension/token`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    })
    // A 401 is expected (token endpoint uses session auth, not bearer),
    // but a network error means the URL is wrong
    if (res.status === 404) {
      showStatus("URL not found — check your 6Degrees URL", "err")
      saveBtn.disabled = false
      saveBtn.textContent = "Save settings"
      return
    }
  } catch {
    showStatus("Cannot reach that URL — check it and try again", "err")
    saveBtn.disabled = false
    saveBtn.textContent = "Save settings"
    return
  }

  await chrome.storage.local.set({ apiUrl, apiToken })
  showStatus("✓ Saved!", "ok")
  updateConnectionIndicator(apiUrl, apiToken)
  saveBtn.disabled = false
  saveBtn.textContent = "Save settings"
})

function updateConnectionIndicator(apiUrl, apiToken) {
  if (apiUrl && apiToken) {
    statusDot.className = "status-dot connected"
    statusText.textContent = new URL(apiUrl).hostname
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

// Silence the intentional re-use of apiToken_ variable name
var apiToken_
