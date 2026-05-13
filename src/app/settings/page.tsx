"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Copy, RefreshCw, Check, Puzzle } from "lucide-react"

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/extension/token")
        .then((r) => r.json())
        .then((d) => setToken(d.token))
        .finally(() => setLoading(false))
    }
  }, [status])

  async function regenerate() {
    setRegenerating(true)
    try {
      const res = await fetch("/api/extension/token", { method: "POST" })
      const d = await res.json()
      setToken(d.token)
    } finally {
      setRegenerating(false)
    }
  }

  function copy() {
    if (!token) return
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : ""

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-8">{session?.user?.name}</p>

      {/* Chrome Extension */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <Puzzle size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Chrome Extension</h2>
            <p className="text-xs text-gray-500">Capture LinkedIn profiles directly from your browser</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* API URL */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Your 6Degrees URL</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={appUrl}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 font-mono text-gray-700"
              />
              <button
                onClick={() => { navigator.clipboard.writeText(appUrl) }}
                className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Extension Token */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Extension Token</label>
            {loading ? (
              <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
            ) : token ? (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={token}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 font-mono text-gray-700 truncate"
                />
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors shrink-0"
                >
                  {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No token yet — generate one below.</p>
            )}

            <button
              onClick={regenerate}
              disabled={regenerating}
              className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              <RefreshCw size={12} className={regenerating ? "animate-spin" : ""} />
              {token ? "Regenerate token" : "Generate token"}
            </button>
            {token && (
              <p className="text-xs text-amber-600 mt-1">
                Regenerating invalidates the old token — update the extension after.
              </p>
            )}
          </div>

          {/* Setup instructions */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700">Setup instructions</p>
            <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside">
              <li>Download the <code className="bg-gray-200 rounded px-1">chrome-extension/</code> folder from the project</li>
              <li>Open Chrome → <code className="bg-gray-200 rounded px-1">chrome://extensions</code> → Enable Developer mode</li>
              <li>Click <strong>Load unpacked</strong> and select the <code className="bg-gray-200 rounded px-1">chrome-extension</code> folder</li>
              <li>Click the extension icon in your toolbar → paste your URL and token above</li>
              <li>Visit any LinkedIn profile — click the <strong>Save to 6Degrees</strong> button</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
