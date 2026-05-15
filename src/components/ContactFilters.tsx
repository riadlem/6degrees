"use client"

import { Search, X, SlidersHorizontal, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { labelColors } from "@/lib/label-colors"
import { INDUSTRY_SECTORS } from "@/lib/industry-sectors"

export interface FilterState {
  q: string
  company: string
  industry: string
  location: string
  position: string
  label: string
  sort: string
  preferredCompanies: boolean
  sector: string      // one of SectorKey or ""
  companyType: string // "brand" | "non-brand" | "independent" | ""
}

type LabelOption = { id: string; name: string; color: string }

interface FilterOptions {
  companies: (string | null)[]
  industries: (string | null)[]
  locations: (string | null)[]
  labels: LabelOption[]
}

interface Props {
  filters: FilterState
  options: FilterOptions
  total: number
  view: "grid" | "list"
  onViewChange: (v: "grid" | "list") => void
  onChange: (f: Partial<FilterState>) => void
  onReset: () => void
}

const SORT_OPTIONS = [
  { value: "name",          label: "Name A–Z" },
  { value: "name_desc",     label: "Name Z–A" },
  { value: "company",       label: "Company A–Z" },
  { value: "connected",     label: "Recently connected" },
  { value: "connected_asc", label: "Oldest connection" },
  { value: "mutual",        label: "Most mutual" },
  { value: "recent",        label: "Recently synced" },
  { value: "location",      label: "Location A–Z" },
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

export default function ContactFilters({ filters, options, total, view, onViewChange, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false)
  const activeCount =
    [filters.company, filters.industry, filters.location, filters.position, filters.label, filters.sector, filters.companyType]
      .filter(Boolean).length +
    (filters.preferredCompanies ? 1 : 0)

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name, company, title…"
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value })}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        />
        {filters.q && (
          <button
            onClick={() => onChange({ q: "" })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

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
          <FilterSelect
            label="Company"
            value={filters.company}
            options={options.companies}
            onChange={(v) => onChange({ company: v })}
          />
          <FilterSelect
            label="Location"
            value={filters.location}
            options={options.locations}
            onChange={(v) => onChange({ location: v })}
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
