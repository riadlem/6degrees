"use client"

import { useEffect, useRef, useState, useId } from "react"
import {
  Building2, Briefcase, Globe, MapPin, StickyNote, Pencil, ChevronDown, X, Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/countries"

// ─── Types ────────────────────────────────────────────────────────────────────

export type BulkField =
  | "company"
  | "position"
  | "city"
  | "country"
  | "industry"
  | "outreachStatus"
  | "note"

interface Props {
  count: number
  /** Options for autocomplete — all come from the filter metadata already loaded */
  options: {
    companies:  string[]
    industries: string[]
    countries:  string[]
    cities?:    string[]
    positions?: string[]
  }
  onAssign: (field: BulkField, value: string) => Promise<void>
  className?: string
}

// ─── Field definitions ────────────────────────────────────────────────────────

const OUTREACH_OPTIONS = [
  { value: "not_contacted",  label: "Not contacted" },
  { value: "contacted",      label: "Contacted" },
  { value: "in_discussion",  label: "In discussion" },
  { value: "meeting_booked", label: "Meeting booked" },
  { value: "closed",         label: "Closed" },
  { value: "not_interested", label: "Not interested" },
]

const FIELDS: { field: BulkField; label: string; icon: React.ReactNode; placeholder: string }[] = [
  { field: "company",       label: "Company",        icon: <Building2 size={13} />,  placeholder: "e.g. Acme Corp" },
  { field: "position",      label: "Role / Title",   icon: <Briefcase size={13} />,  placeholder: "e.g. Sales Director" },
  { field: "city",          label: "City",           icon: <MapPin size={13} />,     placeholder: "e.g. Paris" },
  { field: "country",       label: "Country",        icon: <Globe size={13} />,      placeholder: "e.g. France" },
  { field: "industry",      label: "Industry",       icon: <Briefcase size={13} />,  placeholder: "e.g. Fintech" },
  { field: "outreachStatus",label: "Outreach status",icon: <ChevronDown size={13} />, placeholder: "" },
  { field: "note",          label: "Add note",       icon: <StickyNote size={13} />, placeholder: "Note added to all selected contacts…" },
]

// ─── Combobox component ───────────────────────────────────────────────────────
// Custom filtered dropdown — avoids <datalist> cross-browser inconsistencies.

function Combobox({
  value,
  onChange,
  options,
  placeholder,
  inputClassName,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
  inputClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const filtered = options
    .filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 12)

  useEffect(() => {
    if (!open) return
    function down(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", down)
    return () => document.removeEventListener("mousedown", down)
  }, [open])

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          inputClassName,
        )}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((opt) => (
            <li
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false) }}
              className={cn(
                "px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700",
                opt === value && "bg-blue-50 text-blue-700 font-medium",
              )}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BulkAssignPopover({ count, options, onAssign, className }: Props) {
  const [open, setOpen]         = useState(false)
  const [activeField, setField] = useState<BulkField>("company")
  const [value, setValue]       = useState("")
  const [pending, setPending]   = useState(false)
  const containerRef            = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function down(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", down)
    return () => document.removeEventListener("mousedown", down)
  }, [open])

  function selectField(f: BulkField) {
    setField(f)
    setValue("")
  }

  async function handleApply() {
    if (activeField !== "note" && !value.trim()) return
    if (activeField === "note" && !value.trim()) return
    setPending(true)
    try {
      await onAssign(activeField, value.trim())
      setValue("")
      setOpen(false)
    } finally {
      setPending(false)
    }
  }

  const fieldDef = FIELDS.find((f) => f.field === activeField)!

  // Autocomplete options per field
  const autocompleteOptions: Record<BulkField, string[]> = {
    company:       options.companies,
    position:      options.positions ?? [],
    city:          options.cities ?? [],
    country:       COUNTRIES,
    industry:      options.industries,
    outreachStatus: [],
    note:          [],
  }

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm px-2.5 sm:px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors font-medium"
      >
        <Pencil size={14} />
        <span className="hidden sm:inline">Edit {count}</span>
        <span className="sm:hidden">{count}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* Field picker */}
          <div className="px-3 pt-3 pb-2 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Field to edit
            </p>
            <div className="grid grid-cols-2 gap-1">
              {FIELDS.map(({ field, label, icon }) => (
                <button
                  key={field}
                  onClick={() => selectField(field)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors text-left",
                    activeField === field
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100",
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Value input */}
          <div className="px-3 py-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              New value
            </p>

            {activeField === "note" ? (
              <textarea
                rows={3}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={fieldDef.placeholder}
                autoFocus
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            ) : activeField === "outreachStatus" ? (
              <div className="space-y-1">
                {OUTREACH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setValue(opt.value === value ? "" : opt.value)}
                    className={cn(
                      "w-full flex items-center justify-between text-sm px-3 py-2 rounded-lg border transition-colors text-left",
                      value === opt.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:bg-gray-50 text-gray-700",
                    )}
                  >
                    {opt.label}
                    {value === opt.value && <Check size={13} />}
                  </button>
                ))}
              </div>
            ) : (
              <Combobox
                value={value}
                onChange={setValue}
                options={autocompleteOptions[activeField]}
                placeholder={fieldDef.placeholder}
              />
            )}

            {/* Clear option */}
            {activeField !== "note" && (
              <button
                onClick={() => setValue("")}
                className={cn(
                  "mt-1.5 flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors",
                  value === "" && "opacity-40 pointer-events-none",
                )}
              >
                <X size={11} />
                Clear field on all selected
              </button>
            )}

            <button
              onClick={handleApply}
              disabled={pending || (activeField !== "note" ? false : !value.trim())}
              className="mt-3 w-full text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 transition-colors"
            >
              {pending
                ? "Applying…"
                : `Apply to ${count} contact${count !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
