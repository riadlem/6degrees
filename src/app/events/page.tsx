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
  Link2,
  Link2Off,
  Download,
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
  contact: {
    id: string
    firstName: string
    lastName: string
    profileUrl: string | null
    linkedinKey: string | null
    linkedinDegree: string | null
    connectedOn: string | null
  } | null
}

type StatusFilter = "all" | "inContacts" | "notInContacts" | "hasLinkedIn" | "notConnected"
type ViewMode = "grid" | "list" | "photos"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

function linkedinSearchUrl(first: string, last: string, company: string | null) {
  const q = [first, last, company].filter(Boolean).join(" ")
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}`
}

function resolvedLinkedinUrl(speaker: Speaker): string | null {
  if (speaker.linkedinUrl) return speaker.linkedinUrl
  if (speaker.contact?.profileUrl) return speaker.contact.profileUrl
  const key = speaker.linkedinKey || speaker.contact?.linkedinKey
  if (key) return `https://www.linkedin.com/in/${key}/`
  return null
}

function hasLinkedIn(speaker: Speaker): boolean {
  return !!resolvedLinkedinUrl(speaker)
}

function isConnected(speaker: Speaker): boolean {
  return (
    !!speaker.contact?.connectedOn ||
    speaker.contact?.linkedinDegree === "1"
  )
}

// Has a LinkedIn profile but NOT a 1st-degree connection
function isNotConnected(speaker: Speaker): boolean {
  return hasLinkedIn(speaker) && !isConnected(speaker)
}

// LinkedIn icon fill color based on connection state
function liColor(speaker: Speaker): string {
  if (!hasLinkedIn(speaker)) return "#9CA3AF"
  if (isConnected(speaker)) return "#0A66C2"
  return "#D97706"
}

const LI_PATH = "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"

// ─── Speaker card (grid view) ─────────────────────────────────────────────────

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
  const liUrl = resolvedLinkedinUrl(speaker)
  const degree = speaker.contact?.linkedinDegree
  const connected = isConnected(speaker)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-3">
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

        {/* LinkedIn status icon — blue=connected, amber=profile found, gray=none */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {liUrl ? (
            <a
              href={liUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={connected ? "1st-degree LinkedIn connection" : "LinkedIn profile — not yet connected"}
              onClick={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: connected ? "#0A66C2" : "#D97706" }}>
                <path d={LI_PATH} />
              </svg>
            </a>
          ) : (
            <a
              href={linkedinSearchUrl(speaker.firstName, speaker.lastName, speaker.company)}
              target="_blank"
              rel="noopener noreferrer"
              title="Search on LinkedIn"
              onClick={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: "#D1D5DB" }}>
                <path d={LI_PATH} />
              </svg>
            </a>
          )}
          {inContacts && (
            <span title="Saved in contacts">
              <UserCheck size={13} className="text-green-500" />
            </span>
          )}
        </div>
      </div>

      {/* Session tag */}
      {speaker.sessionTopic && (
        <div className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-[11px] text-amber-800 font-medium line-clamp-1">
            {speaker.sessionTopic}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1">
        {liUrl ? (
          <a
            href={liUrl}
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

// ─── Speaker row (list view) ──────────────────────────────────────────────────

// photo | LI | name+role | company | session | badge | actions
const ROW_GRID = "2.25rem 1.5rem 1fr 1fr 7rem 5.5rem 7rem"

function SpeakerRow({
  speaker,
  onAddContact,
  adding,
}: {
  speaker: Speaker
  onAddContact: (id: string) => void
  adding: boolean
}) {
  const inContacts = !!speaker.contactId
  const liUrl = resolvedLinkedinUrl(speaker)
  const degree = speaker.contact?.linkedinDegree
  const connected = isConnected(speaker)
  const color = liColor(speaker)

  return (
    <div
      className="group grid items-center gap-2 px-3 py-2 text-xs odd:bg-white even:bg-gray-50/60 hover:bg-gray-100 transition-colors"
      style={{ gridTemplateColumns: ROW_GRID }}
    >
      {/* Photo */}
      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
        {speaker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={speaker.photoUrl}
            alt={`${speaker.firstName} ${speaker.lastName}`}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
            {initials(speaker.firstName, speaker.lastName)}
          </div>
        )}
      </div>

      {/* LinkedIn icon */}
      <div className="flex items-center justify-center">
        {liUrl ? (
          <a
            href={liUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={connected ? "1st-degree connection" : "LinkedIn profile"}
            onClick={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: color }}>
              <path d={LI_PATH} />
            </svg>
          </a>
        ) : (
          <a
            href={linkedinSearchUrl(speaker.firstName, speaker.lastName, speaker.company)}
            target="_blank"
            rel="noopener noreferrer"
            title="Search on LinkedIn"
            onClick={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: color }}>
              <path d={LI_PATH} />
            </svg>
          </a>
        )}
      </div>

      {/* Name + role */}
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate leading-tight">
          {speaker.firstName} {speaker.lastName}
        </p>
        {speaker.role && (
          <p className="text-xs text-gray-400 truncate leading-tight">{speaker.role}</p>
        )}
      </div>

      {/* Company */}
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{speaker.company ?? ""}</p>
      </div>

      {/* Session topic */}
      <div className="min-w-0">
        {speaker.sessionTopic && (
          <span className="inline-block max-w-full truncate text-[10px] font-medium px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md">
            {speaker.sessionTopic}
          </span>
        )}
      </div>

      {/* Connection badge */}
      <div className="flex items-center gap-1 shrink-0">
        {inContacts && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 rounded-full">
            <UserCheck size={9} />
            Saved
          </span>
        )}
        {degree && degree !== "1" && (
          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
            {degree}°
          </span>
        )}
        {connected && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-full">
            <Link2 size={8} />
            1st
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 justify-end shrink-0">
        <button
          onClick={() => !inContacts && onAddContact(speaker.id)}
          disabled={inContacts || adding}
          title={inContacts ? "In contacts" : "Add to contacts"}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg transition-colors",
            inContacts
              ? "text-green-700 bg-green-50 border border-green-200 cursor-default"
              : adding
              ? "text-gray-400 bg-gray-50 border border-gray-200 cursor-wait"
              : "text-white bg-blue-600 hover:bg-blue-700 border border-blue-600"
          )}
        >
          {adding ? (
            <Loader2 size={10} className="animate-spin" />
          ) : inContacts ? (
            <UserCheck size={10} />
          ) : (
            <UserPlus size={10} />
          )}
          {inContacts ? "Saved" : adding ? "…" : "Add"}
        </button>
      </div>
    </div>
  )
}

// ─── Speaker photo tile (photos view) ────────────────────────────────────────

function SpeakerPhoto({
  speaker,
  onAddContact,
  adding,
}: {
  speaker: Speaker
  onAddContact: (id: string) => void
  adding: boolean
}) {
  const inContacts = !!speaker.contactId
  const liUrl = resolvedLinkedinUrl(speaker)
  const connected = isConnected(speaker)
  const degree = speaker.contact?.linkedinDegree

  return (
    <div className="group flex flex-col rounded-xl overflow-hidden bg-white border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all">
      {/* Square photo */}
      <div className="aspect-square w-full relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
        {speaker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={speaker.photoUrl}
            alt={`${speaker.firstName} ${speaker.lastName}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-2xl">
            {initials(speaker.firstName, speaker.lastName)}
          </div>
        )}

        {/* LinkedIn status icon overlay — always shown when profile known */}
        {(liUrl || inContacts) && (
          <div className="absolute top-1.5 right-1.5">
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full shadow-sm"
              style={{ background: connected ? "#0A66C2" : inContacts ? "#16a34a" : "#D97706" }}
              title={connected ? "1st-degree connection" : inContacts ? "In contacts" : "Profile found — not connected"}
            >
              {inContacts && !liUrl ? (
                <svg className="text-white" style={{ width: 10, height: 10 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" style={{ width: 11, height: 11, fill: "white" }}>
                  <path d={LI_PATH} />
                </svg>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Name + company */}
      <div className="px-2 py-1.5 flex-1">
        <p className="text-xs font-semibold text-gray-900 truncate leading-tight">
          {speaker.firstName} {speaker.lastName}
        </p>
        {speaker.company && (
          <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{speaker.company}</p>
        )}
      </div>

      {/* Action row — visible on hover */}
      <div className="px-2 pb-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {liUrl ? (
          <a
            href={liUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors"
            title="LinkedIn profile"
          >
            <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: "#0A66C2" }}>
              <path d={LI_PATH} />
            </svg>
          </a>
        ) : (
          <a
            href={linkedinSearchUrl(speaker.firstName, speaker.lastName, speaker.company)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-6 h-6 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors"
            title="Search on LinkedIn"
          >
            <Search size={11} className="text-gray-400" />
          </a>
        )}
        <button
          onClick={() => !inContacts && onAddContact(speaker.id)}
          disabled={inContacts || adding}
          className={cn(
            "ml-auto flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md transition-colors",
            inContacts
              ? "text-green-700 bg-green-50 cursor-default"
              : adding
              ? "text-gray-400 bg-gray-50 cursor-wait"
              : "text-white bg-blue-600 hover:bg-blue-700"
          )}
        >
          {adding ? <Loader2 size={9} className="animate-spin" /> : inContacts ? <UserCheck size={9} /> : <UserPlus size={9} />}
          {inContacts ? "Saved" : adding ? "…" : "Add"}
        </button>
      </div>
    </div>
  )
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({
  value,
  label,
  color,
  active,
  onClick,
}: {
  value: number
  label: string
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors",
        active
          ? `${color} font-semibold`
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      )}
    >
      <span className={cn("text-base font-bold", active ? "" : "text-gray-900")}>{value}</span>
      <span className="text-xs">{label}</span>
    </button>
  )
}

// ─── View toggle ──────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
      <button
        onClick={() => onChange("grid")}
        title="Grid"
        className={cn("px-2.5 py-1.5 transition-colors", view === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor"/>
          <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor"/>
          <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor"/>
          <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor"/>
        </svg>
      </button>
      <button
        onClick={() => onChange("list")}
        title="List"
        className={cn("px-2.5 py-1.5 transition-colors border-l border-gray-200", view === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2" width="12" height="2" rx="1" fill="currentColor"/>
          <rect x="1" y="6" width="12" height="2" rx="1" fill="currentColor"/>
          <rect x="1" y="10" width="12" height="2" rx="1" fill="currentColor"/>
        </svg>
      </button>
      <button
        onClick={() => onChange("photos")}
        title="Photos"
        className={cn("px-2.5 py-1.5 transition-colors border-l border-gray-200", view === "photos" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="3.5" cy="4" r="2.5" fill="currentColor"/>
          <circle cx="10.5" cy="4" r="2.5" fill="currentColor"/>
          <circle cx="3.5" cy="10" r="2.5" fill="currentColor"/>
          <circle cx="10.5" cy="10" r="2.5" fill="currentColor"/>
        </svg>
      </button>
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
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all")
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set())
  const [bulkAdding, setBulkAdding] = useState(false)
  const [topicOpen, setTopicOpen] = useState(false)
  const [view, setView] = useState<ViewMode>("grid")
  const [exportingPdf, setExportingPdf] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/")
  }, [status, router])

  useEffect(() => {
    const saved = localStorage.getItem("eventsView") as ViewMode | null
    if (saved && ["grid", "list", "photos"].includes(saved)) setView(saved)
  }, [])

  useEffect(() => {
    if (!session) return
    fetch("/api/events/speakers?eventSlug=money2020-europe-2026")
      .then((r) => r.json())
      .then((data) => { setSpeakers(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session])

  function handleViewChange(v: ViewMode) {
    setView(v)
    localStorage.setItem("eventsView", v)
  }

  const topics = useMemo(() => {
    const set = new Set<string>()
    for (const s of speakers) if (s.sessionTopic) set.add(s.sessionTopic)
    return Array.from(set).sort()
  }, [speakers])

  const stats = useMemo(() => ({
    total:        speakers.length,
    inContacts:   speakers.filter((s) => !!s.contactId).length,
    notInContacts:speakers.filter((s) => !s.contactId).length,
    withLinkedIn: speakers.filter(hasLinkedIn).length,
    notConnected: speakers.filter(isNotConnected).length,
  }), [speakers])

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
    if (filterTopic) list = list.filter((s) => s.sessionTopic === filterTopic)
    if (filterStatus === "inContacts")    list = list.filter((s) => !!s.contactId)
    if (filterStatus === "notInContacts") list = list.filter((s) => !s.contactId)
    if (filterStatus === "hasLinkedIn")   list = list.filter(hasLinkedIn)
    if (filterStatus === "notConnected")  list = list.filter(isNotConnected)
    return list
  }, [speakers, search, filterTopic, filterStatus])

  function toggleFilter(f: StatusFilter) {
    setFilterStatus((prev) => (prev === f ? "all" : f))
  }

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
          prev.map((s) => s.id === id ? { ...s, contactId: data.contactId } : s)
        )
      }
    } finally {
      setAddingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  async function handleBulkAdd() {
    const ids = filtered.filter((s) => !s.contactId).map((s) => s.id)
    if (!ids.length) return
    setBulkAdding(true)
    try {
      const res = await fetch("/api/events/speakers/bulk-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerIds: ids, labels: ["Money20/20", "M2020 Speakers"] }),
      })
      const data = await res.json()
      if (data.ok) {
        const updated = await fetch("/api/events/speakers?eventSlug=money2020-europe-2026").then((r) => r.json())
        setSpeakers(Array.isArray(updated) ? updated : speakers)
      }
    } finally {
      setBulkAdding(false)
    }
  }

  // ── CSV export (client-side) ──────────────────────────────────────────────
  function handleExportCsv() {
    const cols = ["First Name", "Last Name", "Role", "Company", "Session Topic", "LinkedIn URL", "Status", "In Contacts"]
    const escape = (v: string | null | undefined) => {
      const s = v ?? ""
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }
    const rows = filtered.map((s) => {
      const liUrl = resolvedLinkedinUrl(s)
      const status = isConnected(s) ? "Connected"
        : s.contact?.linkedinDegree === "2" ? "2° degree"
        : s.contact?.linkedinDegree === "3" ? "3° degree"
        : !!s.contactId ? "Saved"
        : "To add"
      return [
        escape(s.firstName),
        escape(s.lastName),
        escape(s.role),
        escape(s.company),
        escape(s.sessionTopic),
        escape(liUrl),
        escape(status),
        s.contactId ? "Yes" : "No",
      ].join(",")
    })
    const csv = [cols.join(","), ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `m2020_speakers_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── PDF export (server-side) ──────────────────────────────────────────────
  async function handleExportPdf() {
    setExportingPdf(true)
    try {
      const subtitle = filtered.length === speakers.length
        ? "All speakers"
        : `${filtered.length} of ${speakers.length} speakers (filtered)`
      const res = await fetch("/api/events/speakers/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventSlug: "money2020-europe-2026",
          eventName: "Money 20/20 Europe 2026",
          subtitle,
          speakerIds: filtered.map((s) => s.id),
        }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `m2020_speakers_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingPdf(false)
    }
  }

  if (status === "loading" || !session) return null

  const unimportedInView = filtered.filter((s) => !s.contactId).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 pt-20 pb-16">

        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Money 20/20 Europe 2026</h1>
          <p className="text-sm text-gray-500 mt-0.5">Amsterdam · June 2–4, 2026</p>
        </div>

        {/* Import instructions when empty */}
        {speakers.length === 0 && !loading && (
          <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Puzzle size={20} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">Import speakers with the Chrome Extension</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Visit the Money 20/20 speakers page with the 6Degrees extension installed — it will import all 421 speakers automatically.
                </p>
                <a
                  href="https://europe.money2020.com/agenda/speakers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Open speakers page <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Clickable stat chips */}
        {speakers.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <StatChip
              value={stats.total}
              label="speakers"
              color="bg-gray-100 border-gray-300 text-gray-700"
              active={filterStatus === "all" && !filterTopic && !search}
              onClick={() => { setFilterStatus("all"); setFilterTopic(""); setSearch("") }}
            />
            <StatChip
              value={stats.inContacts}
              label="in contacts"
              color="bg-green-50 border-green-300 text-green-700"
              active={filterStatus === "inContacts"}
              onClick={() => toggleFilter("inContacts")}
            />
            <StatChip
              value={stats.withLinkedIn}
              label="on LinkedIn"
              color="bg-blue-50 border-blue-300 text-blue-700"
              active={filterStatus === "hasLinkedIn"}
              onClick={() => toggleFilter("hasLinkedIn")}
            />
            <StatChip
              value={stats.notConnected}
              label="not connected"
              color="bg-amber-50 border-amber-300 text-amber-700"
              active={filterStatus === "notConnected"}
              onClick={() => toggleFilter("notConnected")}
            />
            <StatChip
              value={stats.notInContacts}
              label="to add"
              color="bg-purple-50 border-purple-300 text-purple-700"
              active={filterStatus === "notInContacts"}
              onClick={() => toggleFilter("notInContacts")}
            />
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
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
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
                    filterTopic ? "border-blue-400 text-blue-700 bg-blue-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Filter size={13} />
                  {filterTopic ? <span className="max-w-[140px] truncate">{filterTopic}</span> : "Session"}
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
                        <button key={t} onClick={() => { setFilterTopic(t); setTopicOpen(false) }}
                          className={cn("w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 truncate", filterTopic === t ? "text-blue-700 bg-blue-50" : "text-gray-700")}
                        >{t}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Not connected quick filter */}
            {stats.notConnected > 0 && (
              <button
                onClick={() => toggleFilter("notConnected")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors",
                  filterStatus === "notConnected"
                    ? "border-amber-400 bg-amber-50 text-amber-700 font-medium"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                )}
                title="Show speakers with a LinkedIn profile but not yet connected"
              >
                <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: filterStatus === "notConnected" ? "#D97706" : "#9CA3AF" }}>
                  <path d={LI_PATH} />
                </svg>
                Not connected
                <span className={cn(
                  "text-xs font-bold ml-0.5",
                  filterStatus === "notConnected" ? "text-amber-600" : "text-gray-400"
                )}>
                  {stats.notConnected}
                </span>
              </button>
            )}

            {/* Clear filters */}
            {(filterTopic || filterStatus !== "all" || search) && (
              <button
                onClick={() => { setSearch(""); setFilterTopic(""); setFilterStatus("all") }}
                className="flex items-center gap-1 px-2.5 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"
              >
                <X size={12} /> Clear
              </button>
            )}

            <div className="flex-1" />

            {/* Bulk add */}
            {unimportedInView > 0 && (
              <button
                onClick={handleBulkAdd}
                disabled={bulkAdding}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
              >
                {bulkAdding ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                {bulkAdding ? "Adding…" : `Add ${unimportedInView} to contacts`}
              </button>
            )}

            {/* Export */}
            <button
              onClick={handleExportCsv}
              title="Export current view to CSV"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download size={13} />
              CSV
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              title="Export current view to PDF"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              PDF
            </button>

            {/* View toggle */}
            <ViewToggle view={view} onChange={handleViewChange} />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading speakers…</span>
          </div>
        )}

        {/* Empty search state */}
        {!loading && speakers.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            {filterStatus === "notConnected" ? (
              <>
                <Link2Off size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">No speakers with a LinkedIn profile but not yet connected.</p>
                <p className="text-xs mt-1 opacity-70">Visit their LinkedIn profiles with the extension to track them here.</p>
              </>
            ) : (
              <>
                <Search size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">No speakers match your filters.</p>
              </>
            )}
          </div>
        )}

        {/* ── Grid view ── */}
        {!loading && filtered.length > 0 && view === "grid" && (
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

        {/* ── List view ── */}
        {!loading && filtered.length > 0 && view === "list" && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {/* Column headers */}
            <div
              className="hidden sm:grid items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/70 text-xs font-medium text-gray-400 uppercase tracking-wide"
              style={{ gridTemplateColumns: ROW_GRID }}
            >
              <div />
              <div />
              <div>Name</div>
              <div>Company</div>
              <div>Session</div>
              <div>Status</div>
              <div />
            </div>
            {filtered.map((speaker) => (
              <SpeakerRow
                key={speaker.id}
                speaker={speaker}
                onAddContact={handleAddContact}
                adding={addingIds.has(speaker.id)}
              />
            ))}
          </div>
        )}

        {/* ── Photos view ── */}
        {!loading && filtered.length > 0 && view === "photos" && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {filtered.map((speaker) => (
              <SpeakerPhoto
                key={speaker.id}
                speaker={speaker}
                onAddContact={handleAddContact}
                adding={addingIds.has(speaker.id)}
              />
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-6">
            {filtered.length} of {speakers.length} speaker{speakers.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  )
}
