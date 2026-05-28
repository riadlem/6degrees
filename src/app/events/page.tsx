"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useMemo } from "react"
import {
  Linkedin,
  Search,
  UserPlus,
  UserCheck,
  Building2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Users,
  Puzzle,
  Filter,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Speaker {
  id: string
  firstName: string
  lastName: string
  role: string | null
  company: string | null
  description: string | null
  sessionTopic: string | null
  linkedinUrl: string | null
  linkedinKey: string | null
  photoUrl: string | null
  contactId: string | null
  importedAt: string
  contact: { id: string; firstName: string; lastName: string; profileUrl: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

function linkedinSearchUrl(first: string, last: string, company: string | null) {
  const q = [first, last, company].filter(Boolean).join(" ")
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`
}

// ─── Speaker card ─────────────────────────────────────────────────────────────

function SpeakerCard({
  speaker,
  onAddContact,
  adding,
}: {
  speaker: Speaker
  onAddContact: (id: string) => void
  adding: boolean
}) {
  const inContacts = !!speaker.contactId
  const hasLinkedIn = !!speaker.linkedinUrl

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {speaker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={speaker.photoUrl}
            alt={`${speaker.firstName} ${speaker.lastName}`}
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {initials(speaker.firstName, speaker.lastName)}
          </div>
        )}

        {/* Name + role */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {speaker.firstName} {speaker.lastName}
          </p>
          {speaker.role && (
            <p className="text-xs text-gray-500 truncate">{speaker.role}</p>
          )}
          {speaker.company && (
            <p className="text-xs text-blue-600 font-medium flex items-center gap-1 truncate">
              <Building2 size={10} className="shrink-0" />
              {speaker.company}
            </p>
          )}
        </div>

        {/* In-contacts badge */}
        {inContacts && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 rounded-full">
            <UserCheck size={10} />
            Saved
          </span>
        )}
      </div>

      {/* Session topic */}
      {speaker.sessionTopic && (
        <div className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-[11px] text-amber-800 font-medium line-clamp-2">
            {speaker.sessionTopic}
          </p>
        </div>
      )}

      {/* Description */}
      {speaker.description && (
        <p className="text-xs text-gray-500 line-clamp-3">{speaker.description}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        {/* LinkedIn button */}
        {hasLinkedIn ? (
          <a
            href={speaker.linkedinUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Linkedin size={12} />
            Profile
          </a>
        ) : (
          <a
            href={linkedinSearchUrl(speaker.firstName, speaker.lastName, speaker.company)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            title="Search this person on LinkedIn"
          >
            <Search size={12} />
            Find on LinkedIn
          </a>
        )}

        {/* Add to contacts */}
        <button
          onClick={() => !inContacts && onAddContact(speaker.id)}
          disabled={inContacts || adding}
          className={cn(
            "ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors",
            inContacts
              ? "text-green-700 bg-green-50 border border-green-200 cursor-default"
              : adding
              ? "text-gray-400 bg-gray-50 border border-gray-200 cursor-wait"
              : "text-white bg-blue-600 hover:bg-blue-700 border border-blue-600"
          )}
        >
          {adding ? (
            <Loader2 size={12} className="animate-spin" />
          ) : inContacts ? (
            <UserCheck size={12} />
          ) : (
            <UserPlus size={12} />
          )}
          {inContacts ? "In contacts" : adding ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterTopic, setFilterTopic] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "inContacts" | "notInContacts" | "hasLinkedIn" | "noLinkedIn">("all")
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set())
  const [bulkAdding, setBulkAdding] = useState(false)
  const [topicOpen, setTopicOpen] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/")
  }, [status, router])

  useEffect(() => {
    if (!session) return
    fetch("/api/events/speakers?eventSlug=money2020-europe-2026")
      .then((r) => r.json())
      .then((data) => {
        setSpeakers(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session])

  const topics = useMemo(() => {
    const set = new Set<string>()
    for (const s of speakers) {
      if (s.sessionTopic) set.add(s.sessionTopic)
    }
    return Array.from(set).sort()
  }, [speakers])

  const filtered = useMemo(() => {
    let list = speakers
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
          (s.company || "").toLowerCase().includes(q) ||
          (s.role || "").toLowerCase().includes(q) ||
          (s.sessionTopic || "").toLowerCase().includes(q)
      )
    }
    if (filterTopic) {
      list = list.filter((s) => s.sessionTopic === filterTopic)
    }
    if (filterStatus === "inContacts") list = list.filter((s) => !!s.contactId)
    if (filterStatus === "notInContacts") list = list.filter((s) => !s.contactId)
    if (filterStatus === "hasLinkedIn") list = list.filter((s) => !!s.linkedinUrl)
    if (filterStatus === "noLinkedIn") list = list.filter((s) => !s.linkedinUrl)
    return list
  }, [speakers, search, filterTopic, filterStatus])

  const stats = useMemo(() => ({
    total: speakers.length,
    inContacts: speakers.filter((s) => !!s.contactId).length,
    withLinkedIn: speakers.filter((s) => !!s.linkedinUrl).length,
    notInContacts: speakers.filter((s) => !s.contactId).length,
  }), [speakers])

  async function handleAddContact(id: string) {
    setAddingIds((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/events/speakers/${id}/add-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: ["Money20/20", "M2020 Speakers"] }),
      })
      const data = await res.json()
      if (data.ok) {
        setSpeakers((prev) =>
          prev.map((s) => (s.id === id ? { ...s, contactId: data.contactId } : s))
        )
      }
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function handleBulkAdd() {
    const unimported = filtered.filter((s) => !s.contactId).map((s) => s.id)
    if (unimported.length === 0) return
    setBulkAdding(true)
    try {
      const res = await fetch("/api/events/speakers/bulk-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerIds: unimported,
          labels: ["Money20/20", "M2020 Speakers"],
        }),
      })
      const data = await res.json()
      if (data.ok) {
        // Refetch to get updated contactIds
        const updated = await fetch("/api/events/speakers?eventSlug=money2020-europe-2026").then((r) => r.json())
        setSpeakers(Array.isArray(updated) ? updated : speakers)
      }
    } finally {
      setBulkAdding(false)
    }
  }

  if (status === "loading" || !session) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 pt-20 pb-16">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Money 20/20 Europe 2026</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Amsterdam · June 2–4, 2026
              </p>
            </div>

            {/* Import instructions / stats */}
            {speakers.length > 0 ? (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-4 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm">
                  <span className="text-gray-500">
                    <span className="font-semibold text-gray-900">{stats.total}</span> speakers
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">
                    <span className="font-semibold text-green-600">{stats.inContacts}</span> in contacts
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">
                    <span className="font-semibold text-blue-600">{stats.withLinkedIn}</span> on LinkedIn
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Import instructions banner */}
        {speakers.length === 0 && !loading && (
          <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Puzzle size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">
                  Import speakers using the Chrome Extension
                </h3>
                <p className="text-sm text-blue-700 mb-3">
                  Visit the Money 20/20 speakers page with the 6Degrees Chrome Extension installed.
                  The extension will automatically scrape all speakers and import them here.
                </p>
                <a
                  href="https://europe.money2020.com/agenda/speakers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Open speakers page
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        {speakers.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search speakers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Topic filter */}
            {topics.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setTopicOpen(!topicOpen)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors bg-white",
                    filterTopic
                      ? "border-blue-400 text-blue-700 bg-blue-50"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Filter size={13} />
                  {filterTopic ? (
                    <span className="max-w-[160px] truncate">{filterTopic}</span>
                  ) : (
                    "Session"
                  )}
                  <ChevronDown size={13} />
                </button>
                {topicOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setTopicOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden max-h-64 overflow-y-auto">
                      <button
                        onClick={() => { setFilterTopic(""); setTopicOpen(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 border-b border-gray-100"
                      >
                        All sessions
                      </button>
                      {topics.map((t) => (
                        <button
                          key={t}
                          onClick={() => { setFilterTopic(t); setTopicOpen(false) }}
                          className={cn(
                            "w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 truncate",
                            filterTopic === t ? "text-blue-700 bg-blue-50" : "text-gray-700"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Status filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All speakers</option>
              <option value="inContacts">In contacts</option>
              <option value="notInContacts">Not in contacts</option>
              <option value="hasLinkedIn">Has LinkedIn</option>
              <option value="noLinkedIn">No LinkedIn found</option>
            </select>

            {/* Active filter chips */}
            {(filterTopic || filterStatus !== "all" || search) && (
              <button
                onClick={() => { setSearch(""); setFilterTopic(""); setFilterStatus("all") }}
                className="flex items-center gap-1 px-2.5 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"
              >
                <X size={12} /> Clear filters
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Bulk add */}
            {stats.notInContacts > 0 && (
              <button
                onClick={handleBulkAdd}
                disabled={bulkAdding}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {bulkAdding ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Users size={14} />
                )}
                {bulkAdding
                  ? "Adding…"
                  : `Add ${filterStatus === "notInContacts" ? filtered.filter((s) => !s.contactId).length : stats.notInContacts} to contacts`}
              </button>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading speakers…</span>
          </div>
        )}

        {/* Empty state after import */}
        {!loading && speakers.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Search size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No speakers match your filters.</p>
          </div>
        )}

        {/* Speaker grid */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((speaker) => (
              <SpeakerCard
                key={speaker.id}
                speaker={speaker}
                onAddContact={handleAddContact}
                adding={addingIds.has(speaker.id)}
              />
            ))}
          </div>
        )}

        {/* Result count */}
        {!loading && filtered.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-6">
            {filtered.length} of {speakers.length} speaker{speakers.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  )
}
