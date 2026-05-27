"use client"

import { X, SlidersHorizontal, Star, Mail, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useRef } from "react"
import { labelColors } from "@/lib/label-colors"
import { INDUSTRY_SECTORS } from "@/lib/industry-sectors"
import ContactSearchBar from "@/components/ContactSearchBar"

export interface FilterState {
  q: string
  companies: string[]   // multi-company filter
  industry: string
  location: string
  country: string
  position: string
  label: string
  sort: string
  preferredCompanies: boolean
  sector: string
  companyType: string
  gmailMatched: "" | "matched" | "unmatched" | "email_no_linkedin"
}

type LabelOption = { id: string; name: string; color: string }

interface FilterOptions {
  companies: (string | null)[]
  /** Companies that have at least one subsidiary — shown with "(+subs)" hint */
  parentCompanies?: string[]
  industries: (string | null)[]
  locations: (string | null)[]
  countries: (string | null)[]
  labels: LabelOption[]
}

interface Props {
  filters: FilterState
  options: FilterOptions
  total: number
  view: "grid" | "list" | "photos"
  onViewChange: (v: "grid" | "list" | "photos") => void
  onChange: (f: Partial<FilterState>) => void
  onReset: () => void
  /** Called when the user selects a contact from the autocomplete dropdown. */
  onSelectContact?: (id: string) => void
}

const SORT_OPTIONS = [
  { value: "name",          label: "Name A–Z" },
  { value: "name_desc",     label: "Name Z–A" },
  { value: "company",       label: "Company A–Z" },
  { value: "connected",     label: "Recently connected" },
  { value: "connected_asc", label: "Oldest connection" },
  { value: "mutual",        label: "Most connections" },
  { value: "mutual_asc",    label: "Fewest connections" },
  { value: "recent",        label: "Recently synced" },
  { value: "location",      label: "Location A–Z" },
  { value: "score",         label: "Interaction score" },
  { value: "country",       label: "Country A–Z" },
  { value: "country_desc",  label: "Country Z–A" },
  { value: "industry",      label: "Industry A–Z" },
  { value: "industry_desc", label: "Industry Z–A" },
]

const COMPANY_TYPE_OPTIONS = [
  { value: "brand",       label: "Brand",     color: "border-violet-300 bg-violet-100 text-violet-700", inactive: "border-gray-200 text-gray-500 hover:bg-gray-50" },
  { value: "non-brand",   label: "Non-brand", color: "border-emerald-300 bg-emerald-100 text-emerald-700", inactive: "border-gray-200 text-gray-500 hover:bg-gray-50" },
  { value: "independent", label: "Indep.",    color: "border-amber-300 bg-amber-100 text-amber-700", inactive: "border-gray-200 text-gray-500 hover:bg-gray-50" },
]

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: (string | null)[]
  onChange: (v: string) => void
}) {
  const valid = options.filter(Boolean) as string[]
  if (valid.length === 0) return null
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">All</option>
        {valid.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    </div>
  )
}

/** Multi-company tag selector with autocomplete. */
function CompanyMultiSelect({
  selected,
  options,
  parentCompanies,
  onChange,
}: {
  selected: string[]
  options: (string | null)[]
  parentCompanies?: string[]
  onChange: (v: string[]) => void
}) {
  const [input, setInput] = useState("")
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const parentSet = new Set((parentCompanies ?? []).map((c) => c.toLowerCase()))
  const allCompanies = options.filter(Boolean) as string[]
  const suggestions = allCompanies
    .filter((c) => c.toLowerCase().includes(input.toLowerCase()) && !selected.includes(c))
    .slice(0, 8)

  const add = (company: string) => {
    const trimmed = company.trim()
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed])
    }
    setInput("")
    setOpen(false)
    inputRef.current?.focus()
  }

  const remove = (company: string) => {
    onChange(selected.filter((c) => c !== company))
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        Companies
        {selected.length > 0 && (
          <span className="ml-1.5 text-blue-600 font-semibold">{selected.length} selected</span>
        )}
      </label>

      {/* Selected company chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selected.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 font-medium"
            >
              <Building2 size={10} className="shrink-0" />
              {c}
              <button
                onClick={() => remove(c)}
                className="ml-0.5 text-blue-400 hover:text-blue-700 transition-colors leading-none"
                title={`Remove ${c}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            onClick={() => onChange([])}
            className="text-xs text-gray-400 hover:text-gray-600 px-1"
            title="Clear all companies"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Autocomplete input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          placeholder="Type a company name…"
          onChange={(e) => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              if (suggestions.length > 0) add(suggestions[0])
              else if (input.trim()) add(input.trim())
            }
            if (e.key === "Escape") setOpen(false)
          }}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {open && (suggestions.length > 0 || (input.length > 1 && !allCompanies.includes(input))) && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-52 overflow-y-auto">
            {suggestions.map((c) => (
              <button
                key={c}
                onMouseDown={(e) => { e.preventDefault(); add(c) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-700 flex items-center gap-2 transition-colors"
              >
                <Building2 size={12} className="text-gray-400 shrink-0" />
                <span className="flex-1 truncate">{c}</span>
                {parentSet.has(c.toLowerCase()) && (
                  <span className="text-[10px] text-blue-500 bg-blue-50 border border-blue-200 rounded px-1 shrink-0">+subs</span>
                )}
              </button>
            ))}
            {/* Allow adding a company not in the list (e.g. not yet in contacts) */}
            {input.trim() && !allCompanies.find((c) => c.toLowerCase() === input.toLowerCase()) && (
              <button
                onMouseDown={(e) => { e.preventDefault(); add(input.trim()) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-blue-600 flex items-center gap-2 border-t border-gray-100 transition-colors"
              >
                <Building2 size={12} className="shrink-0" />
                Add &ldquo;{input.trim()}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Compact inline "+ Company" button for the always-visible filter bar. */
function InlineCompanyAdd({
  selected,
  options,
  parentCompanies,
  onChange,
}: {
  selected: string[]
  options: (string | null)[]
  parentCompanies?: string[]
  onChange: (v: string[]) => void
}) {
  const [active, setActive] = useState(false)
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const parentSet = new Set((parentCompanies ?? []).map((c) => c.toLowerCase()))
  const allCompanies = options.filter(Boolean) as string[]
  const suggestions = allCompanies
    .filter((c) => c.toLowerCase().includes(input.toLowerCase()) && !selected.includes(c))
    .slice(0, 7)

  const add = (company: string) => {
    const trimmed = company.trim()
    if (trimmed && !selected.includes(trimmed)) onChange([...selected, trimmed])
    setInput("")
    setActive(false)
  }

  if (!active) {
    return (
      <button
        onClick={() => { setActive(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        className="inline-flex items-center gap-1 text-xs text-gray-400 border border-dashed border-gray-300 rounded-full px-2.5 py-1 hover:border-blue-300 hover:text-blue-500 transition-colors"
        title="Filter by company"
      >
        <Building2 size={10} />
        + Company
      </button>
    )
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={() => setTimeout(() => { setActive(false); setInput("") }, 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            if (suggestions.length > 0) add(suggestions[0])
            else if (input.trim()) add(input.trim())
          }
          if (e.key === "Escape") { setActive(false); setInput("") }
        }}
        placeholder="Company name…"
        className="text-xs border border-blue-400 rounded-full px-3 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 w-36 bg-white"
      />
      {(suggestions.length > 0 || (input.trim() && !allCompanies.find((c) => c.toLowerCase() === input.toLowerCase()))) && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-48 overflow-hidden">
          {suggestions.map((c) => (
            <button
              key={c}
              onMouseDown={(e) => { e.preventDefault(); add(c) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-700 flex items-center gap-2 transition-colors"
            >
              <Building2 size={12} className="text-gray-400 shrink-0" />
              <span className="flex-1 truncate">{c}</span>
              {parentSet.has(c.toLowerCase()) && (
                <span className="text-[10px] text-blue-500 bg-blue-50 border border-blue-200 rounded px-1 shrink-0">+subs</span>
              )}
            </button>
          ))}
          {input.trim() && !allCompanies.find((c) => c.toLowerCase() === input.toLowerCase()) && (
            <button
              onMouseDown={(e) => { e.preventDefault(); add(input.trim()) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-blue-600 flex items-center gap-2 border-t border-gray-100 transition-colors"
            >
              <Building2 size={12} className="shrink-0" />
              Add &ldquo;{input.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ContactFilters({ filters, options, total, view, onViewChange, onChange, onReset, onSelectContact }: Props) {
  const [open, setOpen] = useState(false)
  const activeCount =
    (filters.companies.length > 0 ? 1 : 0) +
    [filters.industry, filters.location, filters.country, filters.position, filters.label, filters.sector, filters.companyType]
      .filter(Boolean).length +
    (filters.preferredCompanies ? 1 : 0) +
    (filters.gmailMatched ? 1 : 0)

  return (
    <div className="space-y-3">
      {/* Search bar with offline autocomplete */}
      <ContactSearchBar
        value={filters.q}
        onChange={(q) => onChange({ q })}
        onSelectContact={onSelectContact}
      />

      {/* Quick filter row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm text-gray-500 mr-1">
            <span className="font-semibold text-gray-900">{total}</span> contact{total !== 1 ? "s" : ""}
          </p>
          {/* Preferred */}
          <button
            onClick={() => onChange({ preferredCompanies: !filters.preferredCompanies })}
            className={cn(
              "flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors font-medium",
              filters.preferredCompanies
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            )}
          >
            <Star size={11} fill={filters.preferredCompanies ? "currentColor" : "none"} />
            Preferred
          </button>
          {/* Company type: Brand / Non-brand / Independent */}
          {COMPANY_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange({ companyType: filters.companyType === opt.value ? "" : opt.value })}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors font-medium",
                filters.companyType === opt.value ? opt.color : opt.inactive
              )}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => onChange({
              gmailMatched:
                filters.gmailMatched === "" ? "matched" :
                filters.gmailMatched === "matched" ? "unmatched" :
                filters.gmailMatched === "unmatched" ? "email_no_linkedin" : ""
            })}
            className={cn(
              "flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors font-medium",
              filters.gmailMatched === "matched"
                ? "bg-green-50 border-green-300 text-green-700"
                : filters.gmailMatched === "unmatched"
                ? "bg-gray-50 border-gray-300 text-gray-500"
                : filters.gmailMatched === "email_no_linkedin"
                ? "bg-orange-50 border-orange-300 text-orange-700"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            )}
          >
            <Mail size={11} />
            {filters.gmailMatched === "matched" ? "Gmail ✓" :
             filters.gmailMatched === "unmatched" ? "No Gmail" :
             filters.gmailMatched === "email_no_linkedin" ? "Email, no LinkedIn" :
             "Gmail"}
          </button>
          {/* Active company chips + inline add button */}
          {filters.companies.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 font-medium">
              <Building2 size={10} />
              {c}
              <button onClick={() => onChange({ companies: filters.companies.filter((x) => x !== c) })} className="ml-0.5 text-blue-400 hover:text-blue-700">
                <X size={10} />
              </button>
            </span>
          ))}
          <InlineCompanyAdd
            selected={filters.companies}
            options={options.companies}
            parentCompanies={options.parentCompanies}
            onChange={(v) => onChange({ companies: v })}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => setOpen(!open)}
            className={cn(
              "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors",
              open || activeCount > 0
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeCount > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => onViewChange("grid")}
              className={cn("px-2.5 py-1.5 transition-colors", view === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
              title="Grid view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor"/>
                <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor"/>
                <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor"/>
                <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor"/>
              </svg>
            </button>
            <button
              onClick={() => onViewChange("list")}
              className={cn("px-2.5 py-1.5 transition-colors border-l border-gray-200", view === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
              title="List view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="2" width="12" height="2" rx="1" fill="currentColor"/>
                <rect x="1" y="6" width="12" height="2" rx="1" fill="currentColor"/>
                <rect x="1" y="10" width="12" height="2" rx="1" fill="currentColor"/>
              </svg>
            </button>
            <button
              onClick={() => onViewChange("photos")}
              className={cn("px-2.5 py-1.5 transition-colors border-l border-gray-200", view === "photos" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
              title="Photos view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="3.5" cy="4" r="2.5" fill="currentColor"/>
                <circle cx="10.5" cy="4" r="2.5" fill="currentColor"/>
                <circle cx="3.5" cy="10" r="2.5" fill="currentColor"/>
                <circle cx="10.5" cy="10" r="2.5" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Sector chips — always visible, horizontal scroll on mobile */}
      <div className="flex gap-1.5 flex-wrap">
        {INDUSTRY_SECTORS.map((sector) => {
          const active = filters.sector === sector.key
          return (
            <button
              key={sector.key}
              onClick={() => onChange({ sector: active ? "" : sector.key })}
              className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap",
                active ? sector.color.active : sector.color.chip
              )}
            >
              {sector.shortLabel}
            </button>
          )
        })}
        {filters.sector && (
          <button
            onClick={() => onChange({ sector: "" })}
            className="text-gray-400 hover:text-gray-600 ml-0.5"
            title="Clear sector"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {open && (
        <div className="space-y-3 pt-1 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title / Role</label>
            <input
              type="text"
              placeholder="e.g. CTO, Engineer, Designer"
              value={filters.position}
              onChange={(e) => onChange({ position: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <FilterSelect
            label="Specific industry"
            value={filters.industry}
            options={options.industries}
            onChange={(v) => onChange({ industry: v })}
          />

          {/* Multi-company selector */}
          <CompanyMultiSelect
            selected={filters.companies}
            options={options.companies}
            parentCompanies={options.parentCompanies}
            onChange={(v) => onChange({ companies: v })}
          />

          <FilterSelect
            label="Location"
            value={filters.location}
            options={options.locations}
            onChange={(v) => onChange({ location: v })}
          />
          <FilterSelect
            label="Country"
            value={filters.country}
            options={options.countries}
            onChange={(v) => onChange({ country: v })}
          />

          {options.labels.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Label</label>
              <div className="flex flex-wrap gap-1.5">
                {options.labels.map((l) => {
                  const c = labelColors(l.color)
                  const active = filters.label === l.id
                  return (
                    <button
                      key={l.id}
                      onClick={() => onChange({ label: active ? "" : l.id })}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors font-medium",
                        active ? `${c.bg} ${c.text} border-transparent` : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", c.dot)} />
                      {l.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {activeCount > 0 && (
            <button
              onClick={onReset}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
