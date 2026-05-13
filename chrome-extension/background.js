chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ENRICH_CONTACT") {
    handleEnrich(message.data).then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message }))
    return true // keep channel open for async
  }
  if (message.type === "GET_CONFIG") {
    chrome.storage.local.get(["apiUrl", "apiToken"], sendResponse)
    return true
  }
})

async function handleEnrich(data) {
  const config = await new Promise((resolve) => chrome.storage.local.get(["apiUrl", "apiToken"], resolve))
  const { apiUrl, apiToken } = config

  if (!apiUrl || !apiToken) {
    return { ok: false, error: "Not configured — open the extension popup to set up." }
  }

  const url = apiUrl.replace(/\/$/, "") + "/api/extension/enrich"

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify(data),
  })

  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, ...json }
}
