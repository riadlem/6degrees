"use client"

import { useState, useEffect, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Copy, RefreshCw, Check, Puzzle, Mail, Loader2, Trash2, MessageCircle, Upload } from "lucide-react"
import { useGmailSyncContext } from "@/contexts/GmailSyncContext"
import { useRef } from "react"

type GmailStatus = {
  connected: boolean
  gmailEmail: string | null
  syncedAt: string | null
  totalMessages: number
}

type WhatsAppStatus = {
  importedAt: string | null
  totalMessages: number
  totalChats: number
}

function SettingsPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { gmailSyncState, sync: gmailSync } = useGmailSyncContext()

  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [waImporting, setWaImporting] = useState(false)
  const [waProgress, setWaProgress] = useState<string | null>(null)
  const [waResult, setWaResult] = useState<{ synced: number; chats: number; matched: number } | null>(null)
  const waFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/extension/token")
        .then((r) => r.json())
        .then((d) => setToken(d.token))
        .finally(() => setLoading(false))

      fetch("/api/gmail/sync")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setGmailStatus(d))

      fetch("/api/whatsapp/status")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setWaStatus(d))
    }
  }, [status])

  // Refresh Gmail status after connecting
  useEffect(() => {
    if (searchParams.get("gmail") === "connected") {
      fetch("/api/gmail/sync")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setGmailStatus(d))
    }
  }, [searchParams])

  async function disconnectGmail() {
    setDisconnecting(true)
    await fetch("/api/gmail/disconnect", { method: "DELETE" })
    setGmailStatus({ connected: false, gmailEmail: null, syncedAt: null, totalMessages: 0 })
    setDisconnecting(false)
  }

  const gmailSyncing =
    gmailSyncState.phase === "connecting" ||
    gmailSyncState.phase === "fetching" ||
    gmailSyncState.phase === "syncing"

  const gmailSyncLabel =
    gmailSyncState.phase === "connecting" ? "Connecting…" :
    gmailSyncState.phase === "fetching" ? (gmailSyncState.message ?? "Fetching…") :
    gmailSyncState.phase === "syncing"
      ? `${gmailSyncState.synced} / ${gmailSyncState.total} emails`
      : gmailSyncState.phase === "done"
      ? `Done — ${gmailSyncState.synced} emails synced`
      : null

  async function importWhatsApp(files: FileList) {
    if (files.length === 0) return
    setWaImporting(true)
    setWaProgress("Preparing…")
    setWaResult(null)

    const formData = new FormData()
    for (const file of Array.from(files)) formData.append("files", file)

    try {
      const res = await fetch("/api/whatsapp/import", { method: "POST", body: formData })
      if (!res.ok || !res.body) { setWaProgress("Import failed"); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === "status") setWaProgress(event.message)
            else if (event.type === "progress") setWaProgress(`${event.file}: ${event.synced} messages${event.matched ? " ✓" : " (no match)"}`)
            else if (event.type === "done") {
              setWaResult({ synced: event.synced, chats: event.chats, matched: event.matched })
              setWaProgress(null)
              setWaStatus((prev) => ({
                importedAt: new Date().toISOString(),
                totalMessages: (prev?.totalMessages ?? 0) + event.synced,
                totalChats: (prev?.totalChats ?? 0) + event.chats,
              }))
            } else if (event.type === "error") {
              setWaProgress(`Error: ${event.message}`)
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      setWaImporting(false)
      if (waFileRef.current) waFileRef.current.value = ""
    }
  }

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

      {/* Gmail Integration */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
            <Mail size={18} className="text-red-500" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Gmail Integration</h2>
            <p className="text-xs text-gray-500">Match 15+ years of email history to your contacts</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {gmailStatus?.connected ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm text-gray-700 font-medium">{gmailStatus.gmailEmail}</span>
              </div>

              {gmailStatus.syncedAt && (
                <p className="text-xs text-gray-500">
                  Last synced: {new Date(gmailStatus.syncedAt).toLocaleString()} · {gmailStatus.totalMessages.toLocaleString()} emails indexed
                </p>
              )}

              {gmailSyncLabel && (
                <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                  <Loader2 size={12} className="animate-spin" />
                  {gmailSyncLabel}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => gmailSync(false)}
                  disabled={gmailSyncing}
                  className="flex items-center gap-1.5 text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={13} className={gmailSyncing ? "animate-spin" : ""} />
                  {gmailSyncing ? "Syncing…" : "Sync emails"}
                </button>
                <button
                  onClick={() => gmailSync(true)}
                  disabled={gmailSyncing}
                  className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Quick sync
                </button>
                <button
                  onClick={disconnectGmail}
                  disabled={disconnecting}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 ml-auto disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Connect Gmail to automatically match your email history with your contacts and surface relationships worth rekindling.
              </p>
              <a
                href="/api/auth/gmail-connect"
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors"
              >
                <Mail size={14} />
                Connect Gmail
              </a>
            </>
          )}

          <p className="text-xs text-gray-400">
            Only sender, subject, and date are stored. Email bodies are never imported.
          </p>
        </div>
      </div>

      {/* WhatsApp History */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
            <MessageCircle size={18} className="text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">WhatsApp History</h2>
            <p className="text-xs text-gray-500">Import chat exports to boost relationship scores</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {waStatus?.importedAt && (
            <p className="text-xs text-gray-500">
              Last import: {new Date(waStatus.importedAt).toLocaleString()} · {waStatus.totalMessages.toLocaleString()} messages across {waStatus.totalChats} chats
            </p>
          )}

          {waResult && (
            <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
              Imported {waResult.synced.toLocaleString()} messages from {waResult.chats} chat{waResult.chats !== 1 ? "s" : ""} — {waResult.matched} matched to contacts
            </div>
          )}

          {waProgress && (
            <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              <Loader2 size={12} className="animate-spin" />
              {waProgress}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              ref={waFileRef}
              type="file"
              accept=".txt"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && importWhatsApp(e.target.files)}
            />
            <button
              onClick={() => waFileRef.current?.click()}
              disabled={waImporting}
              className="flex items-center gap-2 text-sm bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Upload size={13} />
              {waImporting ? "Importing…" : "Import chat files"}
            </button>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-700">How to export a WhatsApp chat</p>
            <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
              <li>Open WhatsApp → tap any chat</li>
              <li>Tap ⋮ (Android) or contact name (iPhone) → <strong>More</strong> → <strong>Export chat</strong></li>
              <li>Choose <strong>Without media</strong></li>
              <li>Save the .txt file and upload it here</li>
              <li>Repeat for each contact you want to import</li>
            </ol>
          </div>

          <p className="text-xs text-gray-400">
            Only contact names and timestamps are stored. Message content is never imported.
          </p>
        </div>
      </div>

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

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  )
}
