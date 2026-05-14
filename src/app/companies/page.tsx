"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Star, Users, ChevronDown, ChevronUp, Search, X, EyeOff, Handshake, Pencil, Check, AlertTriangle } from "lucide-react"
import { cn, initials } from "@/lib/utils"
import { isSuspicious } from "@/lib/company-utils"
import ContactRow from "@/components/ContactRow"
import ContactDetail from "@/components/ContactDetail"
import AddToListModal from "@/components/AddToListModal"
import { type ContactSummary } from "@/components/ContactCard"

export type CompanySize = "small" | "medium" | "corporate" | "fortune500"
export type CompanyType = "brand" | "non-brand" | "independent"

const SIZE_OPTIONS: { value: CompanySize; label: string; short: string }[] = [
  { value: "small",      label: "Small",       short: "S"    },
  { value: "medium",     label: "Medium",      short: "M"    },
  { value: "corporate",  label: "Corporate",   short: "Corp" },
  { value: "fortune500", label: "Fortune 500", short: "F500" },
]

const SIZE_COLORS: Record<string, string> = {
  small:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium:     "bg-sky-50 text-sky-700 border-sky-200",
  corporate:  "bg-violet-50 text-violet-700 border-violet-200",
  fortune500: "bg-amber-50 text-amber-700 border-amber-200",
  untagged:   "bg-gray-100 text-gray-600 border-gray-300",
}

const TYPE_OPTIONS: { value: CompanyType; label: string; color: string }[] = [
  { value: "brand",       label: "Brand",     color: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "non-brand",   label: "Non-brand", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "independent", label: "Indep.",    color: "bg-amber-50 text-amber-700 border-amber-200" },
]

export type Company = {
  name: string
  count: number
  preferred: boolean
  ignored: boolean
  isPartner: boolean
  size: CompanySize | null
  type: CompanyType | null
  parentCompany: string | null
  industry: string | null
  photos: string[]
}

function AvatarStack({ photos, name, count }: { photos: string[]; name: string; count: number }) {
  const inits = initials(name.split(" ")[0] ?? name, name.split(" ")[1] ?? "")
  if (photos.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-semibold shrink-0">
          {inits}
        </div>
        <span className="text-xs text-gray-500">{count} contact{count !== 1 ? "s" : ""}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {photos.slice(0, 4).map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={url} alt="" className="w-7 h-7 rounded-full border-2 border-white object-cover" />
        ))}
      </div>
      <span className="text-xs text-gray-500">{count} contact{count !== 1 ? "s" : ""}</span>
    </div>
  )
}

function SizeChips({
  value,
  onChange,
}: {
  value: CompanySize | null
  onChange: (size: CompanySize | null) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {SIZE_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={(e) => { e.stopPropagation(); onChange(active ? null : opt.value) }}
            title={opt.label}
            className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors",
              active ? SIZE_COLORS[opt.value] : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
            )}
          >
            {opt.short}
          </button>
        )
      })}
    </div>
  )
}

function TypeChips({
  value,
  onChange,
}: {
  value: CompanyType | null
  onChange: (type: CompanyType | null) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {TYPE_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={(e) => { e.stopPropagation(); onChange(active ? null : opt.value) }}
            title={opt.label}
            className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors",
              active ? opt.color : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function CompanyRow({
  company,
  allCompanyNames,
  onSetStatus,
  onSetSize,
  onSetPartner,
  onSetType,
  onSetParent,
  onRename,
  onContactClick,
  onAddToList,
}: {
  company: Company
  allCompanyNames: string[]
  onSetStatus: (name: string, status: "preferred" | "ignored" | "none") => void
  onSetSize: (name: string, size: CompanySize | null) => void
  onSetPartner: (name: string, isPartner: boolean) => void
  onSetType: (name: string, type: CompanyType | null) => void
  onSetParent: (name: string, parent: string | null) => void
  onRename: (oldName: string, newName: string) => void
  onContactClick: (id: string) => void
  onAddToList: (contacts: ContactSummary[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [contacts, setContacts] = useState<ContactSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [editingParent, setEditingParent] = useState(false)
  const [parentValue, setParentValue] = useState("")

  async function expand() {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (contacts !== null) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ company: company.name, limit: "200", page: "1", sort: "name", q: "", industry: "", location: "", position: "", label: "" })
      const res = await fetch(`/api/contacts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.contacts)
      }
    } finally {
      setLoading(false)
    }
  }

  function startRename(e: React.MouseEvent) {
    e.stopPropagation()
    setRenameValue(company.name)
    setRenaming(true)
  }
  function commitRename(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation()
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== company.name) onRename(company.name, trimmed)
    setRenaming(false)
  }
  function cancelRename(e: React.MouseEvent) {
    e.stopPropagation()
    setRenaming(false)
  }

  function startEditParent(e: React.MouseEvent) {
    e.stopPropagation()
    setParentValue(company.parentCompany ?? "")
    setEditingParent(true)
  }
  function commitParent(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation()
    const trimmed = parentValue.trim()
    onSetParent(company.name, trimmed || null)
    setEditingParent(false)
  }
  function cancelParent(e: React.MouseEvent) {
    e.stopPropagation()
    setEditingParent(false)
  }

  const filteredParentSuggestions = parentValue.trim().length > 0
    ? allCompanyNames.filter((n) => n.toLowerCase().includes(parentValue.toLowerCase()) && n !== company.name).slice(0, 6)
    : []

  const starStatus = company.preferred ? "none" : "preferred"
  const ignoreStatus = company.ignored ? "none" : "ignored"
  const typeLabel = company.type ? TYPE_OPTIONS.find((o) => o.value === company.type) : null

  return (
    <div className={cn(
      "border rounded-xl overflow-hidden transition-colors",
      company.preferred && company.isPartner ? "border-blue-300 bg-blue-50/20" :
      company.isPartner  ? "border-blue-200 bg-blue-50/10" :
      company.preferred  ? "border-amber-300 bg-amber-50/30" :
      company.ignored    ? "border-gray-200 bg-gray-50/50 opacity-60" :
                           "border-gray-200 bg-white"
    )}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={expand}
      >
        {/* Star */}
        <button
          onClick={(e) => { e.stopPropagation(); onSetStatus(company.name, starStatus) }}
          className={cn("shrink-0 transition-colors", company.preferred ? "text-amber-400 hover:text-amber-500" : "text-gray-300 hover:text-amber-400")}
          title={company.preferred ? "Remove preferred" : "Mark preferred"}
        >
          <Star size={15} fill={company.preferred ? "currentColor" : "none"} />
        </button>

        {/* Partner toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onSetPartner(company.name, !company.isPartner) }}
          className={cn("shrink-0 transition-colors", company.isPartner ? "text-blue-500 hover:text-blue-600" : "text-gray-200 hover:text-blue-400")}
          title={company.isPartner ? "Remove partner" : "Mark as partner"}
        >
          <Handshake size={15} />
        </button>

        {/* Name + industry */}
        <div className="flex-1 min-w-0 group/name" onClick={renaming ? (e) => e.stopPropagation() : undefined}>
          {renaming ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitRename(e); if (e.key === "Escape") cancelRename(e as unknown as React.MouseEvent) }}
                className="flex-1 text-sm font-semibold border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0 bg-white"
              />
              <button onClick={commitRename} className="text-green-500 hover:text-green-600 shrink-0"><Check size={14} /></button>
              <button onClick={cancelRename} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={14} /></button>
            </div>
          ) : (
            <>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-semibold text-gray-900 text-sm truncate">{company.name}</p>
              <button
                onClick={startRename}
                title="Rename company"
                className="opacity-0 group-hover/name:opacity-100 text-gray-300 hover:text-gray-500 transition-opacity shrink-0"
              >
                <Pencil size={11} />
              </button>
              {!company.parentCompany && (
                <button
                  onClick={startEditParent}
                  title="Set parent company"
                  className="opacity-0 group-hover/name:opacity-100 text-gray-300 hover:text-indigo-400 transition-opacity shrink-0 text-[10px] font-medium"
                >
                  ↳
                </button>
              )}
              {company.isPartner && (
                <span className="text-[10px] font-medium text-blue-600 bg-blue-100 rounded-full px-1.5 py-0.5 shrink-0">partner</span>
              )}
              {company.preferred && !company.isPartner && (
                <span className="text-[10px] font-medium text-amber-600 bg-amber-100 rounded-full px-1.5 py-0.5 shrink-0">preferred</span>
              )}
              {company.ignored && (
                <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 shrink-0">ignored</span>
              )}
              {company.size && (
                <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 border shrink-0", SIZE_COLORS[company.size])}>
                  {SIZE_OPTIONS.find((o) => o.value === company.size)?.label}
                </span>
              )}
              {typeLabel && (
                <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 border shrink-0", typeLabel.color)}>
                  {typeLabel.label}
                </span>
              )}
              {/* Parent company badge */}
              {company.parentCompany && !editingParent && (
                <button
                  onClick={startEditParent}
                  title="Change parent company"
                  className="text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5 border border-indigo-200 shrink-0 hover:bg-indigo-100 transition-colors"
                >
                  ↳ {company.parentCompany}
                </button>
              )}
            </div>
            {/* Parent edit inline input */}
            {editingParent && (
              <div className="relative mt-1" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={parentValue}
                    onChange={(e) => setParentValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitParent(e)
                      if (e.key === "Escape") cancelParent(e as unknown as React.MouseEvent)
                    }}
                    placeholder="Parent company name…"
                    className="flex-1 text-xs border border-indigo-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white min-w-0"
                  />
                  <button onClick={commitParent} className="text-green-500 hover:text-green-600 shrink-0"><Check size={12} /></button>
                  <button onClick={cancelParent} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={12} /></button>
                  {company.parentCompany && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSetParent(company.name, null); setEditingParent(false) }}
                      title="Remove parent"
                      className="text-red-400 hover:text-red-600 shrink-0 text-[10px]"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {filteredParentSuggestions.length > 0 && (
                  <div className="absolute z-20 top-full left-0 mt-0.5 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-40 overflow-y-auto">
                    {filteredParentSuggestions.map((name) => (
                      <button
                        key={name}
                        onClick={(e) => { e.stopPropagation(); onSetParent(company.name, name); setEditingParent(false) }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 truncate"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            </>
          )}
          {!renaming && !editingParent && company.industry && (
            <p className="text-xs text-gray-400 truncate">{company.industry}</p>
          )}
        </div>

        {/* Size + type chips — hidden on mobile */}
        <div className="hidden sm:flex flex-col gap-1 shrink-0 items-end" onClick={(e) => e.stopPropagation()}>
          <SizeChips value={company.size} onChange={(size) => onSetSize(company.name, size)} />
          <TypeChips value={company.type} onChange={(type) => onSetType(company.name, type)} />
        </div>

        {/* Avatar stack */}
        <div className="hidden md:block shrink-0">
          <AvatarStack photos={company.photos} name={company.name} count={company.count} />
        </div>

        {/* Count (mobile) */}
        <div className="shrink-0 text-gray-400 md:hidden">
          <span className="text-xs text-gray-500 mr-0.5">{company.count}</span>
          <Users size={13} className="inline" />
        </div>

        {/* Ignore */}
        <button
          onClick={(e) => { e.stopPropagation(); onSetStatus(company.name, ignoreStatus) }}
          className={cn("shrink-0 transition-colors", company.ignored ? "text-gray-400 hover:text-gray-600" : "text-gray-200 hover:text-gray-400")}
          title={company.ignored ? "Unignore" : "Ignore"}
        >
          <EyeOff size={14} />
        </button>

        <div className="shrink-0 text-gray-400">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Mobile size + type chips row */}
      <div className="sm:hidden px-3 pb-2 -mt-1 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">Size:</span>
          <SizeChips value={company.size} onChange={(size) => onSetSize(company.name, size)} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">Type:</span>
          <TypeChips value={company.type} onChange={(type) => onSetType(company.name, type)} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {loading ? (
            <div className="py-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : contacts && contacts.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {contacts.map((c) => (
                <ContactRow
                  key={c.id}
                  contact={c}
                  onClick={(c) => onContactClick(c.id)}
                  onAddToList={(c) => onAddToList([c])}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No contacts found</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function CompaniesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [sizeFilters, setSizeFilters] = useState<Set<string>>(new Set())
  const [showIgnored, setShowIgnored] = useState(false)
  const [showReview, setShowReview] = useState(true)
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  const [addToListContacts, setAddToListContacts] = useState<ContactSummary[] | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/companies")
      if (res.ok) {
        const data = await res.json()
        setCompanies(data.companies)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === "authenticated") load()
  }, [status, load])

  async function setStatus(name: string, newStatus: "preferred" | "ignored" | "none") {
    setCompanies((prev) => sortCompanies(prev.map((c) =>
      c.name !== name ? c : { ...c, preferred: newStatus === "preferred", ignored: newStatus === "ignored" }
    )))
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: name, status: newStatus }),
    })
    if (!res.ok) load()
  }

  async function setSize(name: string, size: CompanySize | null) {
    setCompanies((prev) => prev.map((c) => c.name !== name ? c : { ...c, size }))
    await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: name, size }),
    })
  }

  async function setPartner(name: string, isPartner: boolean) {
    setCompanies((prev) => sortCompanies(prev.map((c) => c.name !== name ? c : { ...c, isPartner })))
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: name, isPartner }),
    })
    if (!res.ok) load()
  }

  async function setType(name: string, type: CompanyType | null) {
    setCompanies((prev) => prev.map((c) => c.name !== name ? c : { ...c, type }))
    await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: name, type }),
    })
  }

  async function setParent(name: string, parentCompany: string | null) {
    setCompanies((prev) => prev.map((c) => c.name !== name ? c : { ...c, parentCompany }))
    await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: name, parentCompany }),
    })
  }

  const [autoTagging, setAutoTagging] = useState(false)
  const [autoTagResult, setAutoTagResult] = useState<number | null>(null)

  async function autoTag() {
    setAutoTagging(true)
    setAutoTagResult(null)
    try {
      const res = await fetch("/api/companies/auto-tag", { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        setAutoTagResult(data.tagged)
        if (data.tagged > 0) load()
      }
    } finally {
      setAutoTagging(false)
      setTimeout(() => setAutoTagResult(null), 5000)
    }
  }

  async function renameCompany(oldName: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    setCompanies((prev) => {
      const existing = prev.find((c) => c.name.toLowerCase() === trimmed.toLowerCase() && c.name !== oldName)
      const old = prev.find((c) => c.name === oldName)
      if (!old) return prev
      if (existing) {
        return sortCompanies(
          prev.filter((c) => c.name !== oldName)
              .map((c) => c.name === existing.name ? { ...c, count: c.count + old.count } : c)
        )
      }
      return sortCompanies(prev.map((c) => c.name === oldName ? { ...c, name: trimmed } : c))
    })
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: oldName, newName: trimmed }),
    })
    if (!res.ok) load()
  }

  function toggleSizeFilter(val: string) {
    setSizeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(val)) next.delete(val)
      else next.add(val)
      return next
    })
  }

  const textMatch = (c: Company) =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.industry?.toLowerCase().includes(q.toLowerCase())

  const sizeMatch = (c: Company) => {
    if (sizeFilters.size === 0) return true
    if (sizeFilters.has("untagged") && c.size === null) return true
    return c.size !== null && sizeFilters.has(c.size)
  }

  const preferred  = companies.filter((c) => c.preferred && !c.ignored && !isSuspicious(c.name) && textMatch(c) && sizeMatch(c))
  const partners   = companies.filter((c) => c.isPartner && !c.preferred && !c.ignored && !isSuspicious(c.name) && textMatch(c) && sizeMatch(c))
  const neutral    = companies.filter((c) => !c.preferred && !c.isPartner && !c.ignored && !isSuspicious(c.name) && textMatch(c) && sizeMatch(c))
  const ignored    = companies.filter((c) => c.ignored && textMatch(c) && sizeMatch(c))
  const suspicious = companies.filter((c) => !c.ignored && isSuspicious(c.name) && textMatch(c) && sizeMatch(c))

  const visibleCount = preferred.length + partners.length + neutral.length

  const allSizeOptions = [
    ...SIZE_OPTIONS,
    { value: "untagged", label: "Untagged", short: "?" },
  ]

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-sm text-gray-500 mt-1">
            {session?.user?.name}&apos;s network — {companies.filter((c) => !c.ignored).length} companies
            {ignored.length > 0 && <span className="ml-1 text-gray-400">({ignored.length} ignored)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={autoTag}
            disabled={autoTagging}
            title="Auto-detect subsidiaries for LVMH, Kering, BNP Paribas, big tech, etc."
            className="text-xs font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {autoTagging ? "Detecting…" : "Auto-detect subsidiaries"}
          </button>
          {autoTagResult !== null && (
            <span className="text-xs text-indigo-600">
              {autoTagResult > 0 ? `↳ ${autoTagResult} tagged` : "None found"}
            </span>
          )}
        </div>
      </div>

      {/* Search + size filter */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search companies or industries…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Multi-select size filter chips — includes Untagged */}
        <div className="flex items-center gap-1 shrink-0">
          {allSizeOptions.map((opt) => {
            const active = sizeFilters.has(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleSizeFilter(opt.value)}
                title={opt.label}
                className={cn(
                  "text-xs font-semibold px-2.5 py-2 rounded-lg border transition-colors",
                  active ? SIZE_COLORS[opt.value] : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
                )}
              >
                {opt.short}
              </button>
            )
          })}
          {sizeFilters.size > 0 && (
            <button onClick={() => setSizeFilters(new Set())} className="text-gray-400 hover:text-gray-600 ml-1" title="Clear size filter">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          No companies yet — sync your LinkedIn contacts first.
        </div>
      ) : visibleCount === 0 && !showIgnored && suspicious.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">No companies match your filters.</div>
      ) : (
        <div className="space-y-3">
          {/* Needs review — suspicious placeholder company names */}
          {suspicious.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowReview((v) => !v)}
                className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5 hover:text-amber-700 transition-colors"
              >
                <AlertTriangle size={11} />
                Needs review ({suspicious.length})
                {showReview ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showReview && suspicious.map((c) => (
                <div key={c.name} className="border-l-2 border-amber-400 pl-1">
                  <CompanyRow company={c} allCompanyNames={companies.map((c) => c.name)} onSetStatus={setStatus} onSetSize={setSize} onSetPartner={setPartner} onSetType={setType} onSetParent={setParent} onRename={renameCompany} onContactClick={setActiveContactId} onAddToList={setAddToListContacts} />
                </div>
              ))}
            </div>
          )}

          {/* Preferred */}
          {preferred.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
                <Star size={11} fill="currentColor" /> Preferred
              </p>
              {preferred.map((c) => (
                <CompanyRow key={c.name} company={c} allCompanyNames={companies.map((c) => c.name)} onSetStatus={setStatus} onSetSize={setSize} onSetPartner={setPartner} onSetType={setType} onSetParent={setParent} onRename={renameCompany} onContactClick={setActiveContactId} onAddToList={setAddToListContacts} />
              ))}
            </div>
          )}

          {/* Partners (not preferred) */}
          {partners.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide flex items-center gap-1.5">
                <Handshake size={11} /> Partners
              </p>
              {partners.map((c) => (
                <CompanyRow key={c.name} company={c} allCompanyNames={companies.map((c) => c.name)} onSetStatus={setStatus} onSetSize={setSize} onSetPartner={setPartner} onSetType={setType} onSetParent={setParent} onRename={renameCompany} onContactClick={setActiveContactId} onAddToList={setAddToListContacts} />
              ))}
            </div>
          )}

          {/* Neutral */}
          {neutral.length > 0 && (
            <div className="space-y-2">
              {(preferred.length > 0 || partners.length > 0) && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4">All companies</p>
              )}
              {neutral.map((c) => (
                <CompanyRow key={c.name} company={c} allCompanyNames={companies.map((c) => c.name)} onSetStatus={setStatus} onSetSize={setSize} onSetPartner={setPartner} onSetType={setType} onSetParent={setParent} onRename={renameCompany} onContactClick={setActiveContactId} onAddToList={setAddToListContacts} />
              ))}
            </div>
          )}

          {/* Ignored */}
          {ignored.length > 0 && (
            <div className="space-y-2 mt-6">
              <button
                onClick={() => setShowIgnored((v) => !v)}
                className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 hover:text-gray-500 transition-colors"
              >
                <EyeOff size={11} />
                Ignored ({ignored.length})
                {showIgnored ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showIgnored && ignored.map((c) => (
                <CompanyRow key={c.name} company={c} allCompanyNames={companies.map((c) => c.name)} onSetStatus={setStatus} onSetSize={setSize} onSetPartner={setPartner} onSetType={setType} onSetParent={setParent} onRename={renameCompany} onContactClick={setActiveContactId} onAddToList={setAddToListContacts} />
              ))}
            </div>
          )}
        </div>
      )}

      <ContactDetail contactId={activeContactId} onClose={() => setActiveContactId(null)} />
      {addToListContacts && (
        <AddToListModal
          contacts={addToListContacts}
          onClose={() => setAddToListContacts(null)}
          onDone={() => { setAddToListContacts(null) }}
        />
      )}
    </div>
  )
}

function sortCompanies(list: Company[]): Company[] {
  return [...list].sort((a, b) => {
    if (a.ignored !== b.ignored) return a.ignored ? 1 : -1
    const aScore = (a.isPartner ? 2 : 0) + (a.preferred ? 1 : 0)
    const bScore = (b.isPartner ? 2 : 0) + (b.preferred ? 1 : 0)
    if (aScore !== bScore) return bScore - aScore
    return b.count - a.count
  })
}
