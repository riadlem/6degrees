"use client"

import { useEffect, useRef, useState } from "react"
import { Globe, Briefcase, StickyNote, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/countries"

interface Props {
  count: number
  industries: string[]
  onAssign: (field: "country" | "industry" | "note", value: string) => Promise<void>
  className?: string
}

type ActiveField = "country" | "industry" | "note"

const TABS: { field: ActiveField; label: string; icon: React.ReactNode }[] = [
  { field: "country",  label: "Country",  icon: <Globe size={13} /> },
  { field: "industry", label: "Industry", icon: <Briefcase size={13} /> },
  { field: "note",     label: "Note",     icon: <StickyNote size={13} /> },
]

export default function BulkAssignPopover({ count, industries, onAssign, className }: Props) {
  const [open, setOpen]               = useState(false)
  const [activeField, setActiveField] = useState<ActiveField>("country")
  const [value, setValue]             = useState("")
  const [pending, setPending]         = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [open])

  async function handleApply() {
    if (!value.trim()) return
    setPending(true)
    try {
      await onAssign(activeField, value.trim())
      setValue("")
      setOpen(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <Pencil size={14} />
        Assign…
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-50">
          {/* Tab row */}
          <div className="flex gap-1 mb-3">
            {TABS.map(({ field, label, icon }) => (
              <button
                key={field}
                onClick={() => { setActiveField(field); setValue("") }}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex-1 justify-center",
                  activeField === field
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Input area */}
          {activeField === "country" && (
            <>
              <datalist id="country-datalist">
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <input
                list="country-datalist"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. France"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </>
          )}

          {activeField === "industry" && (
            <>
              <datalist id="industry-datalist">
                {industries.map((ind) => (
                  <option key={ind} value={ind} />
                ))}
              </datalist>
              <input
                list="industry-datalist"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. Technology"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </>
          )}

          {activeField === "note" && (
            <textarea
              rows={3}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Add a note to all selected contacts…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          )}

          {/* Apply button */}
          <button
            onClick={handleApply}
            disabled={pending || !value.trim()}
            className="mt-3 w-full text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 transition-colors"
          >
            {pending
              ? "Applying…"
              : `Apply to ${count} contact${count !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  )
}
