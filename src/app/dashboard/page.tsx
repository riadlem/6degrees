"use client"

import { useEffect, useState, useRef, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { STALE } from "@/lib/query-client"
import { createPortal } from "react-dom"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { X, Download, Maximize2 } from "lucide-react"
import { cn, initials } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  totalContacts: number
  totalCompanies: number
  preferredCount: number
  partnerCount: number
}

type YearBucket = { year: number; count: number }

type DashboardCompany = {
  name: string
  domain: string | null
}

// ─── Treemap shared ───────────────────────────────────────────────────────────

const PALETTE = [
  "#6366F1", "#0EA5E9", "#14B8A6", "#F97316", "#EC4899",
  "#EF4444", "#06B6D4", "#84CC16", "#A855F7", "#64748B",
]

function binaryLayout<T extends { count: number }>(
  items: T[],
  x: number,
  y: number,
  w: number,
  h: number,
): Array<T & { x: number; y: number; w: number; h: number }> {
  if (items.length === 0) return []
  if (items.length === 1) return [{ ...items[0], x, y, w, h }]
  const total = items.reduce((s, i) => s + i.count, 0)
  let acc = 0, split = 1
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i].count
    split = i + 1
    if (acc * 2 >= total) break
  }
  const ratio = items.slice(0, split).reduce((s, i) => s + i.count, 0) / total
  if (w >= h) {
    const w1 = w * ratio
    return [
      ...binaryLayout(items.slice(0, split), x, y, w1, h),
      ...binaryLayout(items.slice(split), x + w1, y, w - w1, h),
    ]
  } else {
    const h1 = h * ratio
    return [
      ...binaryLayout(items.slice(0, split), x, y, w, h1),
      ...binaryLayout(items.slice(split), x, y + h1, w, h - h1),
    ]
  }
}

// ─── Company Treemap ──────────────────────────────────────────────────────────

type TreemapItem = {
  name: string
  count: number
  isPartner: boolean
  type: string | null
  subsidiaries: string[]
}

type TypeKey = "partner" | "brand" | "non-brand" | "independent" | "untagged"

const TYPE_LEGEND: { key: TypeKey; color: string; label: string }[] = [
  { key: "partner",     color: "#2563EB", label: "Partner" },
  { key: "brand",       color: "#7C3AED", label: "Brand" },
  { key: "non-brand",   color: "#059669", label: "Non-brand" },
  { key: "independent", color: "#D97706", label: "Independent" },
  { key: "untagged",    color: "#6366F1", label: "Untagged" },
]

function getTypeKey(item: TreemapItem): TypeKey {
  if (item.isPartner)              return "partner"
  if (item.type === "brand")       return "brand"
  if (item.type === "non-brand")   return "non-brand"
  if (item.type === "independent") return "independent"
  return "untagged"
}

function colorForCompany(item: TreemapItem): string {
  const key = getTypeKey(item)
  const found = TYPE_LEGEND.find((l) => l.key === key)
  if (found && key !== "untagged") return found.color
  let h = 0
  for (let i = 0; i < item.name.length; i++) h = (h * 31 + item.name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function CompanyTreemap({
  data,
  domainMap = {},
  height = 800,
  onExpand,
}: {
  data: TreemapItem[]
  domainMap?: Record<string, string>
  height?: number | string
  onExpand?: () => void
}) {
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [logos, setLogos] = useState<Record<string, string>>({})
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set())

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setDims({ w: e.contentRect.width, h: e.contentRect.height })
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!data.length) return
    setFailedLogos(new Set())
    const urls: Record<string, string> = {}
    for (const { name } of data) {
      const domain =
        domainMap[name] ??
        name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) + ".com"
      urls[name] = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    }
    setLogos(urls)
  }, [data, domainMap])

  const cells = useMemo(
    () => (dims.w > 0 && dims.h > 0 ? binaryLayout(data, 0, 0, dims.w, dims.h) : []),
    [data, dims],
  )

  function handleExport() {
    if (!cells.length || !dims.w || !dims.h) return
    const dpr = window.devicePixelRatio || 1
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(dims.w * dpr)
    canvas.height = Math.round(dims.h * dpr)
    const ctx = canvas.getContext("2d")!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = "#F3F4F6"
    ctx.fillRect(0, 0, dims.w, dims.h)
    for (const cell of cells) {
      const cw = cell.w - 2, ch = cell.h - 2, cx = cell.x + 1, cy = cell.y + 1
      const color = colorForCompany(cell)
      ctx.fillStyle = "#ffffff"
      ctx.beginPath()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((ctx as any).roundRect) (ctx as any).roundRect(cx, cy, cw, ch, 4)
      else ctx.rect(cx, cy, cw, ch)
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((ctx as any).roundRect) (ctx as any).roundRect(cx, cy, cw, ch, 4)
      else ctx.rect(cx, cy, cw, ch)
      ctx.stroke()
      if (cw > 48 && ch > 32) {
        ctx.fillStyle = "#6B7280"
        ctx.font = "500 8px system-ui,sans-serif"
        ctx.textAlign = "right"
        ctx.textBaseline = "alphabetic"
        ctx.fillText(cell.name, cx + cw - 4, cy + ch - 14, cw - 8)
        ctx.fillStyle = color
        ctx.font = "700 9px system-ui,sans-serif"
        ctx.fillText(String(cell.count), cx + cw - 4, cy + ch - 3, cw - 8)
      }
    }
    const a = document.createElement("a")
    a.download = "6degrees-treemap.png"
    a.href = canvas.toDataURL("image/png")
    a.click()
  }

  return (
    <div className="relative" style={{ height }}>
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={handleExport}
          title="Export PNG"
          className="text-gray-500 hover:text-gray-700 bg-white/90 hover:bg-white border border-gray-200 rounded p-1 transition-colors shadow-sm"
        >
          <Download size={13} />
        </button>
        {onExpand && (
          <button
            onClick={onExpand}
            title="Full screen"
            className="text-gray-500 hover:text-gray-700 bg-white/90 hover:bg-white border border-gray-200 rounded p-1 transition-colors shadow-sm"
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>

      <div ref={ref} className="relative w-full h-full rounded-xl overflow-hidden bg-gray-100">
        {cells.map((cell) => {
          const logo = !failedLogos.has(cell.name) ? logos[cell.name] : undefined
          const cellW = cell.w - 2, cellH = cell.h - 2
          const showLogo = cellW > 36 && cellH > 36
          const showText = cellW > 48 && cellH > 32
          const showName = cellW > 64 && cellH > 44
          const color = colorForCompany(cell)

          // Logo fills as much of the cell as possible, leaving room for the text row
          const logoAreaH = showText ? cellH - 26 : cellH - 4
          const logoSize = Math.max(12, Math.min(cellW - 10, logoAreaH - 6, 80))

          return (
            <button
              key={cell.name}
              title={`${cell.name}: ${cell.count} contacts${
                cell.subsidiaries.length > 0
                  ? ` (incl. ${cell.subsidiaries.join(", ")})`
                  : ""
              }`}
              onClick={() =>
                router.push(`/contacts?company=${encodeURIComponent(cell.name)}`)
              }
              style={{
                position: "absolute",
                left: cell.x + 1,
                top: cell.y + 1,
                width: cellW,
                height: cellH,
                backgroundColor: "#ffffff",
                border: `2px solid ${color}`,
              }}
              className="rounded overflow-hidden relative hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              {/* Logo — centered in the upper area of the cell */}
              {showLogo && (
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: showText ? 26 : 0,
                  }}
                >
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logo}
                      alt=""
                      style={{ width: logoSize, height: logoSize }}
                      className="object-contain"
                      onError={() =>
                        setFailedLogos((prev) => new Set([...prev, cell.name]))
                      }
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: Math.max(10, Math.min(logoSize * 0.5, 28)),
                        color,
                      }}
                      className="font-bold"
                    >
                      {initials(
                        cell.name.split(" ")[0] ?? "",
                        cell.name.split(" ")[1] ?? "",
                      )}
                    </span>
                  )}
                </div>
              )}

              {/* Name + count — bottom-right corner */}
              {showText && (
                <div
                  className="absolute bottom-1 right-1.5 text-right"
                  style={{ maxWidth: cellW - 4 }}
                >
                  {showName && (
                    <p className="text-[8px] font-medium text-gray-500 truncate leading-tight">
                      {cell.name}
                    </p>
                  )}
                  <p
                    className="text-[10px] font-bold leading-none"
                    style={{ color }}
                  >
                    {cell.count}
                  </p>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Country Treemap ──────────────────────────────────────────────────────────

type CountryItem = { name: string; count: number }

const COUNTRY_CODES: Record<string, string> = {
  "Afghanistan": "AF", "Albania": "AL", "Algeria": "DZ", "Andorra": "AD",
  "Angola": "AO", "Argentina": "AR", "Armenia": "AM", "Australia": "AU",
  "Austria": "AT", "Azerbaijan": "AZ", "Bangladesh": "BD", "Belgium": "BE",
  "Bolivia": "BO", "Bosnia and Herzegovina": "BA", "Brazil": "BR",
  "Bulgaria": "BG", "Cambodia": "KH", "Cameroon": "CM", "Canada": "CA",
  "Chile": "CL", "China": "CN", "Colombia": "CO", "Costa Rica": "CR",
  "Croatia": "HR", "Cuba": "CU", "Czech Republic": "CZ", "Denmark": "DK",
  "Dominican Republic": "DO", "Ecuador": "EC", "Egypt": "EG",
  "El Salvador": "SV", "Estonia": "EE", "Ethiopia": "ET", "Finland": "FI",
  "France": "FR", "Georgia": "GE", "Germany": "DE", "Ghana": "GH",
  "Greece": "GR", "Guatemala": "GT", "Honduras": "HN", "Hong Kong": "HK",
  "Hungary": "HU", "Iceland": "IS", "India": "IN", "Indonesia": "ID",
  "Iran": "IR", "Iraq": "IQ", "Ireland": "IE", "Israel": "IL", "Italy": "IT",
  "Jamaica": "JM", "Japan": "JP", "Jordan": "JO", "Kazakhstan": "KZ",
  "Kenya": "KE", "Kuwait": "KW", "Latvia": "LV", "Lebanon": "LB",
  "Lithuania": "LT", "Luxembourg": "LU", "Malaysia": "MY", "Malta": "MT",
  "Mexico": "MX", "Moldova": "MD", "Morocco": "MA", "Myanmar": "MM",
  "Netherlands": "NL", "New Zealand": "NZ", "Nicaragua": "NI", "Nigeria": "NG",
  "North Macedonia": "MK", "Norway": "NO", "Pakistan": "PK", "Panama": "PA",
  "Paraguay": "PY", "Peru": "PE", "Philippines": "PH", "Poland": "PL",
  "Portugal": "PT", "Qatar": "QA", "Romania": "RO", "Russia": "RU",
  "Saudi Arabia": "SA", "Senegal": "SN", "Serbia": "RS", "Singapore": "SG",
  "Slovakia": "SK", "Slovenia": "SI", "South Africa": "ZA",
  "South Korea": "KR", "Spain": "ES", "Sri Lanka": "LK", "Sweden": "SE",
  "Switzerland": "CH", "Taiwan": "TW", "Tanzania": "TZ", "Thailand": "TH",
  "Trinidad and Tobago": "TT", "Tunisia": "TN", "Turkey": "TR", "Uganda": "UG",
  "Ukraine": "UA", "United Arab Emirates": "AE", "United Kingdom": "GB",
  "United States": "US", "Uruguay": "UY", "Uzbekistan": "UZ",
  "Venezuela": "VE", "Vietnam": "VN", "Zimbabwe": "ZW",
}

function flagEmoji(countryName: string): string {
  const code = COUNTRY_CODES[countryName]
  if (!code || code.length !== 2) return ""
  return String.fromCodePoint(
    0x1f1e6 + code.charCodeAt(0) - 65,
    0x1f1e6 + code.charCodeAt(1) - 65,
  )
}

function colorForCountry(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function CountryTreemap({
  data,
  height = 800,
  onExpand,
}: {
  data: CountryItem[]
  height?: number | string
  onExpand?: () => void
}) {
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setDims({ w: e.contentRect.width, h: e.contentRect.height })
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cells = useMemo(
    () => (dims.w > 0 && dims.h > 0 ? binaryLayout(data, 0, 0, dims.w, dims.h) : []),
    [data, dims],
  )

  function handleExport() {
    if (!cells.length || !dims.w || !dims.h) return
    const dpr = window.devicePixelRatio || 1
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(dims.w * dpr)
    canvas.height = Math.round(dims.h * dpr)
    const ctx = canvas.getContext("2d")!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = "#F3F4F6"
    ctx.fillRect(0, 0, dims.w, dims.h)
    for (const cell of cells) {
      const cw = cell.w - 2, ch = cell.h - 2, cx = cell.x + 1, cy = cell.y + 1
      const color = colorForCountry(cell.name)
      ctx.fillStyle = "#ffffff"
      ctx.beginPath()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((ctx as any).roundRect) (ctx as any).roundRect(cx, cy, cw, ch, 4)
      else ctx.rect(cx, cy, cw, ch)
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((ctx as any).roundRect) (ctx as any).roundRect(cx, cy, cw, ch, 4)
      else ctx.rect(cx, cy, cw, ch)
      ctx.stroke()
      if (cw > 48 && ch > 32) {
        ctx.fillStyle = "#6B7280"
        ctx.font = "500 8px system-ui,sans-serif"
        ctx.textAlign = "right"
        ctx.textBaseline = "alphabetic"
        ctx.fillText(cell.name, cx + cw - 4, cy + ch - 14, cw - 8)
        ctx.fillStyle = color
        ctx.font = "700 9px system-ui,sans-serif"
        ctx.fillText(String(cell.count), cx + cw - 4, cy + ch - 3, cw - 8)
      }
    }
    const a = document.createElement("a")
    a.download = "6degrees-country-treemap.png"
    a.href = canvas.toDataURL("image/png")
    a.click()
  }

  return (
    <div className="relative" style={{ height }}>
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={handleExport}
          title="Export PNG"
          className="text-gray-500 hover:text-gray-700 bg-white/90 hover:bg-white border border-gray-200 rounded p-1 transition-colors shadow-sm"
        >
          <Download size={13} />
        </button>
        {onExpand && (
          <button
            onClick={onExpand}
            title="Full screen"
            className="text-gray-500 hover:text-gray-700 bg-white/90 hover:bg-white border border-gray-200 rounded p-1 transition-colors shadow-sm"
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>

      <div ref={ref} className="relative w-full h-full rounded-xl overflow-hidden bg-gray-100">
        {cells.map((cell) => {
          const cellW = cell.w - 2, cellH = cell.h - 2
          const showEmoji = cellW > 40 && cellH > 40
          const showText = cellW > 48 && cellH > 32
          const showName = cellW > 64 && cellH > 44
          const color = colorForCountry(cell.name)
          const flag = flagEmoji(cell.name)

          const emojiAreaH = showText ? cellH - 26 : cellH - 4
          // Scale emoji to fill most of the cell
          const emojiFontSize = Math.max(14, Math.min(cellW * 0.55, emojiAreaH * 0.7, 72))

          return (
            <button
              key={cell.name}
              title={`${cell.name}: ${cell.count} contacts`}
              onClick={() =>
                router.push(`/contacts?country=${encodeURIComponent(cell.name)}`)
              }
              style={{
                position: "absolute",
                left: cell.x + 1,
                top: cell.y + 1,
                width: cellW,
                height: cellH,
                backgroundColor: "#ffffff",
                border: `2px solid ${color}`,
              }}
              className="rounded overflow-hidden relative hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              {/* Flag emoji or country code initials */}
              {showEmoji && (
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: showText ? 26 : 0,
                  }}
                >
                  {flag ? (
                    <span style={{ fontSize: emojiFontSize, lineHeight: 1 }}>
                      {flag}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: Math.max(10, Math.min(emojiFontSize * 0.45, 24)),
                        color,
                      }}
                      className="font-bold"
                    >
                      {cell.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              )}

              {/* Name + count — bottom-right corner */}
              {showText && (
                <div
                  className="absolute bottom-1 right-1.5 text-right"
                  style={{ maxWidth: cellW - 4 }}
                >
                  {showName && (
                    <p className="text-[8px] font-medium text-gray-500 truncate leading-tight">
                      {cell.name}
                    </p>
                  )}
                  <p
                    className="text-[10px] font-bold leading-none"
                    style={{ color }}
                  >
                    {cell.count}
                  </p>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Utility components ───────────────────────────────────────────────────────

function ConnectionYearChart({
  years,
  className,
}: {
  years: YearBucket[]
  className?: string
}) {
  const max = Math.max(...years.map((y) => y.count), 1)
  return (
    <div
      className={cn(
        "bg-white border border-gray-200 rounded-xl px-4 pt-3 pb-4",
        className,
      )}
    >
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Connections by year
      </p>
      <div className="flex items-end gap-1.5 h-20">
        {years.map(({ year, count }) => (
          <div
            key={year}
            className="flex flex-col items-center gap-1 flex-1 min-w-0"
          >
            <span className="text-[10px] text-gray-500 font-medium leading-none">
              {count}
            </span>
            <div
              className="w-full rounded-t-sm bg-blue-500 hover:bg-blue-600 transition-colors"
              style={{ height: `${Math.max(4, (count / max) * 52)}px` }}
              title={`${count} connection${count !== 1 ? "s" : ""} in ${year}`}
            />
            <span className="text-[10px] text-gray-400 leading-none">
              {String(year).slice(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: number
  sub?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const userId = session?.user?.id
  const [minThreshold, setMinThreshold] = useState(2)
  const [enabledTypes, setEnabledTypes] = useState<Set<TypeKey>>(
    () =>
      new Set<TypeKey>([
        "partner",
        "brand",
        "non-brand",
        "untagged",
      ]),
  )
  const [fullscreen, setFullscreen] = useState(false)
  const [countryFullscreen, setCountryFullscreen] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const { data: dashData, isLoading: dashLoading } = useQuery<{
    stats: Stats
    companies: DashboardCompany[]
    connectionYears: YearBucket[]
  }>({
    queryKey: ["dashboard", userId],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
    enabled: status === "authenticated",
    staleTime: STALE.dashboard,
  })

  const { data: treemapRaw, isLoading: tmLoading } = useQuery<{
    companies: TreemapItem[]
  }>({
    queryKey: ["treemap", userId],
    queryFn: () => fetch("/api/contacts/treemap?min=1").then((r) => r.json()),
    enabled: status === "authenticated",
    staleTime: STALE.dashboard,
  })

  const { data: countryRaw, isLoading: countryLoading } = useQuery<{
    countries: CountryItem[]
  }>({
    queryKey: ["countries", userId],
    queryFn: () => fetch("/api/contacts/countries").then((r) => r.json()),
    enabled: status === "authenticated",
    staleTime: 5 * 60 * 1000,
  })

  const stats = dashData?.stats ?? null
  const companies = dashData?.companies ?? []
  const connectionYears = dashData?.connectionYears ?? []
  const allTreemapData = treemapRaw?.companies ?? []
  const allCountryData = countryRaw?.countries ?? []
  const loading = dashLoading || tmLoading || countryLoading

  function toggleType(key: TypeKey) {
    setEnabledTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const treemapData = allTreemapData
    .filter((c) => c.count >= minThreshold)
    .filter((c) => enabledTypes.has(getTypeKey(c)))

  const domainMap = Object.fromEntries(
    companies.filter((c) => c.domain).map((c) => [c.name, c.domain!]),
  )

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {session?.user?.name}&apos;s network overview
        </p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total contacts" value={stats.totalContacts} />
          <StatCard label="Companies" value={stats.totalCompanies} />
          <StatCard
            label="Preferred"
            value={stats.preferredCount}
            sub="companies starred"
          />
          <StatCard
            label="Partners"
            value={stats.partnerCount}
            sub="companies tagged"
          />
        </div>
      )}

      {/* Connection-year distribution */}
      {connectionYears.length > 0 && (
        <ConnectionYearChart years={connectionYears} className="mb-6" />
      )}

      {/* Company treemap */}
      {allTreemapData.length > 0 && (
        <div className="mb-8">
          {/* Header row */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Contacts by company{" "}
              <span className="normal-case font-normal text-gray-300">
                (tap to filter)
              </span>
            </p>
            <label className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
              <span>Min.</span>
              <input
                type="range"
                min={1}
                max={20}
                value={minThreshold}
                onChange={(e) => setMinThreshold(Number(e.target.value))}
                className="w-20 h-1.5 accent-blue-500"
              />
              <span className="w-4 text-center font-semibold text-gray-700">
                {minThreshold}
              </span>
              <span className="text-gray-400">contacts</span>
            </label>
          </div>

          {treemapData.length > 0 ? (
            <CompanyTreemap
              data={treemapData}
              domainMap={domainMap}
              onExpand={() => setFullscreen(true)}
            />
          ) : (
            <div className="flex items-center justify-center h-24 rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
              No companies above threshold
            </div>
          )}

          {/* Type label selectors */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {TYPE_LEGEND.map(({ key, color, label }) => {
              const active = enabledTypes.has(key)
              return (
                <button
                  key={key}
                  onClick={() => toggleType(key)}
                  style={{ borderColor: active ? color : "#E5E7EB" }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all cursor-pointer select-none",
                    active ? "text-gray-700" : "text-gray-300",
                  )}
                >
                  <div
                    className="w-2 h-2 rounded-sm shrink-0 transition-colors"
                    style={{
                      backgroundColor: active ? color : "transparent",
                      border: `1.5px solid ${active ? color : "#D1D5DB"}`,
                    }}
                  />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Country treemap */}
      {allCountryData.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Contacts by country{" "}
              <span className="normal-case font-normal text-gray-300">
                (tap to filter)
              </span>
            </p>
          </div>
          <CountryTreemap
            data={allCountryData}
            onExpand={() => setCountryFullscreen(true)}
          />
        </div>
      )}

      {/* Company treemap fullscreen */}
      {fullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 shrink-0">
              <span className="text-white font-semibold text-sm">Company Map</span>
              <button
                onClick={() => setFullscreen(false)}
                className="text-white/70 hover:text-white p-1.5 rounded hover:bg-white/10 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <CompanyTreemap
                data={treemapData}
                domainMap={domainMap}
                height="100%"
              />
            </div>
            <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
              {TYPE_LEGEND.map(({ key, color, label }) => {
                const active = enabledTypes.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleType(key)}
                    style={{ borderColor: active ? color : "#374151" }}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] transition-all",
                      active ? "text-gray-200" : "text-gray-500",
                    )}
                  >
                    <div
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{
                        backgroundColor: active ? color : "transparent",
                        border: `1.5px solid ${active ? color : "#4B5563"}`,
                      }}
                    />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}

      {/* Country treemap fullscreen */}
      {countryFullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 shrink-0">
              <span className="text-white font-semibold text-sm">Country Map</span>
              <button
                onClick={() => setCountryFullscreen(false)}
                className="text-white/70 hover:text-white p-1.5 rounded hover:bg-white/10 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <CountryTreemap data={allCountryData} height="100%" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
