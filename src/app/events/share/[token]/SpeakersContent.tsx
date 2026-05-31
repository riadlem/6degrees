"use client"

import { useState } from "react"
import { Building2, Search, Download, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PublicSpeaker = {
  id:           string
  firstName:    string
  lastName:     string
  role:         string | null
  company:      string | null
  photoUrl:     string | null
  priority:     number | null
  sessionTopic: string | null
  linkedinUrl:  string | null
  linkedinKey:  string | null
}

type ViewMode = "grid" | "list" | "photos"

// ── Priority config ───────────────────────────────────────────────────────────

const PRIO: Record<number, { filled: number; color: string; label: string }> = {
  1: { filled: 4, color: "#F59E0B", label: "Must meet" },
  2: { filled: 3, color: "#3B82F6", label: "Important"  },
  3: { filled: 2, color: "#9CA3AF", label: "Optional"   },
  4: { filled: 1, color: "#EF4444", label: "Skip"       },
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

function resolvedLinkedinUrl(linkedinUrl: string | null, linkedinKey: string | null): string | null {
  if (linkedinUrl) return linkedinUrl
  if (linkedinKey && !linkedinKey.startsWith("m2020-")) return `https://www.linkedin.com/in/${linkedinKey}/`
  return null
}

const LI_PATH = "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"

// ── Read-only priority diamonds ───────────────────────────────────────────────

function ReadOnlyDiamonds({ priority, size = 7 }: { priority: number | null; size?: number }) {
  const cfg = priority !== null ? PRIO[priority] : null
  const filled = cfg?.filled ?? 0
  const color  = cfg?.color  ?? "#9CA3AF"
  return (
    <div className="flex items-center gap-0.5" title={cfg?.label ?? "No priority set"}>
      {[1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 8 8">
          <polygon
            points="4,0 8,4 4,8 0,4"
            fill={i <= filled ? color : "none"}
            stroke={i <= filled ? color : "#D1D5DB"}
            strokeWidth="1.2"
          />
        </svg>
      ))}
    </div>
  )
}

// ── View toggle ───────────────────────────────────────────────────────────────

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

// ── Grid card ─────────────────────────────────────────────────────────────────

function SpeakerCard({ speaker }: { speaker: PublicSpeaker }) {
  const liUrl = resolvedLinkedinUrl(speaker.linkedinUrl, speaker.linkedinKey)
  const cfg   = speaker.priority !== null ? PRIO[speaker.priority] : null
  const p1    = speaker.priority === 1
  const p4    = speaker.priority === 4

  return (
    <div className={cn(
      "bg-white rounded-xl border p-4 flex flex-col gap-2.5",
      p1 ? "border-amber-300 border-t-2" : "border-gray-200",
      p4 && "opacity-50"
    )}>
      <div className="flex items-start gap-3">
        {speaker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={speaker.photoUrl} alt={`${speaker.firstName} ${speaker.lastName}`}
            className="w-11 h-11 rounded-full object-cover shrink-0" loading="lazy" decoding="async" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {initials(speaker.firstName, speaker.lastName)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {speaker.firstName} {speaker.lastName}
          </p>
          {speaker.role && <p className="text-xs text-gray-500 truncate mt-0.5">{speaker.role}</p>}
          {speaker.company && (
            <p className="text-xs text-blue-600 font-medium flex items-center gap-1 truncate mt-0.5">
              <Building2 size={10} className="shrink-0" />{speaker.company}
            </p>
          )}
        </div>

        {liUrl && (
          <a href={liUrl} target="_blank" rel="noopener noreferrer" title="LinkedIn" className="shrink-0">
            <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "#0A66C2" }}>
              <path d={LI_PATH} />
            </svg>
          </a>
        )}
      </div>

      {cfg && (
        <div className="flex items-center gap-1.5">
          <ReadOnlyDiamonds priority={speaker.priority} />
          <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
      )}

      {speaker.sessionTopic && (
        <div className="px-2 py-1 bg-amber-50 border border-amber-100 rounded-lg">
          <p className="text-[10px] text-amber-800 font-medium line-clamp-1">{speaker.sessionTopic}</p>
        </div>
      )}
    </div>
  )
}

// ── List row ──────────────────────────────────────────────────────────────────

const ROW_GRID = "2.5rem 2.25rem 1fr 1fr 7rem 1.5rem"

function SpeakerRow({ speaker }: { speaker: PublicSpeaker }) {
  const liUrl = resolvedLinkedinUrl(speaker.linkedinUrl, speaker.linkedinKey)
  const p4    = speaker.priority === 4

  return (
    <div
      className={cn(
        "grid items-center gap-2 px-3 py-2 text-xs odd:bg-white even:bg-gray-50/60 hover:bg-gray-100 transition-colors",
        p4 && "opacity-50"
      )}
      style={{ gridTemplateColumns: ROW_GRID }}
    >
      {/* Priority */}
      <div className="flex items-center">
        <ReadOnlyDiamonds priority={speaker.priority} size={6} />
      </div>

      {/* Photo */}
      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
        {speaker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={speaker.photoUrl} alt={`${speaker.firstName} ${speaker.lastName}`}
            className="w-8 h-8 rounded-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
            {initials(speaker.firstName, speaker.lastName)}
          </div>
        )}
      </div>

      {/* Name + role */}
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate leading-tight">
          {speaker.firstName} {speaker.lastName}
        </p>
        {speaker.role && <p className="text-xs text-gray-400 truncate leading-tight">{speaker.role}</p>}
      </div>

      {/* Company */}
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{speaker.company ?? ""}</p>
      </div>

      {/* Session */}
      <div className="min-w-0">
        {speaker.sessionTopic && (
          <span className="inline-block max-w-full truncate text-[10px] font-medium px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md">
            {speaker.sessionTopic}
          </span>
        )}
      </div>

      {/* LinkedIn */}
      <div className="flex items-center justify-center">
        {liUrl ? (
          <a href={liUrl} target="_blank" rel="noopener noreferrer" title="LinkedIn">
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: "#0A66C2" }}>
              <path d={LI_PATH} />
            </svg>
          </a>
        ) : (
          <a
            href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${speaker.firstName} ${speaker.lastName} ${speaker.company ?? ""}`.trim())}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Search on LinkedIn"
          >
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: "#D1D5DB" }}>
              <path d={LI_PATH} />
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}

// ── Photo tile ────────────────────────────────────────────────────────────────

function SpeakerPhoto({ speaker }: { speaker: PublicSpeaker }) {
  const liUrl = resolvedLinkedinUrl(speaker.linkedinUrl, speaker.linkedinKey)
  const p4    = speaker.priority === 4
  const cfg   = speaker.priority !== null ? PRIO[speaker.priority] : null

  return (
    <div className={cn(
      "group flex flex-col rounded-xl overflow-hidden bg-white border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all",
      p4 && "opacity-50"
    )}>
      <div className="aspect-square w-full relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
        {speaker.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={speaker.photoUrl} alt={`${speaker.firstName} ${speaker.lastName}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-2xl">
            {initials(speaker.firstName, speaker.lastName)}
          </div>
        )}

        {/* Priority overlay top-left */}
        {cfg && (
          <div className="absolute top-1 left-1">
            <ReadOnlyDiamonds priority={speaker.priority} size={6} />
          </div>
        )}

        {/* LinkedIn overlay top-right */}
        {liUrl && (
          <a
            href={liUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-1.5 right-1.5 flex items-center justify-center w-5 h-5 rounded-full shadow-sm"
            style={{ background: "#0A66C2" }}
            title="LinkedIn"
          >
            <svg viewBox="0 0 24 24" style={{ width: 11, height: 11, fill: "white" }}>
              <path d={LI_PATH} />
            </svg>
          </a>
        )}
      </div>

      <div className="px-2 py-1.5 flex-1">
        <p className="text-xs font-semibold text-gray-900 truncate leading-tight">
          {speaker.firstName} {speaker.lastName}
        </p>
        {speaker.company && (
          <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{speaker.company}</p>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SpeakersContent({
  speakers,
  token,
}: {
  speakers: PublicSpeaker[]
  token: string
}) {
  const [view, setView] = useState<ViewMode>("grid")
  const [pdfDropdownOpen, setPdfDropdownOpen] = useState(false)

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          {speakers.length} speaker{speakers.length !== 1 ? "s" : ""} · sorted by priority
        </p>

        <div className="flex items-center gap-2">
          {/* PDF download dropdown */}
          <div className="relative">
            <button
              onClick={() => setPdfDropdownOpen(!pdfDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download size={13} />
              PDF
              <ChevronDown size={11} className="text-gray-400" />
            </button>
            {pdfDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPdfDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  <div className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">PDF layout</div>
                  {([
                    { key: "cards", label: "Cards with photos", icon: "⊞" },
                    { key: "grid",  label: "Photo grid",        icon: "⊟" },
                    { key: "list",  label: "Compact list",      icon: "≡" },
                  ] as const).map(({ key, label, icon }) => (
                    <a
                      key={key}
                      href={`/api/events/share/${token}/pdf?layout=${key}`}
                      download
                      onClick={() => setPdfDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-base leading-none text-gray-400">{icon}</span>
                      {label}
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>

          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {/* Grid view */}
      {view === "grid" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {speakers.map((s) => <SpeakerCard key={s.id} speaker={s} />)}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Column headers */}
          <div
            className="hidden sm:grid items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/70 text-xs font-medium text-gray-400 uppercase tracking-wide"
            style={{ gridTemplateColumns: ROW_GRID }}
          >
            <div title="Priority" />
            <div />
            <div>Name</div>
            <div>Company</div>
            <div>Session</div>
            <div />
          </div>
          {speakers.map((s) => <SpeakerRow key={s.id} speaker={s} />)}
        </div>
      )}

      {/* Photos view */}
      {view === "photos" && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {speakers.map((s) => <SpeakerPhoto key={s.id} speaker={s} />)}
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-xs text-gray-400 mt-8">
        Shared via{" "}
        <a href="/" className="text-blue-500 hover:underline">6Degrees</a>
      </p>
    </div>
  )
}
