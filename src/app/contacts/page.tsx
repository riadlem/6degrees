"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { RefreshCw, ListPlus } from "lucide-react"
import ContactCard, { type ContactSummary } from "@/components/ContactCard"
import ContactFilters, { type FilterState } from "@/components/ContactFilters"
import ContactDetail from "@/components/ContactDetail"
import AddToListModal from "@/components/AddToListModal"

const DEFAULT_FILTERS: FilterState = {
  q: "", company: "", industry: "", location: "", position: "", sort: "name",
}

type ApiResponse = {
  contacts: ContactSummary[]
  total: number
  page: number
  pages: number
  filters: {
    industries: (string | null)[]
    companies: (string | null)[]
    locations: (string | null)[]
  }
}

export default function ContactsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  const [addToListContacts, setAddToListContacts] = useState<ContactSummary[] | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const linkedinConnected = searchParams.get("linkedin_connected") === "1"
  const linkedinError = searchParams.get("linkedin_error")

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const fetchContacts = useCallback(async (f: FilterState, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: f.q, company: f.company, industry: f.industry,
        location: f.location, position: f.position, sort: f.sort,
        page: String(p), limit: "48",
      })
      const res = await fetch(`/api/contacts?${params}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce filter changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      fetchContacts(filters, 1)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filters, fetchContacts])

  useEffect(() => {
    fetchContacts(filters, page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  async function sync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch("/api/linkedin/sync", { method: "POST" })
      const json = await res.json()
      if (json.error) {
        setSyncResult(`Error: ${json.error}`)
      } else {
        setSyncResult(`✓ Synced ${json.synced} contacts (${json.failed} failed)`)
        fetchContacts(filters, page)
      }
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(null), 5000)
    }
  }

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

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  const contacts = data?.contacts ?? []
  const selectedContacts = contacts.filter((c) => selectedIds.has(c.id))

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

        <div className="flex items-center gap-2 shrink-0">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setAddToListContacts(selectedContacts)}
              className="flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl transition-colors font-medium"
            >
              <ListPlus size={15} />
              Add {selectedIds.size} to list
            </button>
          )}

          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-sm text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors font-medium disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync LinkedIn"}
          </button>

          <a
            href="/api/auth/linkedin-connect"
            className="flex items-center gap-1.5 text-sm text-white bg-[#0A66C2] hover:bg-[#004182] px-3 py-2 rounded-xl transition-colors font-medium"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current shrink-0"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            Connect LinkedIn
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
      {syncResult && (
        <div className={`mb-4 text-sm px-4 py-2.5 rounded-xl border ${syncResult.startsWith("Error") ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"}`}>
          {syncResult}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5">
        <ContactFilters
          filters={filters}
          options={data?.filters ?? { industries: [], companies: [], locations: [] }}
          total={data?.total ?? 0}
          onChange={handleFilterChange}
          onReset={handleReset}
        />
      </div>

      {/* Bulk select bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <span className="text-blue-700 font-medium">{selectedIds.size} contact{selectedIds.size !== 1 ? "s" : ""} selected</span>
          <button onClick={() => setSelectedIds(new Set())} className="text-blue-500 hover:text-blue-700 text-xs">
            Clear selection
          </button>
        </div>
      )}

      {/* Grid */}
      {loading && contacts.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">
            {data?.total === 0
              ? "No contacts yet — sync your LinkedIn network to get started."
              : "No contacts match your filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {contacts.map((contact) => (
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
      )}

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {data.page} of {data.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            disabled={page === data.pages}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
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
          onDone={() => { setAddToListContacts(null); setSelectedIds(new Set()); fetchContacts(filters, page) }}
        />
      )}
    </div>
  )
}
