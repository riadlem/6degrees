"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { RefreshCw, ListPlus, Tag, Sparkles, Upload, Pencil } from "lucide-react"
import BulkAssignPopover from "@/components/BulkAssignPopover"
import ContactCard, { type ContactSummary } from "@/components/ContactCard"
import ContactRow from "@/components/ContactRow"
import ContactFilters, { type FilterState } from "@/components/ContactFilters"
import ContactDetail from "@/components/ContactDetail"
import AddToListModal from "@/components/AddToListModal"
import ManageLabelsModal from "@/components/ManageLabelsModal"
import { useSyncContext } from "@/contexts/SyncContext"

const DEFAULT_FILTERS: FilterState = {
  q: "", company: "", industry: "", location: "", position: "", label: "", sort: "name", preferredCompanies: false, sector: "", companyType: "", gmailMatched: "", country: "",
}

type LabelOption = { id: string; name: string; color: string }

type ApiMeta = {
  total: number
  pages: number
  filters: {
    industries: (string | null)[]
    companies: (string | null)[]
    locations: (string | null)[]
    countries: (string | null)[]
    labels: LabelOption[]
  }
}

function ContactsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [allContacts, setAllContacts] = useState<ContactSummary[]>([])
  const [meta, setMeta] = useState<ApiMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [view, setView] = useState<"grid" | "list">("grid")

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  const [addToListContacts, setAddToListContacts] = useState<ContactSummary[] | null>(null)
  const [labelContacts, setLabelContacts] = useState<ContactSummary[] | null>(null)

  function selectAll() { setSelectedIds(new Set(allContacts.map((c) => c.id))) }

  async function handleBulkAssign(field: "country" | "industry" | "note", value: string) {
    const ids = [...selectedIds]
    await fetch("/api/contacts/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, field, value }),
    })
    if (field !== "note") {
      setAllContacts((prev) => prev.map((c) =>
        selectedIds.has(c.id) ? { ...c, [field]: value || null } as ContactSummary : c
      ))
    }
    setSelectedIds(new Set())
    fetchPage(filters, 1, false)
  }

  type ImportState =
    | { phase: "idle" }
    | { phase: "importing"; synced: number; skipped: number; failed: number; total: number; current?: string }
    | { phase: "done"; synced: number; skipped: number; failed: number }
    | { phase: "error"; message: string }
  const [importState, setImportState] = useState<ImportState>({ phase: "idle" })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { syncState, resumable, setResumable, sync } = useSyncContext()
  const searchParams = useSearchParams()
  const linkedinConnected = searchParams.get("linkedin_connected") === "1"
  const linkedinError = searchParams.get("linkedin_error")

  // Apply ?company= URL param on first load (e.g. from treemap click-through)
  useEffect(() => {
    const company = searchParams.get("company")
    if (company) setFilters((f) => ({ ...f, company }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Persist view preference
  useEffect(() => {
    const saved = localStorage.getItem("contactsView") as "grid" | "list" | null
    if (saved) setView(saved)
  }, [])
  function handleViewChange(v: "grid" | "list") {
    setView(v)
    localStorage.setItem("contactsView", v)
  }

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/linkedin/sync")
      .then((r) => r.json())
      .then((d) => {
        if (d.hasResumable && d.cursor != null) {
          setResumable({ cursor: d.cursor, total: d.total ?? null })
        } else {
          setResumable(null)
        }
      })
      .catch(() => {})
  }, [status])

  const fetchPage = useCallback(async (f: FilterState, p: number, append: boolean) => {
    if (!append) setLoading(true)
    else setLoadingMore(true)
    try {
      const params = new URLSearchParams({
        q: f.q, company: f.company, industry: f.industry,
        location: f.location, position: f.position, label: f.label, sort: f.sort,
        page: String(p), limit: "48",
        preferredCompanies: f.preferredCompanies ? "true" : "false",
        sector: f.sector, companyType: f.companyType, gmailMatched: f.gmailMatched,
        country: f.country,
      })
      const res = await fetch(`/api/contacts?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setMeta({ total: data.total, pages: data.pages, filters: data.filters })
      if (append) {
        setAllContacts((prev) => [...prev, ...data.contacts])
      } else {
        setAllContacts(data.contacts)
      }
      setHasMore(p < data.pages)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // Debounce filter changes → reset to page 1
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      setSelectedIds(new Set())
      fetchPage(filters, 1, false)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filters, fetchPage])

  // Load next page when page increments beyond 1
  useEffect(() => {
    if (page > 1) fetchPage(filters, page, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // IntersectionObserver sentinel for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          setPage((p) => p + 1)
        }
      },
      { rootMargin: "300px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadingMore])

  // Refresh on sync progress / completion
  useEffect(() => {
    if (syncState.phase === "done") {
      setPage(1); fetchPage(filters, 1, false)
    } else if (syncState.phase === "syncing" && syncState.synced % 100 === 0) {
      fetchPage(filters, 1, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleFilterChange(partial: Partial<FilterState>) {
    setFilters((prev) => ({ ...prev, ...partial }))
  }

  function handleReset() {
    setFilters(DEFAULT_FILTERS)
  }

  async function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected
    e.target.value = ""

    const formData = new FormData()
    formData.append("file", file)

    setImportState({ phase: "importing", synced: 0, skipped: 0, failed: 0, total: 0 })

    try {
      const res = await fetch("/api/linkedin/import", { method: "POST", body: formData })
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}))
        setImportState({ phase: "error", message: json.error ?? "Import failed" })
        setTimeout(() => setImportState({ phase: "idle" }), 6000)
        return
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
            if (event.type === "progress") {
              setImportState({ phase: "importing", synced: event.synced, skipped: event.skipped ?? 0, failed: event.failed, total: event.total, current: event.current })
            } else if (event.type === "done") {
              setImportState({ phase: "done", synced: event.synced, skipped: event.skipped ?? 0, failed: event.failed })
              fetchPage(filters, 1, false)
              setTimeout(() => setImportState({ phase: "idle" }), 5000)
            } else if (event.type === "error") {
              setImportState({ phase: "error", message: event.message })
              setTimeout(() => setImportState({ phase: "idle" }), 6000)
            }
          } catch { /* malformed SSE */ }
        }
      }
    } catch (err) {
      setImportState({ phase: "error", message: err instanceof Error ? err.message : "Import failed" })
      setTimeout(() => setImportState({ phase: "idle" }), 6000)
    }
  }

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  const selectedContacts = allContacts.filter((c) => selectedIds.has(c.id))

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500 mt-1">
            {session?.user?.name}&apos;s LinkedIn network
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {selectedIds.size > 0 && (
            <>
              <BulkAssignPopover
                count={selectedIds.size}
                industries={(meta?.filters.industries ?? []).filter(Boolean) as string[]}
                onAssign={handleBulkAssign}
              />
              <button
                onClick={() => setLabelContacts(selectedContacts)}
                className="flex items-center gap-1.5 text-sm text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 sm:px-3 py-2 rounded-xl transition-colors font-medium"
              >
                <Tag size={14} />
                <span className="hidden sm:inline">Label </span>{selectedIds.size}
              </button>
              <button
                onClick={() => setAddToListContacts(selectedContacts)}
                className="flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 px-2.5 sm:px-3 py-2 rounded-xl transition-colors font-medium"
              >
                <ListPlus size={15} />
                <span className="hidden sm:inline">Add {selectedIds.size} to list</span>
                <span className="sm:hidden">{selectedIds.size}</span>
              </button>
            </>
          )}

          <a
            href="/enrich"
            title="Enrich contacts"
            className="flex items-center gap-1.5 text-sm text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 sm:px-3 py-2 rounded-xl transition-colors font-medium"
          >
            <Sparkles size={14} />
            <span className="hidden sm:inline">Enrich</span>
          </a>

          {/* Hidden file input for CSV import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportCsv}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importState.phase === "importing" || syncState.phase !== "idle"}
            title="Import Connections.csv from your LinkedIn data export"
            className="flex items-center gap-1.5 text-sm text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 sm:px-3 py-2 rounded-xl transition-colors font-medium disabled:opacity-50"
          >
            <Upload size={14} />
            <span className="hidden sm:inline">Import CSV</span>
          </button>

          <button
            onClick={() => sync()}
            disabled={syncState.phase !== "idle" || importState.phase === "importing"}
            title="Quick sync: fetches connections from the last 30 days. Use 'Restart' for a full sync."
            className="flex items-center gap-1.5 text-sm text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 sm:px-3 py-2 rounded-xl transition-colors font-medium disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncState.phase !== "idle" ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{syncState.phase === "idle" ? "Sync (30 days)" : "Syncing…"}</span>
          </button>

          <a
            href="/api/auth/linkedin-connect"
            title="Connect LinkedIn"
            className="flex items-center gap-1.5 text-sm text-white bg-[#0A66C2] hover:bg-[#004182] px-2.5 sm:px-3 py-2 rounded-xl transition-colors font-medium"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current shrink-0"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            <span className="hidden sm:inline">Connect LinkedIn</span>
          </a>
        </div>
      </div>

      {linkedinConnected && (
        <div className="mb-4 text-sm px-4 py-2.5 rounded-xl border bg-green-50 border-green-200 text-green-700">
          LinkedIn connected. You can now sync your contacts.
        </div>
      )}
      {linkedinError && (
        <div className="mb-4 text-sm px-4 py-2.5 rounded-xl border bg-red-50 border-red-200 text-red-700">
          LinkedIn connection failed: {linkedinError}
        </div>
      )}
      {resumable && syncState.phase === "idle" && (
        <div className="mb-4 flex items-center justify-between px-4 py-2.5 rounded-xl border bg-amber-50 border-amber-200 text-sm">
          <span className="text-amber-800 font-medium">
            Previous sync interrupted
            {resumable.total ? ` — ~${resumable.cursor * 100} of ${resumable.total} contacts synced` : ""}.
          </span>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <button onClick={() => sync(false, true)} className="text-amber-700 font-semibold hover:text-amber-900">
              Resume from where it stopped
            </button>
            <button onClick={() => sync(true)} className="text-amber-500 hover:text-amber-700 text-xs">
              Restart from beginning
            </button>
          </div>
        </div>
      )}
      {syncState.phase !== "idle" && (
        <div className={`mb-4 rounded-xl border overflow-hidden ${syncState.phase === "error" ? "bg-red-50 border-red-200" : syncState.phase === "done" ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200"}`}>
          <div className="flex items-center justify-between px-4 py-2.5 text-sm font-medium">
            <span className={syncState.phase === "error" ? "text-red-700" : syncState.phase === "done" ? "text-green-700" : "text-blue-700"}>
              {syncState.phase === "connecting" && "Connecting to LinkedIn…"}
              {syncState.phase === "fetching" && (syncState.message ?? (syncState.total ? `Found ${syncState.total} connections, syncing…` : "Fetching connections…"))}
              {syncState.phase === "syncing" && (
                <>
                  {syncState.synced === syncState.total
                    ? `Syncing recent connections…`
                    : `Syncing ${syncState.synced} / ${syncState.total} contacts…`}
                  {syncState.current && <span className="ml-1 text-blue-500 font-normal truncate max-w-[200px] inline-block align-bottom">{syncState.current}</span>}
                </>
              )}
              {syncState.phase === "done" && `✓ Synced ${syncState.synced} contacts${syncState.failed ? ` (${syncState.failed} failed)` : ""}`}
              {syncState.phase === "error" && `Error: ${syncState.message}`}
            </span>
            {syncState.phase === "syncing" && (
              <span className="text-blue-500 text-xs tabular-nums">
                {Math.round((syncState.synced / Math.max(syncState.synced, syncState.total)) * 100)}%
              </span>
            )}
          </div>
          {syncState.phase === "syncing" && (
            <div className="h-1 bg-blue-100">
              <div
                className="h-1 bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.round((syncState.synced / Math.max(syncState.synced, syncState.total)) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* CSV import progress */}
      {importState.phase !== "idle" && (
        <div className={`mb-4 rounded-xl border overflow-hidden ${importState.phase === "error" ? "bg-red-50 border-red-200" : importState.phase === "done" ? "bg-green-50 border-green-200" : "bg-violet-50 border-violet-200"}`}>
          <div className="flex items-center justify-between px-4 py-2.5 text-sm font-medium">
            <span className={importState.phase === "error" ? "text-red-700" : importState.phase === "done" ? "text-green-700" : "text-violet-700"}>
              {importState.phase === "importing" && (
                <>
                  Importing {importState.synced} / {importState.total} contacts from CSV…
                  {importState.current && <span className="ml-1 text-violet-500 font-normal truncate max-w-[200px] inline-block align-bottom">{importState.current}</span>}
                </>
              )}
              {importState.phase === "done" && [
                `✓ Imported ${importState.synced} new contacts`,
                importState.skipped ? `, ${importState.skipped} already existed` : "",
                importState.failed  ? `, ${importState.failed} failed` : "",
              ].join("")}
              {importState.phase === "error" && `Import error: ${importState.message}`}
            </span>
            {importState.phase === "importing" && importState.total > 0 && (
              <span className="text-violet-500 text-xs tabular-nums">
                {Math.round((importState.synced / importState.total) * 100)}%
              </span>
            )}
          </div>
          {importState.phase === "importing" && importState.total > 0 && (
            <div className="h-1 bg-violet-100">
              <div
                className="h-1 bg-violet-500 transition-all duration-300"
                style={{ width: `${Math.round((importState.synced / importState.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5">
        <ContactFilters
          filters={filters}
          options={meta?.filters ?? { industries: [], companies: [], locations: [], countries: [], labels: [] }}
          total={meta?.total ?? 0}
          view={view}
          onViewChange={handleViewChange}
          onChange={handleFilterChange}
          onReset={handleReset}
        />
      </div>

      {/* Bulk select bar */}
      <div className="flex items-center justify-between mb-4 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={selectAll}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Select all {allContacts.length}{meta && meta.total > allContacts.length ? ` of ${meta.total}` : ""}
          </button>
          {selectedIds.size > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-blue-700 font-medium">{selectedIds.size} selected</span>
            </>
          )}
        </div>
        {selectedIds.size > 0 && (
          <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-gray-600 text-xs">
            Clear
          </button>
        )}
      </div>

      {/* Contact list/grid */}
      {loading ? (
        view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-36 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        )
      ) : allContacts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">
            {filters.q || filters.company || filters.industry || filters.location || filters.position || filters.label || filters.preferredCompanies || filters.sector || filters.companyType || filters.gmailMatched
              ? "No contacts match your filters."
              : "No contacts yet — sync your LinkedIn network to get started."}
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {allContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              selected={selectedIds.has(contact.id)}
              onSelect={toggleSelect}
              onClick={(c) => setActiveContactId(c.id)}
              onAddToList={(c) => setAddToListContacts([c])}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {(() => {
            const groupKey = filters.sort === "country" || filters.sort === "country_desc" ? "country"
              : filters.sort === "industry" || filters.sort === "industry_desc" ? "industry"
              : null
            let lastGroup: string | null | undefined = undefined
            return allContacts.map((contact) => {
              const group = groupKey ? (contact as Record<string, unknown>)[groupKey] as string | null : undefined
              const showHeader = groupKey && group !== lastGroup
              lastGroup = group
              return (
                <div key={contact.id}>
                  {showHeader && (
                    <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {group ?? "—"}
                    </div>
                  )}
                  <ContactRow
                    contact={contact}
                    selected={selectedIds.has(contact.id)}
                    onSelect={toggleSelect}
                    onClick={(c) => setActiveContactId(c.id)}
                    onAddToList={(c) => setAddToListContacts([c])}
                  />
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4 mt-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Contact detail panel */}
      <ContactDetail
        contactId={activeContactId}
        onClose={() => setActiveContactId(null)}
      />

      {/* Add to list modal */}
      {addToListContacts && (
        <AddToListModal
          contacts={addToListContacts}
          onClose={() => { setAddToListContacts(null); setSelectedIds(new Set()) }}
          onDone={() => { setAddToListContacts(null); setSelectedIds(new Set()); fetchPage(filters, 1, false) }}
        />
      )}

      {/* Manage labels modal */}
      {labelContacts && (
        <ManageLabelsModal
          contacts={labelContacts}
          onClose={() => { setLabelContacts(null); setSelectedIds(new Set()) }}
          onDone={() => { setLabelContacts(null); setSelectedIds(new Set()); fetchPage(filters, 1, false) }}
        />
      )}
    </div>
  )
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <ContactsContent />
    </Suspense>
  )
}
