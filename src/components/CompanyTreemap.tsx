"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import type { Company } from "@/app/companies/page"

// ── Layout ────────────────────────────────────────────────────────────────────

type LayoutItem = { count: number; [key: string]: unknown }

function binaryPartition<T extends LayoutItem>(
  items: T[],
  x: number, y: number, w: number, h: number
): (T & { x: number; y: number; w: number; h: number })[] {
  if (items.length === 0 || w < 1 || h < 1) return []
  if (items.length === 1) return [{ ...items[0], x, y, w, h }]

  const total = items.reduce((s, i) => s + i.count, 0)
  if (total === 0) return []

  let cum = 0
  let split = items.length - 1
  for (let i = 0; i < items.length - 1; i++) {
    cum += items[i].count
    if (cum * 2 >= total) { split = i + 1; break }
  }

  const left = items.slice(0, split)
  const right = items.slice(split)
  const ratio = left.reduce((s, i) => s + i.count, 0) / total

  if (w > h) {
    const lw = w * ratio
    return [
      ...binaryPartition(left, x, y, lw, h),
      ...binaryPartition(right, x + lw, y, w - lw, h),
    ]
  } else {
    const th = h * ratio
    return [
      ...binaryPartition(left, x, y, w, th),
      ...binaryPartition(right, x, y + th, w, h - th),
    ]
  }
}

// ── Colors ────────────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { fill: string; label: string }> = {
  "brand":       { fill: "#8b5cf6", label: "Brand"       },
  "non-brand":   { fill: "#10b981", label: "Non-brand"   },
  "independent": { fill: "#f59e0b", label: "Independent" },
  "untagged":    { fill: "#94a3b8", label: "Untagged"    },
}

const TYPE_ORDER = ["brand", "non-brand", "independent", "untagged"]

const COUNTRY_ABBR: Record<string, string> = {
  "United States":       "USA",
  "United Kingdom":      "UK",
  "United Arab Emirates": "UAE",
  "South Africa":        "S. Africa",
}

// ── Component ─────────────────────────────────────────────────────────────────

const LABEL_H = 20   // px reserved for country name at top of each group
const PAD     =  2   // px gap between country boundary and its children

type Cell = {
  name: string
  count: number
  type: string | null
  country: string
  x: number; y: number; w: number; h: number
}

type CountryGroup = {
  country: string
  total: number
  x: number; y: number; w: number; h: number
  cells: Cell[]
}

export default function CompanyTreemap({
  companies,
  height = 520,
  onCompanyClick,
}: {
  companies: Company[]
  height?: number
  onCompanyClick?: (name: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hovered, setHovered] = useState<string | null>(null)

  // Measure container width (ResizeObserver)
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerW(Math.floor(w))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Which types actually appear in this company set
  const typesInData = useMemo(() => {
    const s = new Set<string>()
    for (const c of companies) if (!c.ignored) s.add(c.type ?? "untagged")
    return [...s].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b))
  }, [companies])

  // Toggle a type
  function toggle(t: string) {
    setHidden(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }

  // Build layout
  const groups = useMemo((): CountryGroup[] => {
    if (containerW < 20) return []

    // Filter out ignored + hidden-type companies
    const active = companies.filter(c => !c.ignored && !hidden.has(c.type ?? "untagged"))
    if (active.length === 0) return []

    // Group by country
    const byCountry = new Map<string, Company[]>()
    for (const c of active) {
      const key = (c as Company & { country?: string | null }).country ?? "Other"
      if (!byCountry.has(key)) byCountry.set(key, [])
      byCountry.get(key)!.push(c)
    }

    // Country items sorted by total count desc
    const countryItems = [...byCountry.entries()]
      .map(([country, cs]) => ({
        country,
        count: cs.reduce((s, c) => s + c.count, 0),
        companies: [...cs].sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count)

    // Layout country boxes
    const countryBoxes = binaryPartition(countryItems, 0, 0, containerW, height)

    return countryBoxes.map(box => {
      const innerX = box.x + PAD
      const innerY = box.y + PAD + LABEL_H
      const innerW = box.w - PAD * 2
      const innerH = box.h - PAD * 2 - LABEL_H

      const cells: Cell[] = innerW > 4 && innerH > 4
        ? binaryPartition(
            box.companies.map(c => ({
              name: c.name, count: c.count, type: c.type,
            })),
            innerX, innerY, innerW, innerH
          ).map(cc => ({ ...cc, country: box.country }))
        : []

      return { country: box.country, total: box.count, x: box.x, y: box.y, w: box.w, h: box.h, cells }
    })
  }, [companies, containerW, height, hidden])

  return (
    <div className="flex flex-col gap-3">
      {/* ── Legend / toggle ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-400">Show:</span>
        {typesInData.map(t => {
          const s = TYPE_STYLE[t] ?? TYPE_STYLE.untagged
          const off = hidden.has(t)
          return (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all duration-150",
                off
                  ? "opacity-40 bg-white border-gray-200 text-gray-400"
                  : "text-white border-transparent"
              )}
              style={off ? {} : { backgroundColor: s.fill }}
            >
              <span
                className="w-2 h-2 rounded-[2px] shrink-0"
                style={{ backgroundColor: off ? "#d1d5db" : "rgba(255,255,255,0.5)" }}
              />
              {s.label}
            </button>
          )
        })}
        {hidden.size > 0 && (
          <button
            onClick={() => setHidden(new Set())}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
          >
            Show all
          </button>
        )}
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200"
        style={{ height }}
      >
        {containerW > 0 && groups.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            No companies visible — adjust the legend or filters.
          </div>
        )}

        {groups.map(g => {
          const abbr = COUNTRY_ABBR[g.country] ?? g.country
          return (
            <div key={g.country}>
              {/* Country background */}
              <div
                className="absolute rounded-lg bg-white/60 border border-gray-200 pointer-events-none"
                style={{ left: g.x + 1, top: g.y + 1, width: g.w - 2, height: g.h - 2 }}
              />

              {/* Country label */}
              <div
                className="absolute pointer-events-none z-10 flex items-baseline gap-1 overflow-hidden"
                style={{ left: g.x + PAD + 5, top: g.y + PAD + 2, right: g.x + g.w - PAD - 4 }}
              >
                <span className="text-[11px] font-bold text-gray-600 leading-none truncate">
                  {abbr}
                </span>
                <span className="text-[9px] text-gray-400 leading-none shrink-0">
                  {g.total}
                </span>
              </div>

              {/* Company cells */}
              {g.cells.map(cell => {
                const s = TYPE_STYLE[cell.type ?? "untagged"] ?? TYPE_STYLE.untagged
                const isHov = hovered === cell.name
                const cw = Math.max(0, cell.w - 2)
                const ch = Math.max(0, cell.h - 2)
                const showName  = cw > 38 && ch > 18
                const showCount = cw > 52 && ch > 32

                return (
                  <div
                    key={cell.name}
                    className="absolute cursor-pointer rounded-[3px] overflow-hidden transition-all duration-75"
                    style={{
                      left:            cell.x + 1,
                      top:             cell.y + 1,
                      width:           cw,
                      height:          ch,
                      backgroundColor: s.fill,
                      opacity:         isHov ? 1 : 0.80,
                      zIndex:          isHov ? 20 : 1,
                      boxShadow:       isHov ? `0 0 0 2px #fff, 0 0 0 3.5px ${s.fill}` : undefined,
                    }}
                    onMouseEnter={() => setHovered(cell.name)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onCompanyClick?.(cell.name)}
                    title={`${cell.name} — ${cell.count} contact${cell.count !== 1 ? "s" : ""}`}
                  >
                    {showName && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-1 overflow-hidden gap-0.5">
                        <span
                          className="font-semibold leading-tight text-center w-full truncate text-white"
                          style={{ fontSize: Math.min(12, Math.max(8, Math.floor(cw / 9))) }}
                        >
                          {cell.name}
                        </span>
                        {showCount && (
                          <span className="text-[9px] text-white/70 leading-none">
                            {cell.count}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* ── Key (type → color reference) ─────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap px-1">
        {typesInData.filter(t => !hidden.has(t)).map(t => {
          const s = TYPE_STYLE[t] ?? TYPE_STYLE.untagged
          const cnt = companies.filter(c => !c.ignored && (c.type ?? "untagged") === t)
                               .reduce((sum, c) => sum + c.count, 0)
          return (
            <div key={t} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] inline-block shrink-0" style={{ backgroundColor: s.fill }} />
              <span className="text-[11px] text-gray-500">{s.label}</span>
              <span className="text-[10px] text-gray-400">({cnt})</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
