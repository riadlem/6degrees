"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, ListPlus, Tag, Sparkles, Upload, Pencil, Wand2 } from "lucide-react"
import { cn, initials, photoSrc } from "@/lib/utils"
import BulkAssignPopover from "@/components/BulkAssignPopover"
import ContactCard, { type ContactSummary } from "@/components/ContactCard"
import ContactRow from "@/components/ContactRow"
import ContactFilters, { type FilterState } from "@/components/ContactFilters"
import ContactDetail from "@/components/ContactDetail"
import AddToListModal from "@/components/AddToListModal"
import ManageLabelsModal from "@/components/ManageLabelsModal"
import SegmentBuilder from "@/components/SegmentBuilder"
import { useSyncContext } from "@/contexts/SyncContext"
import { usePersistedFilters } from "@/hooks/usePersistedFilters"

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

type ContactsPage = {
  contacts: ContactSummary[]
  total: number
  pages: number
  filters: ApiMeta["filters"]
}

async function fetchContactsPage(
  filters: FilterState,
  page: number,
  segmentIds: string[] | null,
): Promise<ContactsPage> {
  if (segmentIds && segmentIds.length > 0) {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: segmentIds, sort: filters.sort, page, limit: 48 }),
    })
    if (!res.ok) throw new Error("Failed to fetch contacts")
    return res.json()
  } else {
    const params = new URLSearchParams({
      q: filters.q, companies: filters.companies.join(","), industry: filters.industry,
      location: filters.location, position: filters.position, label: filters.label, sort: filters.sort,
      page: String(page), limit: "48",
      preferredCompanies: filters.preferredCompanies ? "true" : "false",
      sector: filters.sector, companyType: filters.companyType, gmailMatched: filters.gmailMatched,
      country: filters.country,
    })
    const res = await fetch(`/api/contacts?${params}`)
    if (!res.ok) throw new Error("Failed to fetch contacts")
    return res.json()
  }
}

function ContactsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const userId = session?.user?.id

  const [filters, updateFilters, resetFilters] = usePersistedFilters()
  const [view, setView] = useState<"grid" | "list" | "photos">("grid")

  // Debounce search text changes so we don't fire a query on every keystroke
  const [debouncedFilters, setDebouncedFilters] = useState<FilterState>(filters)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedFilters(filters), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filters])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [segmentOpen, setSegmentOpen] = useState(false)
  const [segmentIds, setSegmentIds] = useState<string[] | null>(null)
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  const [addToListState, setAddToListState] = useState<{ contactIds: string[]; contacts?: ContactSummary[] } | null>(null)
  const [labelContacts, setLabelContacts] = useState<ContactSummary[] | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Stable serialised query key for the filter state
  const filtersKey = JSON.stringify(debouncedFilters)
  const segmentKey = segmentIds ? segmentIds.slice(0, 5).join(",") : null

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["contacts", userId, filtersKey, segmentKey],
    queryFn: ({ pageParam = 1 }) =>
      fetchContactsPage(debouncedFilters, pageParam as number, segmentIds),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      (lastPageParam as number) < lastPage.pages ? (lastPageParam as number) + 1 : undefined,
    enabled: status === "authenticated",
    staleTime: 2 * 60 * 1000,
  })

  const allContacts = data?.pages.flatMap((p) => p.contacts) ?? []
  const meta: ApiMeta | null = data?.pages[0]
    ? { total: data.pages[0].total, pages: data.pages[0].pages, filters: data.pages[0].filters }
    : null

  const loading = isFetching && !isFetchingNextPage && allContacts.length === 0
  const loadingMore = isFetchingNextPage

  function selectAll() {
    if (segmentIds) setSelectedIds(new Set(segmentIds))
    else setSelectedIds(new Set(allContacts.map((c) => c.id)))
  }

  function clearSegment() {
    setSegmentIds(null)
    setSelectedIds(new Set())
  }

  async function handleBulkAssign(field: "country" | "industry" | "note", value: string) {
    const ids = [...selectedIds]
    await fetch("/api/contacts/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, field, value }),
    })
    setSelectedIds(new Set())
    queryClient.invalidateQueries({ queryKey: ["contacts", userId] })
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

  // Apply URL params on first load: ?company= (treemap), ?contact= (deep link), ?view= (view mode)
  useEffect(() => {
    const company = searchParams.get("company")
    if (company) updateFilters({ companies: [company] })

    const contactId = searchParams.get("contact")
    if (contactId) setActiveContactId(contactId)

    const viewParam = searchParams.get("view") as "grid" | "list" | "photos" | null
    if (viewParam && ["grid", "list", "photos"].includes(viewParam)) {
      setView(viewParam)
    } else {
      const saved = localStorage.getItem("contactsView") as "grid" | "list" | "photos" | null
      if (saved) setView(saved)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back/forward button: sync activeContactId with URL ?contact= param
  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search)
      setActiveContactId(params.get("contact"))
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  // Open contact — pushes a history entry so the back button closes the drawer
  function openContact(id: string) {
    setActiveContactId(id)
    const url = new URL(window.location.href)
    url.searchParams.set("contact", id)
    window.history.pushState({ contactId: id }, "", url.toString())
  }

  // Close contact via ✕ or backdrop — replaces history entry (no extra back step)
  function closeContact() {
    setActiveContactId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("contact")
    window.history.replaceState({}, "", url.toString())
  }

  function handleViewChange(v: "grid" | "list" | "photos") {
    setView(v)
    localStorage.setItem("contactsView", v)
    const url = new URL(window.location.href)
    url.searchParams.set("view", v)
    window.history.replaceState({}, "", url.toString())
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

  // Refresh contact list on sync completion / partial progress
  useEffect(() => {
    if (syncState.phase === "done") {
      queryClient.invalidateQueries({ queryKey: ["contacts", userId] })
    } else if (syncState.phase === "syncing" && syncState.synced % 100 === 0) {
      queryClient.invalidateQueries({ queryKey: ["contacts", userId] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState])

  // IntersectionObserver sentinel for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !loadingMore) {
          fetchNextPage()
        }
      },
      { rootMargin: "300px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, loadingMore, fetchNextPage])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleFilterChange(partial: Partial<FilterState>) {
    // Reset segment IDs on filter changes so segment mode doesn't interfere
    updateFilters(partial)
  }

  async function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
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
              queryClient.invalidateQueries({ queryKey: ["contacts", userId] })
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

  // For display-only use cases (label modal); NOT used for add-to-list (would miss off-page contacts)
  const selectedContactsOnPage = allContacts.filter((c) => selectedIds.has(c.id))

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
                onClick={() => setLabelContacts(selectedContactsOnPage)}
                className="flex items-center gap-1.5 text-sm text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 sm:px-3 py-2 rounded-xl transition-colors font-medium"
              >
                <Tag size={14} />
                <span className="hidden sm:inline">Label </span>{selectedIds.size}
              </button>
              <button
                onClick={() => setAddToListState({ contactIds: [...selectedIds] })}
                className="flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 px-2.5 sm:px-3 py-2 rounded-xl transition-colors font-medium"
              >
                <ListPlus size={15} />
                <span className="hidden sm:inline">Add {selectedIds.size} to list</span>
                <span className="sm:hidden">{selectedIds.size}</span>
              </button>
            </>
          )}

          <button
            onClick={() => setSegmentOpen((o) => !o)}
            title="Build a dynamic segment"
            className={cn(
              "flex items-center gap-1.5 text-sm border px-2.5 sm:px-3 py-2 rounded-xl transition-colors font-medium",
              segmentOpen
                ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                : "text-gray-700 border-gray-200 bg-white hover:bg-gray-50"
            )}
          >
            <Wand2 size={14} />
            <span className="hidden sm:inline">Segment</span>
          </button>

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
      {/* Pacing notice — shown once when idle, hidden during active sync */}
      {syncState.phase === "idle" && importState.phase === "idle" && (
        <p className="mb-3 text-xs text-gray-400">
          ⏱ Syncs are automatically paced (2–5 s between pages) to avoid LinkedIn security alerts. Quick syncs are limited to once every 4 h.
        </p>
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

      {/* Segment builder */}
      {segmentOpen && (
        <div className="mb-4">
          <SegmentBuilder
            onSelect={(ids) => {
              setSegmentIds(ids)
              setSelectedIds(new Set(ids))
              setSegmentOpen(false)
            }}
            onClose={() => setSegmentOpen(false)}
          />
        </div>
      )}

      {/* Segment active banner */}
      {segmentIds && !segmentOpen && (
        <div className="mb-4 flex items-center justify-between px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <span className="text-blue-800 font-medium flex items-center gap-2 min-w-0">
            <span className="shrink-0">Segment:</span>
            <span className="font-bold shrink-0">{segmentIds.length}</span>
            <span className="text-blue-600 shrink-0">contacts matched</span>
          </span>
          <button
            onClick={clearSegment}
            className="text-blue-600 hover:text-blue-800 font-semibold text-xs ml-4 shrink-0"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Filters — hidden in segment mode (filters are inactive there; only sort applies) */}
      {segmentIds ? (
        <div className="mb-5 flex items-center gap-3">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{meta?.total ?? segmentIds.length}</span> contact{(meta?.total ?? segmentIds.length) !== 1 ? "s" : ""}
          </span>
          <select
            value={filters.sort}
            onChange={(e) => handleFilterChange({ sort: e.target.value })}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            {[
              { value: "name",          label: "Name A–Z" },
              { value: "name_desc",     label: "Name Z–A" },
              { value: "company",       label: "Company A–Z" },
              { value: "connected",     label: "Recently connected" },
              { value: "mutual",        label: "Most connections" },
              { value: "mutual_asc",    label: "Fewest connections" },
              { value: "score",         label: "Interaction score" },
            ].map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => handleViewChange("grid")} className={cn("px-2.5 py-1.5 transition-colors", view === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")} title="Grid">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor"/><rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor"/><rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor"/><rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor"/></svg>
            </button>
            <button onClick={() => handleViewChange("list")} className={cn("px-2.5 py-1.5 transition-colors border-l border-gray-200", view === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")} title="List">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="2" rx="1" fill="currentColor"/><rect x="1" y="6" width="12" height="2" rx="1" fill="currentColor"/><rect x="1" y="10" width="12" height="2" rx="1" fill="currentColor"/></svg>
            </button>
            <button onClick={() => handleViewChange("photos")} className={cn("px-2.5 py-1.5 transition-colors border-l border-gray-200", view === "photos" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")} title="Photos">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3.5" cy="4" r="2.5" fill="currentColor"/><circle cx="10.5" cy="4" r="2.5" fill="currentColor"/><circle cx="3.5" cy="10" r="2.5" fill="currentColor"/><circle cx="10.5" cy="10" r="2.5" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-5">
          <ContactFilters
            filters={filters}
            options={meta?.filters ?? { industries: [], companies: [], locations: [], countries: [], labels: [] }}
            total={meta?.total ?? 0}
            view={view}
            onViewChange={handleViewChange}
            onChange={handleFilterChange}
            onReset={resetFilters}
          />
        </div>
      )}

      {/* Bulk select bar */}
      <div className="flex items-center justify-between mb-4 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={selectAll}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {segmentIds
              ? `Select all ${segmentIds.length} segment contacts`
              : `Select all ${allContacts.length}${meta && meta.total > allContacts.length ? ` of ${meta.total}` : ""}`
            }
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
        view === "photos" ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="rounded-xl overflow-hidden bg-white">
                <div className="aspect-square bg-gray-100 animate-pulse" />
                <div className="px-2 py-1.5 space-y-1">
                  <div className="h-2.5 bg-gray-100 animate-pulse rounded" />
                  <div className="h-2 bg-gray-100 animate-pulse rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : view === "grid" ? (
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
            {filters.q || filters.companies.length > 0 || filters.industry || filters.location || filters.position || filters.label || filters.preferredCompanies || filters.sector || filters.companyType || filters.gmailMatched
              ? "No contacts match your filters."
              : "No contacts yet — sync your LinkedIn network to get started."}
          </p>
        </div>
      ) : view === "photos" ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {allContacts.map((contact) => (
            <button
              key={contact.id}
              onClick={() => openContact(contact.id)}
              className="group flex flex-col rounded-xl overflow-hidden bg-white border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
            >
              <div className="aspect-square w-full relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
                {contact.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoSrc(contact.photoUrl)!}
                    alt={`${contact.firstName} ${contact.lastName}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-xl">
                    {initials(contact.firstName, contact.lastName)}
                  </div>
                )}
              </div>
              <div className="px-2 py-1.5">
                <p className="text-xs font-semibold text-gray-900 truncate leading-tight">
                  {contact.firstName} {contact.lastName}
                </p>
                {contact.company && (
                  <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{contact.company}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {allContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              selected={selectedIds.has(contact.id)}
              onSelect={toggleSelect}
              onClick={(c) => openContact(c.id)}
              onAddToList={(c) => setAddToListState({ contactIds: [c.id], contacts: [c] })}
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
                    onClick={(c) => openContact(c.id)}
                    onAddToList={(c) => setAddToListState({ contactIds: [c.id], contacts: [c] })}
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
        onClose={closeContact}
      />

      {/* Add to list modal */}
      {addToListState && (
        <AddToListModal
          contactIds={addToListState.contactIds}
          contacts={addToListState.contacts}
          onClose={() => { setAddToListState(null); setSelectedIds(new Set()) }}
          onDone={() => {
            setAddToListState(null)
            setSelectedIds(new Set())
            queryClient.invalidateQueries({ queryKey: ["contacts", userId] })
          }}
        />
      )}

      {/* Manage labels modal */}
      {labelContacts && (
        <ManageLabelsModal
          contacts={labelContacts}
          onClose={() => { setLabelContacts(null); setSelectedIds(new Set()) }}
          onDone={() => {
            setLabelContacts(null)
            setSelectedIds(new Set())
            queryClient.invalidateQueries({ queryKey: ["contacts", userId] })
          }}
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
