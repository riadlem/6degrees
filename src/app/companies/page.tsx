"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { STALE } from "@/lib/query-client"
import Link from "next/link"
import { Star, Users, Search, X, EyeOff, Handshake, Pencil, Check, AlertTriangle, Sparkles, Globe, LayoutGrid, AlignJustify, BarChart2, ChevronDown, ChevronUp } from "lucide-react"
import CompanyTreemap from "@/components/CompanyTreemap"
import CompanyLogo, { companyNameToDomain } from "@/components/CompanyLogo"
import { cn } from "@/lib/utils"
import { isSuspicious } from "@/lib/company-utils"

export type CompanySize = "small" | "medium" | "corporate" | "fortune500"
export type CompanyType = "brand" | "non-brand" | "independent"

type TypeSuggestion = { company: string; type: "brand" | "non-brand"; reason: string; confidence: "high" | "medium"; count: number }

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
  industryConfirmed: boolean
  country: string | null
  photos: string[]
}

// Standard industry categories for the dropdown
const INDUSTRY_CATEGORIES = [
  "Accounting",
  "Aerospace & Defense",
  "Agriculture",
  "Consulting",
  "Construction & Engineering",
  "Education",
  "Energy",
  "Financial Services",
  "Food & Beverages",
  "Healthcare & Pharma",
  "Hospitality & Tourism",
  "Human Resources",
  "Legal",
  "Logistics & Transport",
  "Manufacturing",
  "Marketing & Advertising",
  "Media & Entertainment",
  "Non-Profit",
  "Public Sector",
  "Real Estate",
  "Retail & Luxury",
  "Technology",
  "Telecommunications",
  "Other",
]

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

function IndustryCell({
  company,
  pendingSuggestion,
  onConfirm,
  onDismiss,
  onSave,
}: {
  company: Company
  pendingSuggestion: string | null
  onConfirm: (industry: string) => void
  onDismiss: () => void
  onSave: (industry: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")

  function startEdit(e: React.MouseEvent, initial: string) {
    e.stopPropagation()
    setValue(initial)
    setEditing(true)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
        <select
          autoFocus
          value={value}
          onChange={(e) => { setValue(e.target.value); onSave(e.target.value || null); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false) }}
          className="text-xs border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white max-w-[180px]"
        >
          <option value="">— clear —</option>
          {INDUSTRY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={(e) => { e.stopPropagation(); setEditing(false) }} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={12} /></button>
      </div>
    )
  }

  // Pending suggestion (not yet confirmed)
  if (pendingSuggestion && !company.industryConfirmed) {
    return (
      <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 font-medium truncate max-w-[120px]" title={pendingSuggestion}>
          {pendingSuggestion}
        </span>
        <button onClick={(e) => { e.stopPropagation(); onConfirm(pendingSuggestion) }} title="Confirm" className="text-green-500 hover:text-green-600 shrink-0"><Check size={11} /></button>
        <button onClick={(e) => { e.stopPropagation(); startEdit(e, pendingSuggestion) }} title="Change" className="text-gray-400 hover:text-blue-500 shrink-0"><Pencil size={10} /></button>
        <button onClick={(e) => { e.stopPropagation(); onDismiss() }} title="Skip" className="text-gray-300 hover:text-gray-500 shrink-0"><X size={11} /></button>
      </div>
    )
  }

  // Confirmed or derived industry
  if (company.industry) {
    return (
      <div className="flex items-center gap-1 group/ind" onClick={(e) => e.stopPropagation()}>
        <p className={cn("text-xs truncate", company.industryConfirmed ? "text-gray-500" : "text-gray-400")}>{company.industry}</p>
        <button
          onClick={(e) => startEdit(e, company.industry ?? "")}
          className="text-gray-300 hover:text-gray-500 md:opacity-0 md:group-hover/ind:opacity-100 transition-opacity shrink-0"
          title="Edit industry"
        >
          <Pencil size={10} />
        </button>
      </div>
    )
  }

  return null
}

function CompanyRow({
  company,
  allCompanyNames,
  pendingSuggestion,
  onSetStatus,
  onSetSize,
  onSetPartner,
  onSetType,
  onSetParent,
  onSetIndustry,
  onDismissSuggestion,
  onRename,
}: {
  company: Company
  allCompanyNames: string[]
  pendingSuggestion: string | null
  onSetStatus: (name: string, status: "preferred" | "ignored" | "none") => void
  onSetSize: (name: string, size: CompanySize | null) => void
  onSetPartner: (name: string, isPartner: boolean) => void
  onSetType: (name: string, type: CompanyType | null) => void
  onSetParent: (name: string, parent: string | null) => void
  onSetIndustry: (name: string, industry: string | null) => void
  onDismissSuggestion: (name: string) => void
  onRename: (oldName: string, newName: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [editingParent, setEditingParent] = useState(false)
  const [parentValue, setParentValue] = useState("")

  function startRename(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
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
    e.preventDefault()
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
  const domain = companyNameToDomain(company.name)

  // Left border color based on status
  const borderLeftColor =
    company.isPartner  ? "border-l-blue-400" :
    company.preferred  ? "border-l-amber-400" :
    company.ignored    ? "border-l-gray-300" :
                         "border-l-transparent"

  return (
    <div className={cn(
      "group border-l-4 border rounded-xl overflow-visible transition-colors",
      borderLeftColor,
      company.ignored
        ? "border-gray-200 bg-gray-50/50 opacity-60"
        : "border-gray-200 bg-white hover:border-gray-300"
    )}>
      <div className="flex items-center gap-3 px-3 py-2.5">

        {/* Company logo — click opens detail page */}
        <Link
          href={`/companies/${encodeURIComponent(company.name)}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          <CompanyLogo domain={domain} name={company.name} size={36} radius="rounded-lg" />
        </Link>

        {/* Main content */}
        <div className="flex-1 min-w-0 group/name">
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
              {/* First line: name · type badge · category · count */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Link
                  href={`/companies/${encodeURIComponent(company.name)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-gray-900 text-sm hover:text-blue-600 transition-colors truncate"
                >
                  {company.name}
                </Link>
                <button
                  onClick={startRename}
                  title="Rename"
                  className="text-gray-300 hover:text-gray-500 md:opacity-0 md:group-hover/name:opacity-100 transition-opacity shrink-0"
                >
                  <Pencil size={11} />
                </button>

                {/* Brand / Non-brand / Indep badge */}
                {typeLabel && (
                  <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 border shrink-0", typeLabel.color)}>
                    {typeLabel.label}
                  </span>
                )}

                {/* Industry / category */}
                {company.industry && (
                  <span className="text-[10px] text-gray-400 shrink-0 hidden sm:inline">{company.industry}</span>
                )}

                {/* Contact count */}
                <span className="text-[10px] text-gray-500 shrink-0 flex items-center gap-0.5">
                  <Users size={10} />
                  {company.count}
                </span>

                {/* Parent badge */}
                {company.parentCompany && !editingParent && (
                  <button
                    onClick={startEditParent}
                    title="Change parent company"
                    className="text-[10px] font-medium text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5 border border-indigo-200 shrink-0 hover:bg-indigo-100 transition-colors hidden sm:inline-flex"
                  >
                    ↳ {company.parentCompany}
                  </button>
                )}
                {!company.parentCompany && !editingParent && (
                  <button
                    onClick={startEditParent}
                    title="Set parent company"
                    className="text-gray-300 hover:text-indigo-400 md:opacity-0 md:group-hover/name:opacity-100 transition-opacity shrink-0 text-[10px] font-medium hidden sm:inline"
                  >
                    ↳
                  </button>
                )}

                {/* Size chip if set */}
                {company.size && (
                  <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 border shrink-0", SIZE_COLORS[company.size])}>
                    {SIZE_OPTIONS.find((o) => o.value === company.size)?.short}
                  </span>
                )}
              </div>

              {/* Parent edit input */}
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

              {/* Second line: industry cell */}
              {!renaming && !editingParent && (
                <IndustryCell
                  company={company}
                  pendingSuggestion={pendingSuggestion}
                  onConfirm={(ind) => onSetIndustry(company.name, ind)}
                  onDismiss={() => onDismissSuggestion(company.name)}
                  onSave={(ind) => onSetIndustry(company.name, ind)}
                />
              )}
            </>
          )}
        </div>

        {/* Right: size+type chips (desktop hover) + action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Size + type chips — desktop only, shown on row hover */}
          <div
            className="hidden sm:flex flex-col gap-1 mr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <SizeChips value={company.size} onChange={(size) => onSetSize(company.name, size)} />
            <TypeChips value={company.type} onChange={(type) => onSetType(company.name, type)} />
          </div>

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

          {/* Ignore */}
          <button
            onClick={(e) => { e.stopPropagation(); onSetStatus(company.name, ignoreStatus) }}
            className={cn("shrink-0 transition-colors", company.ignored ? "text-gray-400 hover:text-gray-600" : "text-gray-200 hover:text-gray-400")}
            title={company.ignored ? "Unignore" : "Ignore"}
          >
            <EyeOff size={14} />
          </button>
        </div>
      </div>

      {/* Mobile: size + type chips */}
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
    </div>
  )
}

/** Icon-mode card: logo + name + type badge + contact count */
function CompanyIconCard({ company }: { company: Company }) {
  const typeLabel = company.type ? TYPE_OPTIONS.find((o) => o.value === company.type) : null
  const domain = companyNameToDomain(company.name)

  // Top border color by status
  const topBorderClass =
    company.isPartner  ? "border-t-4 border-t-blue-400" :
    company.preferred  ? "border-t-4 border-t-amber-400" :
                         ""

  return (
    <Link
      href={`/companies/${encodeURIComponent(company.name)}`}
      className={cn(
        "flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-200 bg-white hover:border-blue-200 hover:shadow-sm transition-all text-center",
        topBorderClass,
        company.ignored && "opacity-50"
      )}
    >
      <CompanyLogo domain={domain} name={company.name} size={48} radius="rounded-xl" />
      <div className="w-full min-w-0">
        <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{company.name}</p>
        {typeLabel && (
          <span className={cn("text-[9px] font-medium rounded-full px-1.5 py-0.5 border inline-block mt-0.5", typeLabel.color)}>
            {typeLabel.label}
          </span>
        )}
        <p className="text-[10px] text-gray-400 mt-0.5 flex items-center justify-center gap-0.5">
          <Users size={9} />
          {company.count}
        </p>
      </div>
    </Link>
  )
}

function CompaniesContent() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const queryClient = useQueryClient()
  const userId = session?.user?.id

  // Cached companies fetch — serves instantly on re-navigation
  const { data: companiesData, isLoading: companiesLoading } = useQuery<{ companies: Company[] }>({
    queryKey: ["companies", userId],
    queryFn: () => fetch("/api/companies").then((r) => r.json()),
    enabled: status === "authenticated",
    staleTime: STALE.companies,
  })

  // Local state mirrors query data and supports optimistic updates
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)

  // Sync local state whenever React Query returns fresh data
  useEffect(() => {
    if (companiesData?.companies) {
      setCompanies(companiesData.companies)
      setLoading(false)
    }
  }, [companiesData])

  // Mirror React Query loading state
  useEffect(() => {
    if (companiesLoading) setLoading(true)
  }, [companiesLoading])

  const [view, setView] = useState<"list" | "icon" | "treemap">("list")
  const [q, setQ] = useState("")
  const [sizeFilters, setSizeFilters] = useState<Set<string>>(new Set())
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set())
  const [partnerFilter, setPartnerFilter] = useState<"" | "partner" | "non-partner">("")
  const [industryFilter, setIndustryFilter] = useState("")
  const [showIgnored, setShowIgnored] = useState(false)
  const [showReview, setShowReview] = useState(true)

  // industry suggestions: map company name → suggested industry
  const [suggestions, setSuggestions] = useState<Map<string, string>>(new Map())
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())
  const [suggesting, setSuggesting] = useState(false)

  // type suggestions: list of { company, type, reason, confidence, count }
  const [typeSuggestions, setTypeSuggestions] = useState<TypeSuggestion[]>([])
  const [dismissedTypeSuggestions, setDismissedTypeSuggestions] = useState<Set<string>>(new Set())
  const [suggestingTypes, setSuggestingTypes] = useState(false)
  const [showTypeSuggestions, setShowTypeSuggestions] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const searchParams = useSearchParams()

  // Restore view from URL on mount
  useEffect(() => {
    const v = searchParams.get("view")
    if (v === "icon" || v === "treemap") setView(v)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Invalidates the React Query cache, triggering a fresh companies fetch. */
  const load = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["companies", userId] })
  }, [queryClient, userId])

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

  async function setIndustry(name: string, industry: string | null) {
    setCompanies((prev) => prev.map((c) => c.name !== name ? c : { ...c, industry, industryConfirmed: !!industry }))
    setSuggestions((prev) => { const m = new Map(prev); m.delete(name); return m })
    await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: name, industry }),
    })
  }

  function dismissSuggestion(name: string) {
    setDismissedSuggestions((prev) => new Set([...prev, name]))
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

  async function suggestTypes() {
    setSuggestingTypes(true)
    try {
      const res = await fetch("/api/companies/suggest-types")
      if (res.ok) {
        const data = await res.json()
        setTypeSuggestions(data.suggestions as TypeSuggestion[])
        setDismissedTypeSuggestions(new Set())
        setShowTypeSuggestions(true)
      }
    } finally {
      setSuggestingTypes(false)
    }
  }

  async function acceptTypeSuggestion(company: string, type: CompanyType) {
    setTypeSuggestions((prev) => prev.filter((s) => s.company !== company))
    await setType(company, type)
  }

  async function acceptAllTypeSuggestions() {
    const pending = typeSuggestions.filter((s) => !dismissedTypeSuggestions.has(s.company))
    setTypeSuggestions([])
    setDismissedTypeSuggestions(new Set())
    await Promise.all(pending.map((s) => setType(s.company, s.type)))
  }

  function dismissTypeSuggestion(company: string) {
    setDismissedTypeSuggestions((prev) => new Set([...prev, company]))
  }

  async function suggestIndustries() {
    setSuggesting(true)
    try {
      const res = await fetch("/api/companies/suggest-industries")
      if (res.ok) {
        const data = await res.json()
        const map = new Map<string, string>()
        for (const s of data.suggestions as { company: string; suggested: string }[]) {
          map.set(s.company, s.suggested)
        }
        setSuggestions(map)
        setDismissedSuggestions(new Set())
      }
    } finally {
      setSuggesting(false)
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

  function toggleTypeFilter(val: string) {
    setTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(val)) next.delete(val)
      else next.add(val)
      return next
    })
  }

  const availableIndustries = useMemo(() => {
    const set = new Set<string>()
    for (const c of companies) { if (c.industry) set.add(c.industry) }
    return [...set].sort()
  }, [companies])

  // Hoisted out of renderRow so it's allocated once per data change instead of
  // once per row (was O(N²) and broke CompanyRow memoization).
  const allCompanyNames = useMemo(() => companies.map((c) => c.name), [companies])

  const textMatch = (c: Company) =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.industry?.toLowerCase().includes(q.toLowerCase())

  const industryMatch = (c: Company) =>
    !industryFilter || (c.industry?.toLowerCase().includes(industryFilter.toLowerCase()) ?? false)

  const sizeMatch = (c: Company) => {
    if (sizeFilters.size === 0) return true
    if (sizeFilters.has("untagged") && c.size === null) return true
    return c.size !== null && sizeFilters.has(c.size)
  }

  const typeMatch = (c: Company) => {
    if (typeFilters.size === 0) return true
    if (typeFilters.has("untagged") && c.type === null) return true
    return c.type !== null && typeFilters.has(c.type)
  }

  const partnerMatch = (c: Company) => {
    if (partnerFilter === "") return true
    if (partnerFilter === "partner") return c.isPartner
    return !c.isPartner
  }

  const allFilters = (c: Company) => textMatch(c) && sizeMatch(c) && typeMatch(c) && partnerMatch(c) && industryMatch(c)

  const preferred  = companies.filter((c) => c.preferred && !c.ignored && !isSuspicious(c.name) && allFilters(c))
  const partners   = companies.filter((c) => c.isPartner && !c.preferred && !c.ignored && !isSuspicious(c.name) && allFilters(c))
  const neutral    = companies.filter((c) => !c.preferred && !c.isPartner && !c.ignored && !isSuspicious(c.name) && allFilters(c))
  const ignored    = companies.filter((c) => c.ignored && allFilters(c))
  const suspicious = companies.filter((c) => !c.ignored && isSuspicious(c.name) && allFilters(c))

  const visibleCount = preferred.length + partners.length + neutral.length

  const allSizeOptions = [
    ...SIZE_OPTIONS,
    { value: "untagged", label: "Untagged", short: "?" },
  ]

  const allTypeOptions = [
    ...TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label, color: o.color })),
    { value: "untagged", label: "Untagged", color: "bg-gray-100 text-gray-600 border-gray-300" },
  ]

  const pendingSuggestionsCount = [...suggestions.entries()].filter(
    ([name]) => !dismissedSuggestions.has(name) && !companies.find((c) => c.name === name)?.industryConfirmed
  ).length

  const pendingTypeSuggestionsCount = typeSuggestions.filter(
    (s) => !dismissedTypeSuggestions.has(s.company)
  ).length

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  function renderRow(c: Company) {
    const sugg = suggestions.get(c.name) ?? null
    const pending = sugg && !dismissedSuggestions.has(c.name) && !c.industryConfirmed ? sugg : null
    return (
      <CompanyRow
        key={c.name}
        company={c}
        allCompanyNames={allCompanyNames}
        pendingSuggestion={pending}
        onSetStatus={setStatus}
        onSetSize={setSize}
        onSetPartner={setPartner}
        onSetType={setType}
        onSetParent={setParent}
        onSetIndustry={setIndustry}
        onDismissSuggestion={dismissSuggestion}
        onRename={renameCompany}
      />
    )
  }

  function renderIconCard(c: Company) {
    return <CompanyIconCard key={c.name} company={c} />
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
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          {/* View toggle: List / Icons / Map */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setView("list")}
              title="List view"
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors",
                view === "list" ? "bg-gray-100 text-gray-900" : "bg-white text-gray-400 hover:bg-gray-50"
              )}
            >
              <AlignJustify size={12} /> List
            </button>
            <button
              onClick={() => setView("icon")}
              title="Icon grid view"
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors border-l border-gray-200",
                view === "icon" ? "bg-gray-100 text-gray-900" : "bg-white text-gray-400 hover:bg-gray-50"
              )}
            >
              <LayoutGrid size={12} /> Icons
            </button>
            <button
              onClick={() => setView("treemap")}
              title="Treemap by country"
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors border-l border-gray-200",
                view === "treemap" ? "bg-gray-100 text-gray-900" : "bg-white text-gray-400 hover:bg-gray-50"
              )}
            >
              <BarChart2 size={12} /> Map
            </button>
          </div>

          <button
            onClick={suggestTypes}
            disabled={suggestingTypes}
            title="Auto-suggest brand / non-brand from company names and industries"
            className="flex items-center gap-1.5 text-xs font-medium text-violet-700 border border-violet-200 bg-violet-50 hover:bg-violet-100 px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            <Sparkles size={13} />
            <span className="hidden sm:inline">{suggestingTypes ? "Suggesting…" : "Suggest types"}</span>
            <span className="sm:hidden">{suggestingTypes ? "…" : "Types"}</span>
            {pendingTypeSuggestionsCount > 0 && !suggestingTypes && (
              <span className="ml-0.5 bg-violet-600 text-white rounded-full text-[9px] font-bold px-1.5 py-0.5">{pendingTypeSuggestionsCount}</span>
            )}
          </button>
          <button
            onClick={suggestIndustries}
            disabled={suggesting}
            title="Auto-suggest industries from contact data and company names"
            className="flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            <Globe size={13} />
            <span className="hidden sm:inline">{suggesting ? "Suggesting…" : "Suggest industries"}</span>
            <span className="sm:hidden">{suggesting ? "…" : "Industries"}</span>
            {pendingSuggestionsCount > 0 && !suggesting && (
              <span className="ml-0.5 bg-teal-600 text-white rounded-full text-[9px] font-bold px-1.5 py-0.5">{pendingSuggestionsCount}</span>
            )}
          </button>
          <button
            onClick={autoTag}
            disabled={autoTagging}
            title="Auto-detect subsidiaries for LVMH, Kering, BNP Paribas, big tech, etc."
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            <span className="hidden sm:inline">{autoTagging ? "Detecting…" : "Auto-detect subsidiaries"}</span>
            <span className="sm:hidden">{autoTagging ? "…" : "Subsidiaries"}</span>
          </button>
          {autoTagResult !== null && (
            <span className="text-xs text-indigo-600">
              {autoTagResult > 0 ? `↳ ${autoTagResult} tagged` : "None found"}
            </span>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
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

      {/* Type suggestions panel */}
      {showTypeSuggestions && pendingTypeSuggestionsCount > 0 && (
        <div className="mb-4 border border-violet-200 bg-violet-50/50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
              <Sparkles size={11} />
              {pendingTypeSuggestionsCount} type suggestion{pendingTypeSuggestionsCount !== 1 ? "s" : ""}
              <span className="font-normal text-violet-500">— accept or skip each one</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={acceptAllTypeSuggestions}
                className="text-xs font-semibold text-violet-700 bg-violet-100 hover:bg-violet-200 border border-violet-200 rounded-lg px-2.5 py-1 transition-colors"
              >
                Accept all {pendingTypeSuggestionsCount}
              </button>
              <button
                onClick={() => setShowTypeSuggestions(false)}
                className="text-gray-400 hover:text-gray-600"
                title="Close"
              >
                <X size={13} />
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {typeSuggestions
              .filter((s) => !dismissedTypeSuggestions.has(s.company))
              .map((s) => {
                const typeOpt = TYPE_OPTIONS.find((o) => o.value === s.type)
                return (
                  <div key={s.company} className="flex items-center gap-2 py-1.5 px-2.5 bg-white rounded-lg border border-violet-100">
                    <span className="font-medium text-sm text-gray-900 flex-1 min-w-0 truncate">{s.company}</span>
                    <span className="text-[10px] text-gray-400 shrink-0 hidden sm:inline">{s.count} contacts</span>
                    <span className={cn("text-[10px] font-medium rounded-full px-2 py-0.5 border shrink-0", typeOpt?.color ?? "bg-gray-100 text-gray-600 border-gray-300")}>
                      {typeOpt?.label ?? s.type}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0 hidden md:inline truncate max-w-[120px]">{s.reason}</span>
                    {s.confidence === "high" ? (
                      <span className="text-[9px] font-semibold text-green-600 bg-green-50 rounded px-1 py-0.5 border border-green-200 shrink-0">high</span>
                    ) : (
                      <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 rounded px-1 py-0.5 border border-amber-200 shrink-0">med</span>
                    )}
                    <button
                      onClick={() => acceptTypeSuggestion(s.company, s.type as CompanyType)}
                      className="text-green-500 hover:text-green-600 shrink-0"
                      title="Accept"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => dismissTypeSuggestion(s.company)}
                      className="text-gray-300 hover:text-gray-500 shrink-0"
                      title="Skip"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Filter chips row */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        {/* Size filter */}
        <div className="flex items-center gap-1">
          {allSizeOptions.map((opt) => {
            const active = sizeFilters.has(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleSizeFilter(opt.value)}
                title={opt.label}
                className={cn(
                  "text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
                  active ? SIZE_COLORS[opt.value] : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
                )}
              >
                {opt.short}
              </button>
            )
          })}
          {sizeFilters.size > 0 && (
            <button onClick={() => setSizeFilters(new Set())} className="text-gray-400 hover:text-gray-600" title="Clear size filter">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="hidden sm:block w-px h-5 bg-gray-200" />

        {/* Type filter */}
        <div className="flex items-center gap-1">
          {allTypeOptions.map((opt) => {
            const active = typeFilters.has(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleTypeFilter(opt.value)}
                title={opt.label}
                className={cn(
                  "text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
                  active ? opt.color : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
                )}
              >
                {opt.label}
              </button>
            )
          })}
          {typeFilters.size > 0 && (
            <button onClick={() => setTypeFilters(new Set())} className="text-gray-400 hover:text-gray-600" title="Clear type filter">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="hidden sm:block w-px h-5 bg-gray-200" />

        {/* Partner filter */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPartnerFilter(partnerFilter === "partner" ? "" : "partner")}
            className={cn(
              "flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
              partnerFilter === "partner"
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
            )}
          >
            <Handshake size={12} />
            Partners
          </button>
          <button
            onClick={() => setPartnerFilter(partnerFilter === "non-partner" ? "" : "non-partner")}
            className={cn(
              "text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
              partnerFilter === "non-partner"
                ? "bg-gray-100 text-gray-700 border-gray-300"
                : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
            )}
          >
            Non-partners
          </button>
        </div>

        <div className="hidden sm:block w-px h-5 bg-gray-200" />

        {/* Industry filter */}
        <select
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          className={cn(
            "text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white max-w-[160px]",
            industryFilter ? "border-teal-300 text-teal-700 bg-teal-50" : "border-gray-200 text-gray-500"
          )}
        >
          <option value="">All industries</option>
          {availableIndustries.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
        </select>
        {industryFilter && (
          <button onClick={() => setIndustryFilter("")} className="text-gray-400 hover:text-gray-600" title="Clear industry filter">
            <X size={13} />
          </button>
        )}

        {(sizeFilters.size > 0 || typeFilters.size > 0 || partnerFilter || industryFilter) && (
          <button
            onClick={() => { setSizeFilters(new Set()); setTypeFilters(new Set()); setPartnerFilter(""); setIndustryFilter("") }}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5 ml-1"
          >
            <X size={12} /> Clear all
          </button>
        )}
      </div>

      {/* Treemap view */}
      {view === "treemap" && companies.length > 0 && (
        <CompanyTreemap
          companies={companies.filter(c => !c.ignored && allFilters(c))}
          onCompanyClick={(name) => { setView("list"); setQ(name) }}
        />
      )}

      {/* Icon grid view */}
      {view === "icon" && (companies.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          No companies yet — sync your LinkedIn contacts first.
        </div>
      ) : visibleCount === 0 && !showIgnored && suspicious.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">No companies match your filters.</div>
      ) : (
        <div className="space-y-4">
          {suspicious.length > 0 && showReview && (
            <div>
              <button
                onClick={() => setShowReview((v) => !v)}
                className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5 hover:text-amber-700 transition-colors mb-2"
              >
                <AlertTriangle size={11} /> Needs review ({suspicious.length})
                {showReview ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {suspicious.map(renderIconCard)}
              </div>
            </div>
          )}
          {preferred.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Star size={11} fill="currentColor" /> Preferred
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {preferred.map(renderIconCard)}
              </div>
            </div>
          )}
          {partners.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <Handshake size={11} /> Partners
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {partners.map(renderIconCard)}
              </div>
            </div>
          )}
          {neutral.length > 0 && (
            <div>
              {(preferred.length > 0 || partners.length > 0) && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 mt-2">All companies</p>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {neutral.map(renderIconCard)}
              </div>
            </div>
          )}
          {ignored.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowIgnored((v) => !v)}
                className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5 hover:text-gray-500 transition-colors mb-2"
              >
                <EyeOff size={11} /> Ignored ({ignored.length})
                {showIgnored ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showIgnored && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {ignored.map(renderIconCard)}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* List view */}
      {view === "list" && (companies.length === 0 ? (
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
              {showReview && suspicious.map(renderRow)}
            </div>
          )}

          {/* Preferred */}
          {preferred.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
                <Star size={11} fill="currentColor" /> Preferred
              </p>
              {preferred.map(renderRow)}
            </div>
          )}

          {/* Partners (not preferred) */}
          {partners.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide flex items-center gap-1.5">
                <Handshake size={11} /> Partners
              </p>
              {partners.map(renderRow)}
            </div>
          )}

          {/* Neutral */}
          {neutral.length > 0 && (
            <div className="space-y-2">
              {(preferred.length > 0 || partners.length > 0) && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4">All companies</p>
              )}
              {neutral.map(renderRow)}
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
              {showIgnored && ignored.map(renderRow)}
            </div>
          )}
        </div>
      ))}
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

export default function CompaniesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <CompaniesContent />
    </Suspense>
  )
}
