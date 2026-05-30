"use client"

import { useState, useEffect, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Copy, RefreshCw, Check, Puzzle, Mail, Loader2, Trash2, MessageCircle, Upload, AtSign, X, Plus, ChevronDown, ChevronUp, UserCheck, Search, Ban, UserPlus, ExternalLink, BookUser } from "lucide-react"
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
type UnmatchedWAChat = {
  chatName: string
  messageCount: number
  firstAt: string | null
  lastAt: string | null
  suggestions: { contactId: string; name: string; company: string | null }[]
}
type LkdPendingContact = { id: string; firstName: string; lastName: string; emailAddress: string | null; company: string | null; outreachUpdatedAt: string | null }

function ScoreSection() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle")
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function recalculate() {
    setState("running")
    setProgress(null)
    try {
      const res = await fetch("/api/reconnect/scores", { method: "POST" })
      if (!res.ok || !res.body) { setState("error"); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.ok) {
              setState("done")
              setProgress(null)
            } else if (data.error) {
              setState("error")
            } else if (typeof data.done === "number") {
              setProgress({ done: data.done, total: data.total })
            }
          } catch { /* partial chunk */ }
        }
      }
    } catch {
      setState("error")
    }
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : null

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
          <RefreshCw size={18} className="text-blue-600" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">Interaction Scores</h2>
          <p className="text-xs text-gray-500">Recalculate relationship scores from WhatsApp, LinkedIn DM, and email activity</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-gray-500 max-w-sm">
            Run this after importing new messages or when scores on the Reconnect page look out of date.
          </p>
          <div className="flex items-center gap-3 shrink-0">
            {state === "done" && <span className="text-xs text-green-600 font-medium">✓ Done</span>}
            {state === "error" && <span className="text-xs text-red-500 font-medium">Failed — try again</span>}
            <button
              onClick={recalculate}
              disabled={state === "running"}
              className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-medium transition-colors"
            >
              {state === "running" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {state === "running" ? "Recalculating…" : "Recalculate scores"}
            </button>
          </div>
        </div>
        {state === "running" && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>
                {progress
                  ? `Processing ${progress.done} / ${progress.total} contacts…`
                  : "Loading messages…"}
              </span>
              {pct != null && <span>{pct}%</span>}
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: pct != null ? `${pct}%` : "0%" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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

  const [waUnmatchedOpen, setWaUnmatchedOpen] = useState(false)
  const [waUnmatched, setWaUnmatched] = useState<UnmatchedWAChat[]>([])
  const [waUnmatchedTotal, setWaUnmatchedTotal] = useState(0)
  const [waUnmatchedPage, setWaUnmatchedPage] = useState(0)
  const [waUnmatchedLoading, setWaUnmatchedLoading] = useState(false)
  const [waAssigningFor, setWaAssigningFor] = useState<string | null>(null)
  const [waSearchQuery, setWaSearchQuery] = useState("")
  const [waSearchResults, setWaSearchResults] = useState<ContactResult[]>([])
  const [waAssigning, setWaAssigning] = useState<string | null>(null)

  const [waImporting, setWaImporting] = useState(false)
  const [waProgress, setWaProgress] = useState<string | null>(null)
  const [waResult, setWaResult] = useState<{ synced: number; chats: number; matched: number } | null>(null)
  const waFileRef = useRef<HTMLInputElement>(null)
  const waDbRef = useRef<HTMLInputElement>(null)

  // ── LinkedIn Direct Messages ─────────────────────────────────────────────────
  type LiDMStatus = { importedAt: string | null; totalMessages: number; totalChats: number }
  type UnmatchedLiDMChat = { chatName: string; messageCount: number; firstAt: string | null; lastAt: string | null; profileUrl: string | null; suggestions: { contactId: string; name: string; company: string | null }[] }
  const [liDMStatus, setLiDMStatus] = useState<LiDMStatus | null>(null)
  const [liDMImporting, setLiDMImporting] = useState(false)
  const [liDMProgress, setLiDMProgress] = useState<string | null>(null)
  const [liDMResult, setLiDMResult] = useState<{ synced: number; chats: number; matched: number; filteredCount?: number } | null>(null)
  const liDMFileRef = useRef<HTMLInputElement>(null)
  const [liDMUnmatchedOpen, setLiDMUnmatchedOpen] = useState(false)
  const [liDMUnmatched, setLiDMUnmatched] = useState<UnmatchedLiDMChat[]>([])
  const [liDMUnmatchedTotal, setLiDMUnmatchedTotal] = useState(0)
  const [liDMUnmatchedPage, setLiDMUnmatchedPage] = useState(0)
  const [liDMUnmatchedLoading, setLiDMUnmatchedLoading] = useState(false)
  const [liDMAssigningFor, setLiDMAssigningFor] = useState<string | null>(null)
  const [liDMSearchQuery, setLiDMSearchQuery] = useState("")
  const [liDMSearchResults, setLiDMSearchResults] = useState<ContactResult[]>([])
  const [liDMAssigning, setLiDMAssigning] = useState<string | null>(null)

  const [phoneBookCount, setPhoneBookCount] = useState(0)
  const [phoneBookWithPhotos, setPhoneBookWithPhotos] = useState(0)
  const [phoneBookWithBirthdays, setPhoneBookWithBirthdays] = useState(0)
  const [phoneBookImporting, setPhoneBookImporting] = useState(false)
  const [phoneBookEnriching, setPhoneBookEnriching] = useState(false)
  const [phoneBookStatus, setPhoneBookStatus] = useState<string | null>(null)
  const [phoneBookError, setPhoneBookError] = useState<string | null>(null)
  const [phoneBookResult, setPhoneBookResult] = useState<{ imported: number; total: number; withPhotos: number; withBirthdays: number; enriched: number; phones: number; emails: number; photos: number; linkedinUrls: number } | null>(null)
  const [phoneBookEnrichResult, setPhoneBookEnrichResult] = useState<{ enriched: number; matched: number; alreadyUpToDate: number; phones: number; emails: number; photos: number; linkedinUrls: number; photosCleared?: number; photosFixed?: number } | null>(null)
  const [phoneBookHowToOpen, setPhoneBookHowToOpen] = useState(false)
  const [phoneBookDiagRunning, setPhoneBookDiagRunning] = useState(false)
  const [phoneBookDiagSteps, setPhoneBookDiagSteps] = useState<{ label: string; ok: boolean; detail?: string }[] | null>(null)
  const phoneBookRef = useRef<HTMLInputElement>(null)

  const [coworkImporting, setCoworkImporting] = useState(false)
  const [coworkResult, setCoworkResult] = useState<{ total: number; matched: number; updated: number; photos: number; skipped: number; notFound: string[] } | null>(null)
  const [coworkError, setCoworkError] = useState<string | null>(null)
  const coworkCsvRef = useRef<HTMLInputElement>(null)
  const coworkPhotosRef = useRef<HTMLInputElement>(null)
  // Photo preview state — populated after Step 2, before Step 3
  const [coworkPhotoPreview, setCoworkPhotoPreview] = useState<{
    contactId: string
    photoFilename: string
    name: string       // from original CSV row
    thumb: string      // resized data URI (generated client-side)
    selected: boolean
  }[] | null>(null)
  // Keep Step 2 result for use when the user confirms the preview
  const coworkPendingRef = useRef<{
    data: { total: number; matched: number; updated: number; notFound: string[]; matches: { contactId: string; photoFilename: string }[] }
    zip: import("jszip") | null
  } | null>(null)

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

      fetch("/api/whatsapp/unmatched?page=0")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) { setWaUnmatchedTotal(d.total); setWaUnmatched(d.chats ?? []) } })

      fetch("/api/linkedin-dm/status")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setLiDMStatus(d))

      fetch("/api/linkedin-dm/unmatched?page=0")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) { setLiDMUnmatchedTotal(d.total); setLiDMUnmatched(d.chats ?? []) } })

      fetch("/api/user/emails")
        .then((r) => r.ok ? r.json() : [])
        .then((rows: { email: string }[]) => setUserEmails(rows.map((r) => r.email)))

      fetch("/api/phone-contacts/import")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) { setPhoneBookCount(d.count); setPhoneBookWithPhotos(d.withPhotos); setPhoneBookWithBirthdays(d.withBirthdays) } })
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
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error ?? `Failed to assign match (${res.status})`)
        return
      }
      const { propagatedEmails = [] } = data
      // Remove the matched email + any auto-propagated same-name emails in one shot
      const removed = new Set([fromEmail, ...propagatedEmails])
      sessionStorage.removeItem("unmatchedSenders_cache")
      setUnmatchedSenders((prev) => prev.filter((s) => !removed.has(s.fromEmail)))
      setUnmatchedTotal((n) => Math.max(0, n - removed.size))
      setAssigningFor(null)
      setSearchQuery("")
      setSearchResults([])
    } catch (err) {
      alert("Network error — could not assign match. Please try again.")
      console.error("assignMatch error:", err)
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
              loadWAUnmatched(0)
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

  async function loadWAUnmatched(page = 0) {
    setWaUnmatchedLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/unmatched?page=${page}`)
      if (!res.ok) return
      const data = await res.json()
      setWaUnmatched((prev) => page === 0 ? data.chats : [...prev, ...data.chats])
      setWaUnmatchedTotal(data.total)
      setWaUnmatchedPage(page)
    } finally {
      setWaUnmatchedLoading(false)
    }
  }

  async function searchWAContacts(q: string) {
    setWaSearchQuery(q)
    if (!q.trim()) { setWaSearchResults([]); return }
    const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}&limit=6`)
    if (!res.ok) return
    const data = await res.json()
    setWaSearchResults(data.contacts ?? [])
  }

  async function assignWAMatch(chatName: string, contactId: string) {
    setWaAssigning(chatName)
    try {
      const res = await fetch("/api/whatsapp/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatName, contactId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error ?? `Failed to assign match (${res.status})`)
        return
      }
      // Remove matched chat from list
      setWaUnmatched((prev) => prev.filter((c) => c.chatName !== chatName))
      setWaUnmatchedTotal((t) => t - 1)
      setWaAssigningFor(null)
      setWaSearchQuery("")
      setWaSearchResults([])
    } catch (err) {
      alert("Network error — could not assign match. Please try again.")
      console.error("assignWAMatch error:", err)
    } finally {
      setWaAssigning(null)
    }
  }

  async function importWhatsAppDB(file: File) {
    setWaImporting(true)
    setWaProgress("Initializing SQLite reader…")
    setWaResult(null)

    try {
      // Parse the SQLite file entirely in the browser — the raw file can be
      // 100–500 MB which far exceeds Vercel's 4.5 MB request body limit.
      // sql.js (SQLite compiled to WASM) lets us query it locally and send
      // only the extracted message rows (~few hundred KB) to the server.
      const initSqlJs = (await import("sql.js")).default
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" })

      setWaProgress("Reading database…")
      const buf = await file.arrayBuffer()
      let db: InstanceType<typeof SQL.Database>
      try {
        db = new SQL.Database(new Uint8Array(buf))
      } catch {
        setWaProgress("Error: could not open database. Make sure you uploaded ChatStorage.sqlite.")
        return
      }

      setWaProgress("Extracting chats…")
      const APPLE_EPOCH = 978307200  // secs between 1970-01-01 and 2001-01-01
      // Keep last 2 years; older messages have negligible scoring weight
      const cutoff = Math.floor(Date.now() / 1000) - 2 * 365 * 24 * 3600 - APPLE_EPOCH

      // 1:1 sessions only (group JIDs end with @g.us)
      const sessions = db.exec(`
        SELECT Z_PK, ZPARTNERNAME, ZCONTACTJID FROM ZWACHATSESSION
        WHERE ZPARTNERNAME IS NOT NULL
          AND (ZCONTACTJID IS NULL OR ZCONTACTJID NOT LIKE '%@g.us')
      `)[0]

      if (!sessions?.values?.length) {
        setWaProgress("No chats found. Make sure you uploaded ChatStorage.sqlite (not a backup copy).")
        db.close()
        return
      }

      // Build compact chat payload: { chatName, phone, messages: [[sentAtMs, isOutbound], …] }
      // Capped at 500 most-recent messages per chat (enough for scoring).
      type ChatPayload = { chatName: string; phone: string | null; messages: [number, number][] }
      const chats: ChatPayload[] = []

      // Parse WhatsApp JID → E.164 phone number.
      // JID format: "33612345678@s.whatsapp.net"  →  "+33612345678"
      function jidToPhone(jid: string | null | undefined): string | null {
        if (!jid) return null
        const raw = jid.split("@")[0]
        if (!raw || !/^\d{7,15}$/.test(raw)) return null
        return "+" + raw
      }

      // OTP / security-code / WhatsApp system notification filter
      const OTP_RE = /ne partagez pas|do not share|pas le partager|code de v[eé]rification|verification code|code de s[eé]curit[eé]|security code|votre code de s[eé]curit[eé]|your security code|en savoir plus|tap to learn more|one.?time\s*(pass|code|password|pin)|votre code.{0,20}\d{4,8}|your code.{0,20}\d{4,8}|code.{0,30}(whatsapp|google|apple|facebook|instagram|telegram)|\bG-\d{4,8}\b|\d{4,8}\s+is your|\d{4,8}\s+est\b|^\s*\d{4,8}\s*$/i

      for (const [pk, chatName, jid] of sessions.values) {
        // Include ZTEXT so we can filter OTP/security-code messages client-side
        // (content is never sent to the server — only timestamps + isOutbound)
        const msgs = db.exec(`
          SELECT ZMESSAGEDATE, ZISFROMME, ZTEXT FROM ZWAMESSAGE
          WHERE ZCHATSESSION = ${pk}
            AND ZMESSAGETYPE NOT IN (6, 10, 12, 14, 15)
            AND ZMESSAGEDATE > ${cutoff}
          ORDER BY ZMESSAGEDATE DESC
        `)[0]
        if (!msgs?.values?.length) continue
        const filtered = msgs.values.filter(([, , text]) =>
          !text || !OTP_RE.test(String(text))
        )
        if (!filtered.length) continue
        chats.push({
          chatName: String(chatName),
          phone: jidToPhone(jid as string | null),
          messages: filtered.map(([d, f]) => [
            Math.floor((Number(d) + APPLE_EPOCH) * 1000),  // → ms timestamp
            Number(f) === 1 ? 1 : 0,
          ]),
        })
      }
      db.close()

      if (chats.length === 0) {
        setWaProgress("No recent messages found (last 2 years). Try --reset-missing or re-export.")
        return
      }

      setWaProgress(`Uploading ${chats.length} chats…`)
      const res = await fetch("/api/whatsapp/import-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chats }),
      })
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
              loadWAUnmatched(0)
            } else if (event.type === "error") {
              setWaProgress(`Error: ${event.message}`)
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (err) {
      setWaProgress(`Error: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setWaImporting(false)
      if (waDbRef.current) waDbRef.current.value = ""
    }
  }

  // ── LinkedIn DM functions ────────────────────────────────────────────────────

  // ── Client-side LinkedIn DM parser ─────────────────────────────────────────
  // Parse the CSV fully in the browser, then send only the metadata (timestamps +
  // sender names, no message body) as compact JSON. This sidesteps Vercel's 4.5 MB
  // serverless body limit regardless of how large the LinkedIn export is.
  // Replicates the server-side RFC-4180 parser and auto-detection logic.
  function parseLinkedInDMClientSide(csvText: string): {
    conversations: Array<{
      conversationId: string
      chatName: string
      profileUrl: string | null
      messages: Array<{ sentAt: string; isOutbound: boolean; senderName: string }>
    }>
    filteredCount: number
  } {
    // RFC-4180 state-machine parser
    const rows: string[][] = []
    let row: string[] = []
    let field = ""
    let inQuotes = false
    const text = csvText.startsWith("﻿") ? csvText.slice(1) : csvText
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      const next = text[i + 1]
      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++ }
        else if (c === '"') inQuotes = false
        else field += c
      } else {
        if (c === '"') { inQuotes = true }
        else if (c === ',') { row.push(field); field = "" }
        else if (c === '\r' && next === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = "" }
        else field += c
      }
    }
    if (field || row.length > 0) { row.push(field); rows.push(row) }

    if (rows.length < 2) return { conversations: [], filteredCount: 0 }

    // Find header row
    let headerIdx = -1
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some(c => c.trim().toUpperCase() === "CONVERSATION ID")) { headerIdx = i; break }
    }
    if (headerIdx === -1) return { conversations: [], filteredCount: 0 }

    const headers = rows[headerIdx].map(h => h.trim().toUpperCase())
    const col = (name: string) => headers.indexOf(name)
    const COL_ID     = col("CONVERSATION ID")
    const COL_TITLE  = col("CONVERSATION TITLE")
    const COL_FROM   = col("FROM")
    const COL_URL    = col("SENDER PROFILE URL")
    const COL_DATE   = col("DATE")
    const COL_FOLDER = col("FOLDER")   // present in some exports: INBOX / SPAM / ARCHIVE
    if (COL_ID === -1 || COL_FROM === -1 || COL_DATE === -1) return { conversations: [], filteredCount: 0 }

    // ── LinkedIn system / bot account names to always filter out ─────────────
    // These are LinkedIn-owned accounts that generate system messages, sponsored
    // InMails, or automated recruiter outreach — not real person-to-person DMs.
    const LINKEDIN_SYSTEM_RE = /^linkedin\s*(member|career|talent|recruiter|job|jobs|news|learning|marketing|sales|career\s*advice|career\s*coach|messages?|notification|alert|team)$/i

    // Spam folder values to skip (case-insensitive)
    const SPAM_FOLDERS = new Set(["spam", "spammedfolder", "spam_folder"])

    // Parse raw rows — skip rows in spam folders immediately
    type Raw = { conversationId: string; title: string; from: string; profileUrl: string; sentAt: Date }
    const raws: Raw[] = []
    const spamConvIds = new Set<string>()  // conversationIds in spam folder
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i]
      if (r.every(c => !c.trim())) continue
      const dateStr = (r[COL_DATE] ?? "").trim().replace(/\s+UTC$/i, "Z").replace(" ", "T")
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) continue
      const convId = (r[COL_ID] ?? "").trim()
      const folder = COL_FOLDER !== -1 ? (r[COL_FOLDER] ?? "").trim().toLowerCase() : ""
      if (folder && SPAM_FOLDERS.has(folder)) { spamConvIds.add(convId); continue }
      raws.push({
        conversationId: convId,
        title:          (COL_TITLE !== -1 ? (r[COL_TITLE] ?? "") : "").trim(),
        from:           (r[COL_FROM] ?? "").trim(),
        profileUrl:     (COL_URL !== -1 ? (r[COL_URL] ?? "") : "").trim(),
        sentAt:         d,
      })
    }
    if (raws.length === 0) return { conversations: [], filteredCount: 0 }

    // Auto-detect the exporting user: profile URL that appears in most distinct conversations
    const urlConvs = new Map<string, Set<string>>()
    const urlMsgs  = new Map<string, number>()
    for (const m of raws) {
      if (!m.profileUrl) continue
      if (!urlConvs.has(m.profileUrl)) urlConvs.set(m.profileUrl, new Set())
      urlConvs.get(m.profileUrl)!.add(m.conversationId)
      urlMsgs.set(m.profileUrl, (urlMsgs.get(m.profileUrl) ?? 0) + 1)
    }
    let userUrl: string | null = null
    let bestConvs = 0, bestMsgs = 0
    for (const [url, convSet] of urlConvs) {
      const cc = convSet.size, mc = urlMsgs.get(url) ?? 0
      if (cc > bestConvs || (cc === bestConvs && mc > bestMsgs)) { userUrl = url; bestConvs = cc; bestMsgs = mc }
    }
    // Fallback: FROM name that appears in most distinct conversations
    let userName: string | null = null
    if (!userUrl) {
      const nameConvs = new Map<string, Set<string>>()
      const nameMsgs  = new Map<string, number>()
      for (const m of raws) {
        if (!nameConvs.has(m.from)) nameConvs.set(m.from, new Set())
        nameConvs.get(m.from)!.add(m.conversationId)
        nameMsgs.set(m.from, (nameMsgs.get(m.from) ?? 0) + 1)
      }
      let bc = 0, bm = 0
      for (const [name, convSet] of nameConvs) {
        const cc = convSet.size, mc = nameMsgs.get(name) ?? 0
        if (cc > bc || (cc === bc && mc > bm)) { userName = name; bc = cc; bm = mc }
      }
    }
    const isFromUser = (m: Raw) => userUrl ? m.profileUrl === userUrl : (userName !== null && m.from === userName)

    // Group by conversationId — apply 4-year cutoff
    const FOUR_YEARS_AGO = new Date(Date.now() - 4 * 365.25 * 24 * 60 * 60 * 1000)
    const convMap = new Map<string, Raw[]>()
    for (const m of raws) {
      if (!m.conversationId || m.sentAt < FOUR_YEARS_AGO) continue
      if (!convMap.has(m.conversationId)) convMap.set(m.conversationId, [])
      convMap.get(m.conversationId)!.push(m)
    }

    const conversations = []
    let filteredCount = 0
    for (const [conversationId, msgs] of convMap) {
      let chatName: string | null = null
      let partnerUrl: string | null = null
      for (const m of msgs) {
        if (!isFromUser(m)) {
          if (!chatName && m.from) chatName = m.from
          if (!partnerUrl && m.profileUrl) partnerUrl = m.profileUrl
          if (chatName && partnerUrl) break
        }
      }
      if (!chatName) continue

      // ── Noise / spam filtering ─────────────────────────────────────────────
      // 1. LinkedIn system accounts ("LinkedIn Member", "LinkedIn Talent", etc.)
      if (LINKEDIN_SYSTEM_RE.test(chatName.trim())) { filteredCount++; continue }

      // 2. Conversations flagged in the FOLDER column as spam
      //    (spamConvIds already populated during row parsing)
      if (spamConvIds.has(conversationId)) { filteredCount++; continue }

      // 3. Sponsored / promotional InMail — heuristic:
      //    ALL messages are inbound (user never replied) AND no partner profile URL
      //    AND the conversation has ≤ 2 messages.
      //    Real cold-outreach people sometimes send one unanswered message, so we
      //    require BOTH "no URL" AND "≤ 2 messages" before filtering.
      const allInbound = msgs.every(m => !isFromUser(m))
      if (allInbound && !partnerUrl && msgs.length <= 2) { filteredCount++; continue }

      conversations.push({
        conversationId,
        chatName,
        profileUrl: partnerUrl,
        messages: msgs.map(m => ({ sentAt: m.sentAt.toISOString(), isOutbound: isFromUser(m), senderName: m.from })),
      })
    }
    return { conversations, filteredCount }
  }

  async function importLinkedInDM(file: File) {
    setLiDMImporting(true)
    setLiDMProgress("Parsing CSV…")
    setLiDMResult(null)

    // Parse CSV fully in the browser — send compact JSON (no message bodies)
    // This avoids Vercel's 4.5 MB body limit regardless of export size.
    let payload: ReturnType<typeof parseLinkedInDMClientSide>
    try {
      const raw = await file.text()
      payload = parseLinkedInDMClientSide(raw)
      if (payload.conversations.length === 0) {
        const filterNote = payload.filteredCount > 0 ? ` (${payload.filteredCount} spam/noise conversations filtered out)` : ""
        setLiDMProgress(`Could not parse CSV — is this a LinkedIn DM messages.csv export?${filterNote}`)
        setLiDMImporting(false)
        return
      }
    } catch (err) {
      setLiDMProgress(`Parse error: ${err instanceof Error ? err.message : "unknown"}`)
      setLiDMImporting(false)
      if (liDMFileRef.current) liDMFileRef.current.value = ""
      return
    }

    // ── Retry loop — auto-resumes after a Vercel timeout ──────────────────
    // Each attempt sends the same full payload; the server skips conversations
    // that were already committed to LinkedInDMConversation in previous runs.
    const MAX_ATTEMPTS = 8
    let gotDone = false
    let lastError = ""

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !gotDone; attempt++) {
      if (attempt > 0) {
        setLiDMProgress(`Connection interrupted — auto-resuming (attempt ${attempt + 1}/${MAX_ATTEMPTS})…`)
        await new Promise((r) => setTimeout(r, 2000))
      } else {
        const filterNote = payload.filteredCount > 0 ? ` (${payload.filteredCount} spam/noise filtered)` : ""
        setLiDMProgress(`Uploading ${payload.conversations.length} conversations…${filterNote}`)
      }

      try {
        const res = await fetch("/api/linkedin-dm/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok || !res.body) {
          lastError = `HTTP ${res.status}`
          continue
        }
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
              if (event.type === "status") {
                setLiDMProgress(event.message)
              } else if (event.type === "progress") {
                if (event.resumed) {
                  // Silently skip already-imported conversation events
                } else {
                  const pct = event.totalConvs ? ` ${event.convIdx}/${event.totalConvs}` : ""
                  setLiDMProgress(`[${pct}] ${event.file}: ${event.synced} msgs${event.matched ? " ✓" : ""}${event.skipped > 0 ? ` (${event.skipped} dupes)` : ""}`)
                }
              } else if (event.type === "done") {
                gotDone = true
                const resumeNote = event.skippedConvs > 0 ? `, ${event.skippedConvs} already imported` : ""
                const filterNote = payload.filteredCount > 0 ? `, ${payload.filteredCount} spam/noise filtered` : ""
                setLiDMResult({ synced: event.synced, chats: event.chats, matched: event.matched, filteredCount: payload.filteredCount })
                setLiDMProgress(null)
                void filterNote  // available for toast if desired
                setLiDMStatus((prev) => ({
                  importedAt: new Date().toISOString(),
                  totalMessages: (prev?.totalMessages ?? 0) + event.synced,
                  totalChats: (prev?.totalChats ?? 0) + event.chats,
                }))
                void resumeNote  // used in future toast if desired
                loadLiDMUnmatched(0)
              } else if (event.type === "error") {
                lastError = event.message
                setLiDMProgress(`Error: ${event.message}`)
              }
            } catch { /* skip malformed SSE */ }
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Network error"
      }
    }

    if (!gotDone) {
      setLiDMProgress(
        `Import interrupted after ${MAX_ATTEMPTS} attempts. Progress is saved — re-upload the same file to continue.${lastError ? ` (${lastError})` : ""}`
      )
    }

    setLiDMImporting(false)
    if (liDMFileRef.current) liDMFileRef.current.value = ""
  }

  async function loadLiDMUnmatched(page = 0) {
    setLiDMUnmatchedLoading(true)
    try {
      const res = await fetch(`/api/linkedin-dm/unmatched?page=${page}`)
      if (!res.ok) return
      const data = await res.json()
      setLiDMUnmatched((prev) => page === 0 ? data.chats : [...prev, ...data.chats])
      setLiDMUnmatchedTotal(data.total)
      setLiDMUnmatchedPage(page)
    } finally {
      setLiDMUnmatchedLoading(false)
    }
  }

  async function searchLiDMContacts(q: string) {
    setLiDMSearchQuery(q)
    if (!q.trim()) { setLiDMSearchResults([]); return }
    const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}&limit=6`)
    if (!res.ok) return
    const data = await res.json()
    setLiDMSearchResults(data.contacts ?? [])
  }

  async function assignLiDMMatch(chatName: string, contactId: string) {
    setLiDMAssigning(chatName)
    try {
      const res = await fetch("/api/linkedin-dm/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatName, contactId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error ?? `Failed to assign match (${res.status})`); return }
      setLiDMUnmatched((prev) => prev.filter((c) => c.chatName !== chatName))
      setLiDMUnmatchedTotal((t) => t - 1)
      setLiDMAssigningFor(null)
      setLiDMSearchQuery("")
      setLiDMSearchResults([])
    } catch {
      alert("Network error — could not assign match. Please try again.")
    } finally {
      setLiDMAssigning(null)
    }
  }

  async function importPhoneBook(file: File) {
    setPhoneBookImporting(true)
    setPhoneBookResult(null)
    setPhoneBookEnrichResult(null)
    setPhoneBookError(null)
    setPhoneBookStatus(null)
    try {
      const name = file.name.toLowerCase()
      let res: Response

      if (name.endsWith(".abcddb") || name.endsWith(".zip")) {
        // Parse in the browser — avoids Vercel's 4.5 MB body limit
        const { parseAbcddbFile } = await import("@/lib/abbu-parser-client")
        const contacts = await parseAbcddbFile(file, setPhoneBookStatus)
        if (contacts.length === 0) {
          setPhoneBookError("No contacts found in this file.\n\nIf your .abbu file was exported from Contacts.app, make sure you right-clicked the .abbu file and selected Compress to create a .zip.")
          return
        }
        // Send contacts in batches of 300; accumulate stats across all batches
        const BATCH = 300
        const totalBatches = Math.ceil(contacts.length / BATCH)
        let totalImported = 0, totalWithPhotos = 0, totalEnriched = 0
        let totalPhones = 0, totalEmails = 0, totalPhotosEnriched = 0, totalLinkedin = 0
        let finalCount = 0, lastRes: Response | null = null
        for (let i = 0; i < contacts.length; i += BATCH) {
          const batchNum = Math.floor(i / BATCH) + 1
          setPhoneBookStatus(`Uploading batch ${batchNum}/${totalBatches} (${Math.min(i + BATCH, contacts.length)} of ${contacts.length} contacts)…`)
          const batch = contacts.slice(i, i + BATCH)
          lastRes = await fetch("/api/phone-contacts/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contacts: batch }),
          })
          const batchData = await lastRes.json()
          if (!lastRes.ok) { setPhoneBookError((batchData?.error as string) ?? "Import failed"); return }
          totalImported += (batchData.imported as number) ?? 0
          totalWithPhotos += (batchData.withPhotos as number) ?? 0
          totalEnriched += (batchData.enriched as number) ?? 0
          totalPhones += (batchData.phones as number) ?? 0
          totalEmails += (batchData.emails as number) ?? 0
          totalPhotosEnriched += (batchData.photos as number) ?? 0
          totalLinkedin += (batchData.linkedinUrls as number) ?? 0
          finalCount = (batchData.count as number) ?? finalCount
        }
        setPhoneBookStatus(null)
        setPhoneBookResult({
          imported: totalImported, total: contacts.length,
          withPhotos: totalWithPhotos, withBirthdays: 0,
          enriched: totalEnriched, phones: totalPhones,
          emails: totalEmails, photos: totalPhotosEnriched, linkedinUrls: totalLinkedin,
        })
        setPhoneBookCount(finalCount || contacts.length)
        setPhoneBookWithPhotos(totalWithPhotos)
        setPhoneBookWithBirthdays(0)
      } else {
        // VCF / vcard — small text file, upload directly
        const formData = new FormData()
        formData.append("file", file)
        res = await fetch("/api/phone-contacts/import", { method: "POST", body: formData })
        let data: Record<string, unknown>
        try { data = await res.json() } catch {
          setPhoneBookError(`Upload failed (HTTP ${res.status}).`)
          return
        }
        if (!res.ok) { setPhoneBookError((data.error as string) ?? "Import failed"); return }
        setPhoneBookResult(data as Parameters<typeof setPhoneBookResult>[0])
        setPhoneBookCount((data.count as number) ?? (data.imported as number))
        setPhoneBookWithPhotos((data.withPhotos as number) ?? 0)
        setPhoneBookWithBirthdays((data.withBirthdays as number) ?? 0)
      }
    } catch (err) {
      setPhoneBookStatus(null)
      setPhoneBookError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setPhoneBookImporting(false)
      setPhoneBookStatus(null)
      if (phoneBookRef.current) phoneBookRef.current.value = ""
    }
  }

  async function runAddressBookDiag() {
    setPhoneBookDiagRunning(true)
    setPhoneBookDiagSteps([])
    try {
      const { runAbbuSelfTest, postDiagnostics } = await import("@/lib/abbu-parser-diag")
      const steps: { label: string; ok: boolean; detail?: string }[] = []
      await runAbbuSelfTest((step) => {
        steps.push(step)
        setPhoneBookDiagSteps([...steps])
      })
      postDiagnostics({ event: "self_test", steps })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setPhoneBookDiagSteps((prev) => [...(prev ?? []), { label: "Self-test crashed", ok: false, detail }])
    } finally {
      setPhoneBookDiagRunning(false)
    }
  }

  async function enrichFromPhoneBook() {
    setPhoneBookEnriching(true)
    setPhoneBookEnrichResult(null)
    try {
      const res = await fetch("/api/phone-contacts/enrich", { method: "POST" })
      if (!res.ok) return
      const data = await res.json()
      setPhoneBookEnrichResult(data)
    } finally {
      setPhoneBookEnriching(false)
    }
  }

  async function regenerate() {
    setRegenerating(true)
    try {
      const res = await fetch("/api/extension/token", { method: "POST" })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        console.error("Token generation failed:", d)
        return
      }
      const d = await res.json()
      setToken(d.token)
    } finally {
      setRegenerating(false)
    }
  }

  // Resize a raw image blob to ≤maxPx on its longest side, returns a JPEG data URI
  async function resizeImage(blob: Blob, maxPx = 400): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement("canvas")
        canvas.width = w; canvas.height = h
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL("image/jpeg", 0.75))
      }
      img.onerror = reject
      img.src = url
    })
  }

  async function runCoworkImport() {
    const csvFile = coworkCsvRef.current?.files?.[0]
    const photosFile = coworkPhotosRef.current?.files?.[0]
    if (!csvFile) { setCoworkError("Please select a CSV file."); return }
    setCoworkImporting(true)
    setCoworkResult(null)
    setCoworkError(null)
    setCoworkPhotoPreview(null)
    coworkPendingRef.current = null
    try {
      // ── Step 1: parse CSV in browser ──────────────────────────────────────
      const csvText = await csvFile.text()
      const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) { setCoworkError("CSV has no data rows"); return }

      function parseLine(line: string): string[] {
        const fields: string[] = []
        let cur = "", inQ = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
          else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = "" }
          else cur += ch
        }
        fields.push(cur.trim())
        return fields
      }

      const headers = parseLine(lines[0])
      const rows = lines.slice(1).map((line) => {
        const vals = parseLine(line)
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""])) as Record<string, string>
      })

      // ── Step 2: POST metadata only (no photos) → get matched contact IDs ─
      let res: Response
      try {
        res = await fetch("/api/contacts/cowork-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        })
      } catch (fetchErr) {
        setCoworkError(`Network error: ${fetchErr instanceof Error ? fetchErr.message : "could not reach server"}`)
        return
      }
      let data: { total: number; matched: number; updated: number; notFound: string[]; matches: { contactId: string; photoFilename: string }[] }
      try { data = await res.json() } catch {
        setCoworkError(`Server error (HTTP ${res.status})`); return
      }
      if (!res.ok) { setCoworkError((data as unknown as { error: string }).error ?? "Import failed"); return }

      // ── Step 3: if there are photos + a zip, build a preview grid ────────
      if (photosFile && data.matches.length > 0) {
        const JSZip = (await import("jszip")).default
        const zip = await JSZip.loadAsync(await photosFile.arrayBuffer())

        // Build name lookup from CSV rows (photo_filename → name)
        const fnToName = new Map<string, string>(
          rows.filter(r => r.photo_filename).map(r => [r.photo_filename, r.name] as [string, string])
        )

        const previews: typeof coworkPhotoPreview = []
        for (const { contactId, photoFilename } of data.matches) {
          const entry = zip.file(photoFilename) ??
            zip.file([...Object.keys(zip.files)].find((p) => p.endsWith(photoFilename) || p.split("/").pop() === photoFilename) ?? "")
          if (!entry) continue
          try {
            const u8 = await entry.async("uint8array")
            let mime = "image/jpeg"
            if (u8[0] === 0x89 && u8[1] === 0x50) mime = "image/png"
            else if (u8[0] === 0x47 && u8[1] === 0x49) mime = "image/gif"
            const blob = new Blob([u8.buffer as ArrayBuffer], { type: mime })
            const thumb = await resizeImage(blob, 120)  // small thumbnail for preview
            previews.push({
              contactId,
              photoFilename,
              name: fnToName.get(photoFilename) ?? photoFilename,
              thumb,
              selected: true,
            })
          } catch { /* skip unreadable photos */ }
        }

        if (previews.length > 0) {
          // Save pending data and show preview — user confirms before Step 4 uploads
          coworkPendingRef.current = { data, zip }
          setCoworkPhotoPreview(previews)
          return  // exit here; confirmCoworkPhotos() handles the rest
        }
      }

      // No photos to preview → finish directly
      setCoworkResult({ total: data.total, matched: data.matched, updated: data.updated, photos: 0, skipped: 0, notFound: data.notFound })
    } catch (err) {
      setCoworkError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setCoworkImporting(false)
      if (coworkCsvRef.current) coworkCsvRef.current.value = ""
      if (coworkPhotosRef.current) coworkPhotosRef.current.value = ""
    }
  }

  // ── Step 4: upload only selected photos after user reviews preview ────────
  async function confirmCoworkPhotos() {
    const pending = coworkPendingRef.current
    const preview = coworkPhotoPreview
    if (!pending || !preview) return

    const selected = preview.filter(p => p.selected)
    setCoworkPhotoPreview(null)
    coworkPendingRef.current = null
    setCoworkImporting(true)

    let photos = 0
    let skipped = preview.length - selected.length

    try {
      for (const { contactId, photoFilename, thumb } of selected) {
        // thumb is already resized (120px) — re-render at 400px for storage quality
        // We already have it; just re-encode at a higher quality from the zip entry
        // For simplicity, use the 120px thumb at full quality (still ≤ ~30 KB)
        try {
          // Re-fetch the zip entry and resize to 400px for final upload
          const entry = pending.zip!.file(photoFilename) ??
            pending.zip!.file([...Object.keys(pending.zip!.files)].find((p) => p.endsWith(photoFilename) || p.split("/").pop() === photoFilename) ?? "")
          let dataUri = thumb  // fallback to small thumb
          if (entry) {
            const u8 = await entry.async("uint8array")
            let mime = "image/jpeg"
            if (u8[0] === 0x89 && u8[1] === 0x50) mime = "image/png"
            const blob = new Blob([u8.buffer as ArrayBuffer], { type: mime })
            dataUri = await resizeImage(blob, 400)
          }
          const photoRes = await fetch(`/api/contacts/${contactId}/photo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: dataUri }),
          })
          if (photoRes.ok) photos++
        } catch { skipped++ }
      }
      setCoworkResult({ ...pending.data, photos, skipped })
    } catch (err) {
      setCoworkError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setCoworkImporting(false)
      if (coworkCsvRef.current) coworkCsvRef.current.value = ""
      if (coworkPhotosRef.current) coworkPhotosRef.current.value = ""
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
                                {addingToLinkedIn === sender.fromEmail ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                                LinkedIn
                              </button>
                              <button
                                title="Flag as automated — hide from this list"
                                disabled={dismissing === sender.fromEmail}
                                onClick={() => dismissSender(sender.fromEmail)}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-40 transition-colors"
                              >
                                {dismissing === sender.fromEmail ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
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
                                  {assigning === sender.fromEmail ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
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
                                        disabled={assigning === sender.fromEmail}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        onClick={() => assignMatch(sender.fromEmail, c.id)}
                                      >
                                        {assigning === sender.fromEmail && <Loader2 size={10} className="animate-spin text-blue-500" />}
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

      {/* Address Book */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
            <BookUser size={18} className="text-teal-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">Address Book</h2>
              {phoneBookCount > 0 && (
                <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5">
                  {phoneBookCount.toLocaleString()} contacts
                  {phoneBookWithPhotos > 0 ? ` · ${phoneBookWithPhotos} photos` : ""}
                  {phoneBookWithBirthdays > 0 ? ` · ${phoneBookWithBirthdays} birthdays` : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">Import iCloud contacts to improve WhatsApp matching</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {phoneBookError && (
            <div className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 whitespace-pre-line font-mono">
              {phoneBookError}
            </div>
          )}

          {phoneBookStatus && !phoneBookError && (
            <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
              <Loader2 size={12} className="animate-spin shrink-0" />
              {phoneBookStatus}
            </div>
          )}

          {phoneBookResult && (
            <div className="text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2 space-y-0.5">
              <p>
                Imported {phoneBookResult.imported.toLocaleString()} of {phoneBookResult.total.toLocaleString()} contacts
                {phoneBookResult.withPhotos > 0 ? ` · ${phoneBookResult.withPhotos} with photos` : ""}
                {phoneBookResult.withBirthdays > 0 ? ` · ${phoneBookResult.withBirthdays} with birthdays` : ""}
              </p>
              {(phoneBookResult.enriched > 0 || (phoneBookResult as { matched?: number }).matched !== undefined) && (
                <p className="text-teal-600">
                  {phoneBookResult.enriched > 0
                    ? `Enriched ${phoneBookResult.enriched} contacts —${phoneBookResult.emails > 0 ? ` ${phoneBookResult.emails} emails` : ""}${phoneBookResult.phones > 0 ? ` ${phoneBookResult.phones} phones` : ""}${phoneBookResult.photos > 0 ? ` ${phoneBookResult.photos} photos` : ""}${phoneBookResult.linkedinUrls > 0 ? ` ${phoneBookResult.linkedinUrls} LinkedIn` : ""}`
                    : `Matched ${(phoneBookResult as { matched?: number }).matched ?? 0} contacts — fields already populated`
                  }
                </p>
              )}
            </div>
          )}

          {phoneBookEnrichResult && (
            <div className="text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2 space-y-0.5">
              {(phoneBookEnrichResult.photosFixed ?? 0) > 0 && (
                <p>Fixed {phoneBookEnrichResult.photosFixed} corrupt Apple JPEG{(phoneBookEnrichResult.photosFixed ?? 0) === 1 ? "" : "s"} — photos now visible</p>
              )}
              {(phoneBookEnrichResult.photosCleared ?? 0) > 0 && (
                <p>Cleared {phoneBookEnrichResult.photosCleared} broken/expired photos</p>
              )}
              {phoneBookEnrichResult.enriched > 0 ? (
                <>
                  <p>Enriched {phoneBookEnrichResult.enriched} contacts —{phoneBookEnrichResult.emails > 0 ? ` ${phoneBookEnrichResult.emails} emails` : ""}{phoneBookEnrichResult.phones > 0 ? ` ${phoneBookEnrichResult.phones} phones` : ""}{phoneBookEnrichResult.photos > 0 ? ` ${phoneBookEnrichResult.photos} photos` : ""}{phoneBookEnrichResult.linkedinUrls > 0 ? ` ${phoneBookEnrichResult.linkedinUrls} LinkedIn` : ""}</p>
                  {phoneBookEnrichResult.alreadyUpToDate > 0 && (
                    <p className="text-teal-500">{phoneBookEnrichResult.alreadyUpToDate} matched contacts already up to date</p>
                  )}
                </>
              ) : ((phoneBookEnrichResult.photosCleared ?? 0) > 0 || (phoneBookEnrichResult.photosFixed ?? 0) > 0) ? (
                <p className="text-teal-500">{phoneBookEnrichResult.matched} matched contacts — photos repaired</p>
              ) : phoneBookEnrichResult.matched > 0 ? (
                <p>Matched {phoneBookEnrichResult.matched} contacts — all fields already populated</p>
              ) : (
                <p className="text-amber-600">No address book contacts matched your LinkedIn contacts. Names or emails may differ between the two.</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={phoneBookRef}
              type="file"
              accept=".vcf,.vcard,.abcddb,.zip,.abbu"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importPhoneBook(f) }}
            />
            <button
              onClick={() => phoneBookRef.current?.click()}
              disabled={phoneBookImporting || phoneBookEnriching}
              className="flex items-center gap-2 text-sm bg-teal-600 text-white rounded-xl px-4 py-2 hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {phoneBookImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {phoneBookImporting ? "Importing…" : "Import contacts"}
            </button>
            {phoneBookCount > 0 && (
              <button
                onClick={enrichFromPhoneBook}
                disabled={phoneBookEnriching || phoneBookImporting}
                className="flex items-center gap-2 text-sm border border-teal-300 text-teal-700 rounded-xl px-4 py-2 hover:bg-teal-50 disabled:opacity-50 transition-colors"
              >
                {phoneBookEnriching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {phoneBookEnriching ? "Enriching…" : "Enrich contacts"}
              </button>
            )}
            <button
              onClick={runAddressBookDiag}
              disabled={phoneBookDiagRunning || phoneBookImporting}
              title="Verify sql.js and the parser work in this browser"
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
            >
              {phoneBookDiagRunning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              {phoneBookDiagRunning ? "Testing…" : "Run self-test"}
            </button>
          </div>

          {phoneBookDiagSteps !== null && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Browser self-test</span>
                <button onClick={() => setPhoneBookDiagSteps(null)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
              </div>
              <ul className="divide-y divide-gray-50">
                {phoneBookDiagSteps.map((step, i) => (
                  <li key={i} className="px-4 py-2 flex items-start gap-2">
                    <span className={`text-xs font-mono shrink-0 mt-0.5 ${step.ok ? "text-green-600" : "text-red-500"}`}>
                      {step.ok ? "✓" : "✗"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-700">{step.label}</p>
                      {step.detail && <p className="text-xs text-gray-400 font-mono truncate">{step.detail}</p>}
                    </div>
                  </li>
                ))}
                {phoneBookDiagRunning && (
                  <li className="px-4 py-2 flex items-center gap-2">
                    <Loader2 size={10} className="animate-spin text-gray-400" />
                    <span className="text-xs text-gray-400">Running…</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Stored as a private lookup table — never visible in your contacts list. Photos enrich matched contacts automatically.
          </p>

          <button
            onClick={() => setPhoneBookHowToOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {phoneBookHowToOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            How to export your contacts
          </button>

          {phoneBookHowToOpen && (
            <div className="text-xs text-gray-600 bg-gray-50 rounded-xl px-4 py-3 space-y-2">
              <p className="font-medium text-gray-700">Mac — .abbu archive (recommended, any size)</p>
              <ol className="space-y-0.5 list-decimal list-inside">
                <li>Contacts.app → <span className="font-semibold text-gray-800">File → Export → Address Book Archive…</span></li>
                <li>Right-click the .abbu file → <span className="font-semibold text-gray-800">Compress</span></li>
                <li>Upload the resulting .zip here — parsed locally in your browser, nothing uploaded to the server</li>
              </ol>
              <p className="font-medium text-gray-700 pt-1">Mac — vCard export</p>
              <ol className="space-y-0.5 list-decimal list-inside">
                <li>Edit → Select All (⌘A)</li>
                <li>File → Export → <span className="font-semibold text-gray-800">Export vCard…</span> → upload .vcf</li>
              </ol>
              <p className="font-medium text-gray-700 pt-1">iPhone / iCloud.com</p>
              <p>iCloud.com → Contacts → ⌘A → gear icon → Export vCard → upload .vcf</p>
            </div>
          )}
        </div>
      </div>

      {/* Cowork Import */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
            <Upload size={18} className="text-orange-500" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Cowork Import</h2>
            <p className="text-xs text-gray-500">Upload photos and enriched data collected by Cowork</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CSV file <span className="text-gray-400">(name, city, country, shared_contacts, title, linkedin_url, photo_filename)</span></label>
              <input
                ref={coworkCsvRef}
                type="file"
                accept=".csv"
                className="block text-xs text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Photos ZIP <span className="text-gray-400">(optional — filenames must match photo_filename column)</span></label>
              <input
                ref={coworkPhotosRef}
                type="file"
                accept=".zip"
                className="block text-xs text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition-colors"
              />
            </div>
          </div>

          <button
            onClick={runCoworkImport}
            disabled={coworkImporting}
            className="flex items-center gap-1.5 text-sm bg-orange-500 text-white rounded-lg px-4 py-2 hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {coworkImporting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {coworkImporting ? "Importing…" : "Import"}
          </button>

          {coworkError && (
            <p className="text-xs text-red-500">{coworkError}</p>
          )}

          {/* Photo preview — shown after CSV is matched, before photos are uploaded */}
          {coworkPhotoPreview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-800">
                  Review {coworkPhotoPreview.length} photos — uncheck any that look wrong
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCoworkPhotoPreview(prev => prev?.map(p => ({ ...p, selected: true })) ?? null)}
                    className="text-xs text-blue-600 hover:underline"
                  >Select all</button>
                  <button
                    onClick={() => setCoworkPhotoPreview(prev => prev?.map(p => ({ ...p, selected: false })) ?? null)}
                    className="text-xs text-gray-400 hover:underline"
                  >Deselect all</button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 max-h-80 overflow-y-auto pr-1">
                {coworkPhotoPreview.map((p) => (
                  <button
                    key={p.contactId}
                    onClick={() => setCoworkPhotoPreview(prev => prev?.map(x => x.contactId === p.contactId ? { ...x, selected: !x.selected } : x) ?? null)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all text-left ${p.selected ? "border-blue-500" : "border-gray-200 opacity-50"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumb} alt={p.name} className="w-full aspect-square object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1">
                      <p className="text-white text-[10px] font-medium leading-tight truncate">{p.name}</p>
                    </div>
                    {p.selected && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                        <Check size={10} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={confirmCoworkPhotos}
                  disabled={coworkImporting}
                  className="flex items-center gap-1.5 text-sm bg-orange-500 text-white rounded-lg px-4 py-2 hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {coworkImporting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {coworkImporting ? "Uploading…" : `Upload ${coworkPhotoPreview.filter(p => p.selected).length} photos`}
                </button>
                <button
                  onClick={() => { setCoworkPhotoPreview(null); coworkPendingRef.current = null }}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  Skip photos
                </button>
              </div>
            </div>
          )}

          {coworkResult && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 space-y-1 text-xs">
              <p className="font-semibold text-orange-800">Import complete</p>
              <p className="text-gray-600">
                {coworkResult.matched} / {coworkResult.total} contacts matched · {coworkResult.updated} updated · {coworkResult.photos} photos saved
                {coworkResult.skipped > 0 && ` · ${coworkResult.skipped} photos skipped`}
              </p>
              {coworkResult.notFound.length > 0 && (
                <details className="mt-1">
                  <summary className="text-gray-400 cursor-pointer">{coworkResult.notFound.length} not found</summary>
                  <ul className="mt-1 space-y-0.5 pl-3">
                    {coworkResult.notFound.map((n) => <li key={n} className="text-gray-500">{n}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
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
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {waStatus?.importedAt
                ? `Last import: ${new Date(waStatus.importedAt).toLocaleString()} · ${waStatus.totalMessages.toLocaleString()} messages across ${waStatus.totalChats} chats`
                : "No data imported yet"}
            </p>
            <button
              onClick={async () => {
                if (!confirm("Delete all imported WhatsApp data and reset? You will need to reimport your chats.")) return
                const res = await fetch("/api/whatsapp/reset", { method: "DELETE" })
                if (res.ok) {
                  const data = await res.json()
                  setWaStatus(null)
                  setWaResult(null)
                  setWaUnmatched([])
                  setWaUnmatchedTotal(0)
                  if (data.deleted > 0) {
                    alert(`Cleared ${data.deleted.toLocaleString()} messages. You can now reimport.`)
                  }
                } else {
                  alert("Failed to clear WhatsApp data.")
                }
              }}
              className="shrink-0 text-xs text-red-500 hover:text-red-700 transition-colors font-medium"
            >
              Disconnect
            </button>
          </div>

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

          {/* Unmatched WhatsApp chats */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() => {
                  const next = !waUnmatchedOpen
                  setWaUnmatchedOpen(next)
                  if (next && waUnmatched.length === 0) loadWAUnmatched(0)
                }}
              >
                <div className="flex items-center gap-2">
                  <UserCheck size={14} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">
                    Review unmatched chats
                    {waUnmatchedTotal > 0 && (
                      <span className="ml-2 bg-amber-100 text-amber-700 text-xs rounded-full px-2 py-0.5">{waUnmatchedTotal}</span>
                    )}
                  </span>
                </div>
                {waUnmatchedOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>

              {waUnmatchedOpen && (
                <div className="border-t border-gray-100">
                  {waUnmatchedLoading && waUnmatched.length === 0 ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 size={16} className="animate-spin text-gray-400" />
                    </div>
                  ) : waUnmatched.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">All chats matched ✓</p>
                  ) : (
                    <>
                      <ul className="divide-y divide-gray-50">
                        {waUnmatched.map((chat) => (
                          <li key={chat.chatName} className="px-4 py-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate">{chat.chatName}</p>
                                <p className="text-xs text-gray-400">
                                  {chat.messageCount} message{chat.messageCount !== 1 ? "s" : ""}
                                  {chat.lastAt ? ` · last ${new Date(chat.lastAt).toLocaleDateString()}` : ""}
                                </p>
                              </div>
                            </div>

                            {/* Suggestions */}
                            {chat.suggestions.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {chat.suggestions.map((s) => (
                                  <button
                                    key={s.contactId}
                                    disabled={waAssigning === chat.chatName}
                                    onClick={() => assignWAMatch(chat.chatName, s.contactId)}
                                    className="flex items-center gap-1 text-xs bg-green-50 text-green-700 rounded-lg px-2.5 py-1 hover:bg-green-100 disabled:opacity-50 transition-colors"
                                  >
                                    {waAssigning === chat.chatName ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                    {s.name}
                                    {s.company && <span className="text-green-500 ml-0.5">({s.company})</span>}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Manual search */}
                            {waAssigningFor === chat.chatName ? (
                              <div className="relative">
                                <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5">
                                  <Search size={12} className="text-gray-400 shrink-0" />
                                  <input
                                    autoFocus
                                    type="text"
                                    value={waSearchQuery}
                                    onChange={(e) => searchWAContacts(e.target.value)}
                                    placeholder="Search contacts…"
                                    className="flex-1 text-xs outline-none bg-transparent"
                                  />
                                  <button onClick={() => { setWaAssigningFor(null); setWaSearchQuery(""); setWaSearchResults([]) }}>
                                    <X size={12} className="text-gray-400" />
                                  </button>
                                </div>
                                {waSearchResults.length > 0 && (
                                  <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                    {waSearchResults.map((c) => (
                                      <li key={c.id}>
                                        <button
                                          disabled={waAssigning === chat.chatName}
                                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                          onClick={() => assignWAMatch(chat.chatName, c.id)}
                                        >
                                          {waAssigning === chat.chatName && <Loader2 size={10} className="animate-spin text-blue-500" />}
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
                                onClick={() => { setWaAssigningFor(chat.chatName); setWaSearchQuery(""); setWaSearchResults([]) }}
                                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                + Assign manually
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>

                      {waUnmatched.length < waUnmatchedTotal && (
                        <div className="px-4 py-3 border-t border-gray-50">
                          <button
                            onClick={() => loadWAUnmatched(waUnmatchedPage + 1)}
                            disabled={waUnmatchedLoading}
                            className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                          >
                            {waUnmatchedLoading ? "Loading…" : `Load more (${waUnmatchedTotal - waUnmatched.length} remaining)`}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
        </div>
      </div>

      {/* LinkedIn Direct Messages */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            {/* LinkedIn icon */}
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4.5 h-4.5 text-blue-600" width={18} height={18}>
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">LinkedIn Messages</h2>
            <p className="text-xs text-gray-500">Import your LinkedIn message history to boost relationship scores</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              {liDMStatus?.importedAt
                ? `Last import: ${new Date(liDMStatus.importedAt).toLocaleString()} · ${liDMStatus.totalMessages.toLocaleString()} messages across ${liDMStatus.totalChats} conversations`
                : "No data imported yet"}
            </p>
            <button
              onClick={async () => {
                if (!confirm("Delete all imported LinkedIn message data and reset?")) return
                const res = await fetch("/api/linkedin-dm/reset", { method: "DELETE" })
                if (res.ok) {
                  const data = await res.json()
                  setLiDMStatus(null)
                  setLiDMResult(null)
                  setLiDMUnmatched([])
                  setLiDMUnmatchedTotal(0)
                  if (data.deleted > 0) alert(`Cleared ${data.deleted.toLocaleString()} messages.`)
                } else {
                  alert("Failed to clear LinkedIn DM data.")
                }
              }}
              className="shrink-0 text-xs text-red-500 hover:text-red-700 transition-colors font-medium"
            >
              Disconnect
            </button>
          </div>

          {liDMResult && (
            <div className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              Imported {liDMResult.synced.toLocaleString()} messages from {liDMResult.chats} conversation{liDMResult.chats !== 1 ? "s" : ""} — {liDMResult.matched} matched to contacts
              {(liDMResult.filteredCount ?? 0) > 0 && (
                <span className="text-blue-500"> · {liDMResult.filteredCount} spam/noise filtered</span>
              )}
            </div>
          )}

          {liDMProgress && (
            <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
              <Loader2 size={12} className="animate-spin" />
              {liDMProgress}
            </div>
          )}

          {/* How to export */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-800">How to export from LinkedIn</p>
            <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
              <li>Go to <strong>linkedin.com/mypreferences/d/data-privacy</strong> → <strong>Get a copy of your data</strong></li>
              <li>Select <strong>Messages</strong> only, click <strong>Request archive</strong></li>
              <li>LinkedIn emails you a download link (usually within minutes)</li>
              <li>Download the ZIP → extract → upload <strong>messages.csv</strong> below</li>
            </ol>
            <input
              ref={liDMFileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importLinkedInDM(e.target.files[0])}
            />
            <button
              onClick={() => liDMFileRef.current?.click()}
              disabled={liDMImporting}
              className="flex items-center gap-2 text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Upload size={13} />
              {liDMImporting ? "Importing…" : "Upload messages.csv"}
            </button>
          </div>

          <p className="text-xs text-gray-400">
            Only contact names, timestamps, and LinkedIn URLs are stored. Message content is never imported.
          </p>

          {/* Unmatched LinkedIn DM conversations */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="flex items-center">
              <button
                className="flex-1 flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() => {
                  const next = !liDMUnmatchedOpen
                  setLiDMUnmatchedOpen(next)
                  if (next && liDMUnmatched.length === 0) loadLiDMUnmatched(0)
                }}
              >
                <div className="flex items-center gap-2">
                  <UserCheck size={14} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-700">
                    Review unmatched conversations
                    {liDMUnmatchedTotal > 0 && (
                      <span className="ml-2 bg-amber-100 text-amber-700 text-xs rounded-full px-2 py-0.5">{liDMUnmatchedTotal}</span>
                    )}
                  </span>
                </div>
                {liDMUnmatchedOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>
              {liDMUnmatchedTotal > 0 && (
                <button
                  className="shrink-0 px-3 py-3 text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors border-l border-gray-100"
                  title="Re-run automatic matching on all unmatched conversations"
                  onClick={async () => {
                    const res = await fetch("/api/linkedin-dm/match", { method: "PUT" })
                    if (res.ok) {
                      const data = await res.json()
                      if (data.fixed > 0) {
                        loadLiDMUnmatched(0)
                        setLiDMUnmatchedTotal((t) => Math.max(0, t - data.fixed))
                      }
                    }
                  }}
                >
                  <RefreshCw size={13} />
                </button>
              )}
            </div>

            {liDMUnmatchedOpen && (
              <div className="border-t border-gray-100">
                {liDMUnmatchedLoading && liDMUnmatched.length === 0 ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 size={16} className="animate-spin text-gray-400" />
                  </div>
                ) : liDMUnmatched.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">All conversations matched ✓</p>
                ) : (
                  <>
                    <ul className="divide-y divide-gray-50">
                      {liDMUnmatched.map((chat) => (
                        <li key={chat.chatName} className="px-4 py-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-800 truncate">{chat.chatName}</p>
                              <p className="text-xs text-gray-400">
                                {chat.messageCount} message{chat.messageCount !== 1 ? "s" : ""}
                                {chat.lastAt ? ` · last ${new Date(chat.lastAt).toLocaleDateString()}` : ""}
                                {chat.profileUrl && (
                                  <a href={chat.profileUrl} target="_blank" rel="noreferrer" className="ml-2 text-blue-500 hover:text-blue-700">
                                    <ExternalLink size={10} className="inline" />
                                  </a>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Suggestions */}
                          {chat.suggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {chat.suggestions.map((s) => (
                                <button
                                  key={s.contactId}
                                  disabled={liDMAssigning === chat.chatName}
                                  onClick={() => assignLiDMMatch(chat.chatName, s.contactId)}
                                  className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 rounded-lg px-2.5 py-1 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                                >
                                  {liDMAssigning === chat.chatName ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                  {s.name}
                                  {s.company && <span className="text-blue-500 ml-0.5">({s.company})</span>}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Manual search */}
                          {liDMAssigningFor === chat.chatName ? (
                            <div className="relative">
                              <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5">
                                <Search size={12} className="text-gray-400 shrink-0" />
                                <input
                                  autoFocus
                                  type="text"
                                  value={liDMSearchQuery}
                                  onChange={(e) => searchLiDMContacts(e.target.value)}
                                  placeholder="Search contacts…"
                                  className="flex-1 text-xs outline-none bg-transparent"
                                />
                                <button onClick={() => { setLiDMAssigningFor(null); setLiDMSearchQuery(""); setLiDMSearchResults([]) }}>
                                  <X size={12} className="text-gray-400" />
                                </button>
                              </div>
                              {liDMSearchResults.length > 0 && (
                                <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                                  {liDMSearchResults.map((c) => (
                                    <li key={c.id}>
                                      <button
                                        disabled={liDMAssigning === chat.chatName}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        onClick={() => assignLiDMMatch(chat.chatName, c.id)}
                                      >
                                        {liDMAssigning === chat.chatName && <Loader2 size={10} className="animate-spin text-blue-500" />}
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
                              onClick={() => { setLiDMAssigningFor(chat.chatName); setLiDMSearchQuery(""); setLiDMSearchResults([]) }}
                              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              + Assign manually
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>

                    {liDMUnmatched.length < liDMUnmatchedTotal && (
                      <div className="px-4 py-3 border-t border-gray-50">
                        <button
                          onClick={() => loadLiDMUnmatched(liDMUnmatchedPage + 1)}
                          disabled={liDMUnmatchedLoading}
                          className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          {liDMUnmatchedLoading ? "Loading…" : `Load more (${liDMUnmatchedTotal - liDMUnmatched.length} remaining)`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interaction Scores */}
      <ScoreSection />

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
            <p className="text-xs font-semibold text-gray-700">Setup &amp; update instructions</p>
            <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside">
              <li>Pull the latest code (or download the <code className="bg-gray-200 rounded px-1">chrome-extension/</code> folder)</li>
              <li>Open Chrome → <code className="bg-gray-200 rounded px-1">chrome://extensions</code> → Enable Developer mode</li>
              <li>First time: click <strong>Load unpacked</strong> and select the folder.<br />
                  Already installed: click the <strong>↺ reload icon</strong> next to 6Degrees to pick up new code.</li>
              <li>Click the extension icon in your toolbar → paste your URL and token</li>
              <li>Visit any LinkedIn <code className="bg-gray-200 rounded px-1">/in/</code> profile → click <strong>Save to 6Degrees</strong></li>
            </ol>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              ⚠ If the extension popup shows a <strong>version mismatch</strong>: go to <code className="bg-amber-100 rounded px-0.5">chrome://extensions</code> and click the <strong>reload ↺</strong> icon — <em>not</em> the Regenerate button here.
            </p>
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
