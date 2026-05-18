"use client"

import { useState, useEffect, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Copy, RefreshCw, Check, Puzzle, Mail, Loader2, Trash2, MessageCircle, Upload, AtSign, X, Plus, ChevronDown, ChevronUp, UserCheck, Search, Ban, UserPlus, ExternalLink } from "lucide-react"
import { useGmailSyncContext } from "@/contexts/GmailSyncContext"
import { useRef } from "react"

type GmailStatus = {
  connected: boolean
  gmailEmail: string | null
  syncedAt: string | null
  totalMessages: number
  matchedContacts: number
  historyId: string | null
}

function formatParis(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "")
}

type WhatsAppStatus = {
  importedAt: string | null
  totalMessages: number
  totalChats: number
}

type UnmatchedSender = {
  fromEmail: string
  fromName: string | null
  messageCount: number
  lastSeen: string | null
  recommendations: { contactId: string; name: string; company: string | null; matchReason: string }[]
}

type ContactResult = { id: string; firstName: string; lastName: string; company: string | null }
type LkdPendingContact = { id: string; firstName: string; lastName: string; emailAddress: string | null; company: string | null; outreachUpdatedAt: string | null }

function SettingsPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { gmailSyncState, sync: gmailSync, lastSyncedAt } = useGmailSyncContext()

  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null)
  const [lastSyncDiag, setLastSyncDiag] = useState<{ mode: string; scanned: number; inserted: number; historyId: string | null } | null>(null)
  const [copiedHistoryId, setCopiedHistoryId] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [userEmails, setUserEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState("")
  const [addingEmail, setAddingEmail] = useState(false)

  const [unmatchedOpen, setUnmatchedOpen] = useState(false)
  const [unmatchedSenders, setUnmatchedSenders] = useState<UnmatchedSender[]>([])
  const [unmatchedTotal, setUnmatchedTotal] = useState(0)
  const [autoFilteredCount, setAutoFilteredCount] = useState(0)
  const [unmatchedPage, setUnmatchedPage] = useState(0)
  const [unmatchedLoading, setUnmatchedLoading] = useState(false)
  const [assigningFor, setAssigningFor] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<ContactResult[]>([])
  const [assigning, setAssigning] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [addingToLinkedIn, setAddingToLinkedIn] = useState<string | null>(null)
  const [lkdQueueOpen, setLkdQueueOpen] = useState(false)
  const [lkdQueue, setLkdQueue] = useState<LkdPendingContact[]>([])
  const [lkdQueueLoading, setLkdQueueLoading] = useState(false)
  const [markingDone, setMarkingDone] = useState<string | null>(null)

  const [waImporting, setWaImporting] = useState(false)
  const [waProgress, setWaProgress] = useState<string | null>(null)
  const [waResult, setWaResult] = useState<{ synced: number; chats: number; matched: number } | null>(null)
  const waFileRef = useRef<HTMLInputElement>(null)
  const waDbRef = useRef<HTMLInputElement>(null)

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

      fetch("/api/user/emails")
        .then((r) => r.ok ? r.json() : [])
        .then((rows: { email: string }[]) => setUserEmails(rows.map((r) => r.email)))
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

  async function addEmail() {
    const email = newEmail.toLowerCase().trim()
    if (!email || !email.includes("@")) return
    setAddingEmail(true)
    try {
      const res = await fetch("/api/user/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setUserEmails((prev) => prev.includes(email) ? prev : [...prev, email])
        setNewEmail("")
      }
    } finally {
      setAddingEmail(false)
    }
  }

  async function removeEmail(email: string) {
    await fetch(`/api/user/emails/${encodeURIComponent(email)}`, { method: "DELETE" })
    setUserEmails((prev) => prev.filter((e) => e !== email))
  }

  async function loadUnmatched(page = 0, forceRefresh = false) {
    if (page === 0 && !forceRefresh) {
      try {
        const raw = sessionStorage.getItem("unmatchedSenders_cache")
        if (raw) {
          const { data, ts } = JSON.parse(raw)
          if (Date.now() - ts < 5 * 60 * 1000) {
            setUnmatchedSenders(data.senders)
            setUnmatchedTotal(data.total)
            setAutoFilteredCount(data.autoFilteredCount ?? 0)
            setUnmatchedPage(0)
            return
          }
        }
      } catch { /* ignore parse errors */ }
    }
    setUnmatchedLoading(true)
    try {
      const res = await fetch(`/api/gmail/unmatched?page=${page}`)
      if (!res.ok) return
      const data = await res.json()
      if (page === 0) {
        sessionStorage.setItem("unmatchedSenders_cache", JSON.stringify({ data, ts: Date.now() }))
      }
      setUnmatchedSenders(page === 0 ? data.senders : (prev) => [...prev, ...data.senders])
      setUnmatchedTotal(data.total)
      setAutoFilteredCount(data.autoFilteredCount ?? 0)
      setUnmatchedPage(page)
    } finally {
      setUnmatchedLoading(false)
    }
  }

  async function searchContacts(q: string) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}&limit=5`)
    if (!res.ok) return
    const data = await res.json()
    setSearchResults((data.contacts ?? []).slice(0, 5))
  }

  async function dismissSender(fromEmail: string) {
    setDismissing(fromEmail)
    try {
      await fetch("/api/gmail/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fromEmail, reason: "manual" }),
      })
      sessionStorage.removeItem("unmatchedSenders_cache")
      setUnmatchedSenders((prev) => prev.filter((s) => s.fromEmail !== fromEmail))
      setUnmatchedTotal((n) => Math.max(0, n - 1))
    } finally {
      setDismissing(null)
    }
  }

  async function assignMatch(fromEmail: string, contactId: string) {
    setAssigning(fromEmail)
    try {
      const res = await fetch("/api/gmail/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fromEmail, contactId }),
      })
      if (res.ok) {
        sessionStorage.removeItem("unmatchedSenders_cache")
        setUnmatchedSenders((prev) => prev.filter((s) => s.fromEmail !== fromEmail))
        setUnmatchedTotal((n) => n - 1)
        setAssigningFor(null)
        setSearchQuery("")
        setSearchResults([])
      }
    } finally {
      setAssigning(null)
    }
  }

  async function addToLinkedIn(fromEmail: string, fromName: string | null) {
    setAddingToLinkedIn(fromEmail)
    try {
      const res = await fetch("/api/gmail/add-to-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromEmail, fromName }),
      })
      if (res.ok) {
        sessionStorage.removeItem("unmatchedSenders_cache")
        setUnmatchedSenders((prev) => prev.filter((s) => s.fromEmail !== fromEmail))
        setUnmatchedTotal((n) => Math.max(0, n - 1))
        if (lkdQueueOpen) loadLkdQueue()
        const name = fromName ?? fromEmail.split("@")[0]
        window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`, "_blank", "noopener,noreferrer")
      }
    } finally {
      setAddingToLinkedIn(null)
    }
  }

  async function loadLkdQueue() {
    setLkdQueueLoading(true)
    try {
      const res = await fetch("/api/contacts/lkd-pending")
      if (res.ok) setLkdQueue(await res.json())
    } finally {
      setLkdQueueLoading(false)
    }
  }

  async function markLkdDone(contactId: string) {
    setMarkingDone(contactId)
    try {
      await fetch("/api/contacts/lkd-pending", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      })
      setLkdQueue((prev) => prev.filter((c) => c.id !== contactId))
    } finally {
      setMarkingDone(null)
    }
  }

  async function disconnectGmail() {
    setDisconnecting(true)
    await fetch("/api/gmail/disconnect", { method: "DELETE" })
    setGmailStatus({ connected: false, gmailEmail: null, syncedAt: null, totalMessages: 0, matchedContacts: 0, historyId: null })
    setDisconnecting(false)
  }

  const gmailSyncing =
    gmailSyncState.phase === "connecting" ||
    gmailSyncState.phase === "fetching" ||
    gmailSyncState.phase === "syncing"

  const gmailSyncLabel = (() => {
    if (gmailSyncState.phase === "connecting") return "Connecting…"
    if (gmailSyncState.phase === "fetching") return gmailSyncState.message ?? "Fetching…"
    if (gmailSyncState.phase === "syncing") {
      const { processed, total, inserted, baseCount, failed } = gmailSyncState
      const pct = total > 0 ? Math.round((processed / total) * 100) : 0
      const running = (baseCount + inserted).toLocaleString()
      const parts = [`${running} indexed`, `${pct}% scanned`]
      if (inserted > 0) parts.splice(1, 0, `+${inserted} new`)
      if (failed > 0) parts.push(`${failed} failed`)
      return parts.join(" · ")
    }
    if (gmailSyncState.phase === "done") {
      const { inserted, scanned, mode } = gmailSyncState
      return `Done (${mode}) — ${inserted} new · ${scanned.toLocaleString()} scanned`
    }
    return null
  })()

  // Capture diagnostics when sync completes
  useEffect(() => {
    if (gmailSyncState.phase === "done") {
      setLastSyncDiag({
        mode: gmailSyncState.mode,
        scanned: gmailSyncState.scanned,
        inserted: gmailSyncState.inserted,
        historyId: gmailSyncState.historyId,
      })
      // Refresh historyId in the status card
      fetch("/api/gmail/sync").then((r) => r.ok ? r.json() : null).then((d) => d && setGmailStatus(d))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailSyncState.phase])

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

  async function importWhatsAppDB(file: File) {
    setWaImporting(true)
    setWaProgress("Uploading database…")
    setWaResult(null)

    const formData = new FormData()
    formData.append("file", file)

    try {
      const res = await fetch("/api/whatsapp/import-db", { method: "POST", body: formData })
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
      if (waDbRef.current) waDbRef.current.value = ""
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

              {(lastSyncedAt ?? gmailStatus.syncedAt) && (
                <p className="text-xs text-gray-500">
                  Last synced: {formatParis(lastSyncedAt ?? new Date(gmailStatus.syncedAt!))} · {gmailStatus.totalMessages.toLocaleString()} emails indexed{gmailStatus.matchedContacts > 0 ? ` · ${gmailStatus.matchedContacts} contacts matched` : ""}
                </p>
              )}

              {/* Sync diagnostics */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-400">historyId</span>
                  <div className="flex items-center gap-1.5">
                    <span className={gmailStatus.historyId ? "text-green-700" : "text-red-500"}>
                      {gmailStatus.historyId ?? "null — next sync will be a full scan"}
                    </span>
                    {gmailStatus.historyId && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(gmailStatus.historyId!); setCopiedHistoryId(true); setTimeout(() => setCopiedHistoryId(false), 1500) }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {copiedHistoryId ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-400">next sync mode</span>
                  <span className={gmailStatus.historyId ? "text-blue-600" : "text-amber-600"}>
                    {gmailStatus.historyId ? "incremental ✓" : "full scan"}
                  </span>
                </div>
                {lastSyncDiag && (
                  <>
                    <div className="border-t border-gray-200 mt-1.5 pt-1.5" />
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-400">last run mode</span>
                      <span className={lastSyncDiag.mode === "incremental" ? "text-blue-600" : "text-amber-600"}>{lastSyncDiag.mode}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-400">IDs scanned</span>
                      <span className="text-gray-700">{lastSyncDiag.scanned.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-400">new inserted</span>
                      <span className={lastSyncDiag.inserted > 0 ? "text-green-700 font-semibold" : "text-gray-400"}>
                        +{lastSyncDiag.inserted.toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {gmailSyncLabel && (
                <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                  <Loader2 size={12} className="animate-spin" />
                  {gmailSyncLabel}
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
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
                  title="Re-scan all emails from scratch (slow)"
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
                >
                  Full resync
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

          {/* Unmatched senders */}
          {gmailStatus?.connected && gmailStatus.syncedAt && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() => {
                  const next = !unmatchedOpen
                  setUnmatchedOpen(next)
                  if (next && unmatchedSenders.length === 0) loadUnmatched(0)
                }}
              >
                <div className="flex items-center gap-2">
                  <UserCheck size={14} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">
                    Review unmatched senders
                    {unmatchedTotal > 0 && (
                      <span className="ml-2 bg-amber-100 text-amber-700 text-xs rounded-full px-2 py-0.5">{unmatchedTotal}</span>
                    )}
                  </span>
                </div>
                {unmatchedOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>

              {unmatchedOpen && (
                <div className="border-t border-gray-100">
                  {unmatchedLoading && unmatchedSenders.length === 0 ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={16} className="animate-spin text-gray-400" />
                    </div>
                  ) : unmatchedSenders.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">All senders matched</p>
                  ) : (
                    <>
                    {autoFilteredCount > 0 && (
                      <p className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
                        <span className="font-medium">{autoFilteredCount}</span> automated senders auto-filtered (noreply, newsletters, billing…)
                      </p>
                    )}
                    <ul className="divide-y divide-gray-50">
                      {unmatchedSenders.map((sender) => (
                        <li key={sender.fromEmail} className="px-4 py-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{sender.fromName ?? sender.fromEmail}</p>
                              {sender.fromName && <p className="text-xs text-gray-400 truncate">{sender.fromEmail}</p>}
                              <p className="text-xs text-gray-400">{sender.messageCount} email{sender.messageCount !== 1 ? "s" : ""}{sender.lastSeen ? ` · last ${new Date(sender.lastSeen).toLocaleDateString()}` : ""}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                title="Add contact to directory and search on LinkedIn"
                                disabled={addingToLinkedIn === sender.fromEmail}
                                onClick={() => addToLinkedIn(sender.fromEmail, sender.fromName)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg disabled:opacity-40 transition-colors font-medium"
                              >
                                <UserPlus size={11} />
                                LinkedIn
                              </button>
                              <button
                                title="Flag as automated — hide from this list"
                                disabled={dismissing === sender.fromEmail}
                                onClick={() => dismissSender(sender.fromEmail)}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-40 transition-colors"
                              >
                                <Ban size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Recommendations */}
                          {sender.recommendations.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {sender.recommendations.map((rec) => (
                                <button
                                  key={rec.contactId}
                                  disabled={assigning === sender.fromEmail}
                                  onClick={() => assignMatch(sender.fromEmail, rec.contactId)}
                                  className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 rounded-lg px-2.5 py-1 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                                >
                                  <Check size={11} />
                                  {rec.name}
                                  {rec.matchReason === "domain" && <span className="text-blue-400 ml-0.5">(domain)</span>}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Manual search */}
                          {assigningFor === sender.fromEmail ? (
                            <div className="relative">
                              <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5">
                                <Search size={12} className="text-gray-400 shrink-0" />
                                <input
                                  autoFocus
                                  type="text"
                                  value={searchQuery}
                                  onChange={(e) => searchContacts(e.target.value)}
                                  placeholder="Search contacts…"
                                  className="flex-1 text-xs outline-none bg-transparent"
                                />
                                <button onClick={() => { setAssigningFor(null); setSearchQuery(""); setSearchResults([]) }}><X size={12} className="text-gray-400" /></button>
                              </div>
                              {searchResults.length > 0 && (
                                <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                  {searchResults.map((c) => (
                                    <li key={c.id}>
                                      <button
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors"
                                        onClick={() => assignMatch(sender.fromEmail, c.id)}
                                      >
                                        <span className="font-medium">{c.firstName} {c.lastName}</span>
                                        {c.company && <span className="text-gray-400 ml-1.5">{c.company}</span>}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAssigningFor(sender.fromEmail); setSearchQuery(""); setSearchResults([]) }}
                              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              + Assign manually
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    </>
                  )}

                  {unmatchedSenders.length < unmatchedTotal && (
                    <div className="px-4 py-3 border-t border-gray-50">
                      <button
                        onClick={() => loadUnmatched(unmatchedPage + 1)}
                        disabled={unmatchedLoading}
                        className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                      >
                        {unmatchedLoading ? "Loading…" : `Load more (${unmatchedTotal - unmatchedSenders.length} remaining)`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* LinkedIn Outreach Queue */}
          {gmailStatus?.connected && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() => {
                  const next = !lkdQueueOpen
                  setLkdQueueOpen(next)
                  if (next) loadLkdQueue()
                }}
              >
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-blue-600 fill-current shrink-0">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  <span className="text-xs font-medium text-gray-700">
                    LinkedIn Outreach Queue
                    {lkdQueue.length > 0 && (
                      <span className="ml-2 bg-blue-100 text-blue-700 text-xs rounded-full px-2 py-0.5">{lkdQueue.length}</span>
                    )}
                  </span>
                </div>
                {lkdQueueOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>

              {lkdQueueOpen && (
                <div className="border-t border-gray-100">
                  {lkdQueueLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={16} className="animate-spin text-gray-400" />
                    </div>
                  ) : lkdQueue.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">Queue is empty</p>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {lkdQueue.map((contact) => (
                        <li key={contact.id} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">
                              {contact.firstName} {contact.lastName}
                            </p>
                            {contact.emailAddress && (
                              <p className="text-xs text-gray-400 truncate">{contact.emailAddress}</p>
                            )}
                            {contact.company && (
                              <p className="text-xs text-gray-500 truncate">{contact.company}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${contact.firstName} ${contact.lastName}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors font-medium"
                            >
                              <ExternalLink size={10} />
                              Search
                            </a>
                            <button
                              title="Mark as connected — remove from queue"
                              disabled={markingDone === contact.id}
                              onClick={() => markLkdDone(contact.id)}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 hover:bg-green-50 px-2 py-1 rounded-lg disabled:opacity-40 transition-colors"
                            >
                              <Check size={11} />
                              Done
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400">
            Only sender, subject, and date are stored. Email bodies are never imported.
          </p>
        </div>
      </div>

      {/* My email addresses */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
            <AtSign size={18} className="text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">My email addresses</h2>
            <p className="text-xs text-gray-500">All addresses you send from — used to identify outbound emails</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          {userEmails.length > 0 && (
            <ul className="space-y-1.5">
              {userEmails.map((email) => (
                <li key={email} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-mono text-gray-700">{email}</span>
                  <button
                    onClick={() => removeEmail(email)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Remove"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEmail()}
              placeholder="riad@example.com"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            <button
              onClick={addEmail}
              disabled={addingEmail || !newEmail.includes("@")}
              className="flex items-center gap-1.5 text-sm bg-purple-600 text-white rounded-lg px-4 py-2 hover:bg-purple-700 disabled:opacity-40 transition-colors"
            >
              <Plus size={13} />
              Add
            </button>
          </div>

          <p className="text-xs text-gray-400">
            Add all addresses you use to send email — including work and personal. Gmail-connected accounts are added automatically.
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

          {/* Option A — macOS database (recommended) */}
          <div className="rounded-xl border border-green-100 bg-green-50 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-800">Option A — Import all chats at once (macOS)</p>
              <p className="text-xs text-gray-500 mt-0.5">Upload your WhatsApp Business desktop database — imports every contact in one step.</p>
            </div>
            <div className="rounded-lg bg-white border border-gray-100 px-3 py-2">
              <p className="text-xs font-mono text-gray-600 break-all">~/Library/Group Containers/group.net.whatsapp.WhatsAppSMB.shared/ChatStorage.sqlite</p>
            </div>
            <p className="text-xs text-gray-500">In Finder: Go → Go to Folder → paste the path above → upload <strong>ChatStorage.sqlite</strong></p>
            <input
              ref={waDbRef}
              type="file"
              accept=".sqlite,.db"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importWhatsAppDB(e.target.files[0])}
            />
            <button
              onClick={() => waDbRef.current?.click()}
              disabled={waImporting}
              className="flex items-center gap-2 text-sm bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Upload size={13} />
              {waImporting ? "Importing…" : "Upload ChatStorage.sqlite"}
            </button>
          </div>

          {/* Option B — per-chat .txt exports */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-800">Option B — Export chats individually</p>
              <p className="text-xs text-gray-500 mt-0.5">Export one .txt per chat from WhatsApp, then upload them all at once.</p>
            </div>
            <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
              <li>Open WhatsApp → tap a chat → contact name → <strong>Export Chat</strong></li>
              <li>Choose <strong>Without media</strong> → save the .txt file</li>
              <li>Repeat for each contact, then upload all files below</li>
            </ol>
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
              className="flex items-center gap-2 text-sm border border-gray-200 bg-white text-gray-700 rounded-lg px-4 py-2 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Upload size={13} />
              {waImporting ? "Importing…" : "Upload .txt files"}
            </button>
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
