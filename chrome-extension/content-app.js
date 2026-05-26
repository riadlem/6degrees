;(function () {
  "use strict"

  // ── Auto-save / auto-restore extension credentials ───────────────────────────
  //
  // This content script runs on the 6Degrees web app (6degrees.aequus.money).
  // It keeps a backup of the extension credentials (apiUrl + apiToken) in the
  // page's localStorage so they survive an extension reinstall.
  //
  // On every visit:
  //   1. If chrome.storage.local is EMPTY (just reinstalled) → restore from backup
  //   2. If chrome.storage.local has credentials → write them to localStorage backup
  //
  // The backup is stored under the key "6d_ext_settings" in the 6Degrees app's
  // localStorage (same origin as the web app, not accessible to other origins).
  // ─────────────────────────────────────────────────────────────────────────────

  const STORAGE_KEY = "6d_ext_settings"

  function backup() {
    chrome.storage.local.get(["apiUrl", "apiToken"], ({ apiUrl, apiToken }) => {
      if (!apiUrl || !apiToken) return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiUrl, apiToken }))
      } catch { /* storage full or blocked — ignore */ }
    })
  }

  function tryRestore() {
    chrome.storage.local.get(["apiToken"], ({ apiToken }) => {
      if (apiToken) {
        // Already configured — refresh the backup so it stays current.
        backup()
        return
      }

      // Extension storage empty (just reinstalled) — try the localStorage backup.
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return

        const { apiUrl, apiToken: savedToken } = JSON.parse(raw)
        if (!apiUrl || !savedToken) return

        chrome.storage.local.set({ apiUrl, apiToken: savedToken }, () => {
          showToast("🔗 Extension reconnected automatically")
        })
      } catch { /* corrupted — ignore */ }
    })
  }

  function showToast(msg) {
    const el = document.createElement("div")
    el.textContent = msg
    el.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "right:24px",
      "z-index:99999",
      "background:#1d4ed8",
      "color:#fff",
      "padding:10px 18px",
      "border-radius:10px",
      "font-size:13px",
      "font-weight:500",
      "box-shadow:0 4px 14px rgba(0,0,0,.18)",
      "pointer-events:none",
      "font-family:system-ui,sans-serif",
    ].join(";")
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 3500)
  }

  // ── Also respond to explicit backup requests from the popup (after save) ─────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "BACKUP_CREDENTIALS") backup()
  })

  tryRestore()
})()
