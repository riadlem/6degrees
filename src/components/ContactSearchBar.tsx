"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { Search, X } from "lucide-react"
import { cn, initials } from "@/lib/utils"
import { useContactsIndex } from "@/hooks/useContactsIndex"
import { matchContacts } from "@/lib/contact-search"

interface Props {
  value: string
  onChange: (q: string) => void
  /** Called when the user picks a contact from the dropdown — use to open the detail panel. */
  onSelectContact?: (id: string) => void
  className?: string
}

/**
 * ContactSearchBar
 *
 * Drop-in replacement for the plain text input in ContactFilters.
 * Adds an instant offline autocomplete dropdown powered by the contacts index
 * cached in IndexedDB (useContactsIndex → "contacts-index" React Query key).
 *
 * Behaviour:
 * - Typing ≥1 char shows a dropdown of up to 8 matches (scored by matchContacts)
 * - Clicking a result calls onSelectContact(id) and clears the input
 * - Pressing ↑/↓ highlights results; Enter selects the highlighted one
 * - Escape closes the dropdown without clearing the input
 * - Clicking outside closes the dropdown
 * - The `value`/`onChange` props still drive the parent's filter state so the
 *   main contacts list continues to filter server-side as before
 */
export default function ContactSearchBar({
  value,
  onChange,
  onSelectContact,
  className,
}: Props) {
  const index   = useContactsIndex()
  const results = value.trim().length > 0 ? matchContacts(value, index) : []

  const [open,    setOpen]    = useState(false)
  const [focused, setFocused] = useState<number>(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function down(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", down)
    return () => document.removeEventListener("mousedown", down)
  }, [open])

  // Reset highlight index when results change
  useEffect(() => { setFocused(-1) }, [results.length])

  // Show dropdown whenever there are results and input is focused
  const shouldShow = open && results.length > 0

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    setOpen(true)
  }

  function handleSelect(id: string) {
    onSelectContact?.(id)
    onChange("")
    setOpen(false)
    setFocused(-1)
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!shouldShow) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocused((f) => Math.min(f + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocused((f) => Math.max(f - 1, 0))
    } else if (e.key === "Enter" && focused >= 0) {
      e.preventDefault()
      handleSelect(results[focused].id)
    } else if (e.key === "Escape") {
      setOpen(false)
      setFocused(-1)
    }
  }

  // Deterministic avatar colour from first letter of last name
  const avatarColour = useCallback((lastName: string) => {
    const colours = [
      "bg-blue-100 text-blue-700",
      "bg-purple-100 text-purple-700",
      "bg-green-100 text-green-700",
      "bg-amber-100 text-amber-700",
      "bg-pink-100 text-pink-700",
      "bg-teal-100 text-teal-700",
      "bg-orange-100 text-orange-700",
      "bg-indigo-100 text-indigo-700",
    ]
    const code = (lastName[0] ?? "a").toLowerCase().charCodeAt(0)
    return colours[code % colours.length]
  }, [])

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Input */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search by name, company, title…"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
          className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     bg-white"
        />
        {value && (
          <button
            onClick={() => { onChange(""); setOpen(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {shouldShow && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-gray-200
                        rounded-2xl shadow-xl overflow-hidden">
          <ul>
            {results.map((c, i) => (
              <li key={c.id}>
                <button
                  onMouseDown={(e) => {
                    // Prevent input blur before click registers
                    e.preventDefault()
                    handleSelect(c.id)
                  }}
                  onMouseEnter={() => setFocused(i)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                    i === focused ? "bg-blue-50" : "hover:bg-gray-50",
                    i !== results.length - 1 && "border-b border-gray-50",
                  )}
                >
                  {/* Avatar initial chip */}
                  <span
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center",
                      "text-xs font-semibold flex-shrink-0",
                      avatarColour(c.lastName),
                    )}
                  >
                    {initials(c.firstName, c.lastName)}
                  </span>

                  {/* Name + meta */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.firstName} {c.lastName}
                    </p>
                    {(c.position || c.company) && (
                      <p className="text-xs text-gray-500 truncate">
                        {[c.position, c.company].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* Footer hint */}
          {results.length > 0 && (
            <div className="px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400">
              ↵ to open · ↑↓ navigate · Esc close
            </div>
          )}
        </div>
      )}
    </div>
  )
}
