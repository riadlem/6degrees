"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Star, Handshake, Users, Building2, ChevronDown, ChevronUp, X } from "lucide-react"
import { cn, initials } from "@/lib/utils"
import { labelColors } from "@/lib/label-colors"
import ContactDetail from "@/components/ContactDetail"

type CompanySize = "small" | "medium" | "corporate" | "fortune500"

const SIZE_LABELS: Record<CompanySize, string> = {
  small:      "Small",
  medium:     "Medium",
  corporate:  "Corporate",
  fortune500: "Fortune 500",
}
const SIZE_COLORS: Record<CompanySize, string> = {
  small:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium:     "bg-sky-50 text-sky-700 border-sky-200",
  corporate:  "bg-violet-50 text-violet-700 border-violet-200",
  fortune500: "bg-amber-50 text-amber-700 border-amber-200",
}

type LabelSummary = { id: string; name: string; color: string }

type ContactSnippet = {
  id: string
  firstName: string
  lastName: string
  position: string | null
  company: string | null
  photoUrl: string | null
  headline: string | null
  profileUrl: string | null
  labels: { label: LabelSummary }[]
}

type DashboardCompany = {
  name: string
  count: number
  preferred: boolean
  isPartner: boolean
  size: string | null
  industry: string | null
  photos: string[]
  contacts: ContactSnippet[]
}

type Stats = {
  totalContacts: number
  totalCompanies: number
  preferredCount: number
  partnerCount: number
}

const SIZE_OPTIONS: { value: CompanySize; label: string }[] = [
  { value: "small",      label: "Small" },
  { value: "medium",     label: "Medium" },
  { value: "corporate",  label: "Corporate" },
  { value: "fortune500", label: "Fortune 500" },
]

function ContactAvatar({ contact }: { contact: ContactSnippet }) {
  const inits = initials(contact.firstName, contact.lastName)
  if (contact.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={contact.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-gray-100 shrink-0" />
    )
  }
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-semibold shrink-0">
      {inits}
    </div>
  )
}

function CompanyCard({
  company,
  onContactClick,
}: {
  company: DashboardCompany
  onContactClick: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const size = company.size as CompanySize | null
  const inits = initials(company.name.split(" ")[0] ?? company.name, company.name.split(" ")[1] ?? "")

  return (
    <div className={cn(
      "border rounded-xl overflow-hidden bg-white",
      company.isPartner && company.preferred ? "border-blue-300" :
      company.isPartner ? "border-blue-200" :
      company.preferred ? "border-amber-300" :
      "border-gray-200"
    )}>
      {/* Company header */}
      <div className="px-4 py-3 border-b border-gray-50">
        <div className="flex items-start gap-3">
          {/* Company avatar from first contact photo */}
          <div className="shrink-0">
            {company.photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.photos[0]} alt="" className="w-9 h-9 rounded-full object-cover border border-gray-100" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white text-xs font-bold">
                {inits}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm">{company.name}</span>
              {company.isPartner && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 bg-blue-100 rounded-full px-1.5 py-0.5">
                  <Handshake size={9} /> Partner
                </span>
              )}
              {company.preferred && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-100 rounded-full px-1.5 py-0.5">
                  <Star size={9} fill="currentColor" /> Preferred
                </span>
              )}
              {size && (
                <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 border", SIZE_COLORS[size])}>
                  {SIZE_LABELS[size]}
                </span>
              )}
            </div>
            {company.industry && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{company.industry}</p>
            )}
          </div>
          <span className="shrink-0 text-xs text-gray-400 flex items-center gap-1">
            <Users size={11} /> {company.count}
          </span>
        </div>
      </div>

      {/* Top contacts */}
      <div className="divide-y divide-gray-50">
        {company.contacts.slice(0, expanded ? undefined : 3).map((c) => (
          <button
            key={c.id}
            onClick={() => onContactClick(c.id)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
          >
            <ContactAvatar contact={c} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {c.firstName} {c.lastName}
              </p>
              <p className="text-xs text-gray-400 truncate">{c.position ?? c.headline ?? ""}</p>
            </div>
            {c.labels.length > 0 && (
              <div className="flex gap-1 shrink-0">
                {c.labels.slice(0, 2).map(({ label }) => {
                  const col = labelColors(label.color)
                  return (
                    <span key={label.id} className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", col.bg, col.text)}>
                      {label.name}
                    </span>
                  )
                })}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Expand / show all */}
      {company.count > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-50"
        >
          {expanded ? (
            <><ChevronUp size={12} /> Show less</>
          ) : (
            <><ChevronDown size={12} /> {company.count > 5 ? `${company.count - 3} more contacts` : `${company.count - 3} more`}</>
          )}
        </button>
      )}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [stats, setStats] = useState<Stats | null>(null)
  const [companies, setCompanies] = useState<DashboardCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [sizeFilter, setSizeFilter] = useState<CompanySize | null>(null)
  const [partnerOnly, setPartnerOnly] = useState(false)
  const [activeContactId, setActiveContactId] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard")
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
        setCompanies(data.companies)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === "authenticated") load()
  }, [status, load])

  const filtered = companies.filter((c) => {
    if (partnerOnly && !c.isPartner) return false
    if (sizeFilter && c.size !== sizeFilter) return false
    return true
  })

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {session?.user?.name}&apos;s engagement pipeline — contacts at preferred &amp; partner companies
        </p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total contacts" value={stats.totalContacts} />
          <StatCard label="Companies" value={stats.totalCompanies} />
          <StatCard label="Preferred" value={stats.preferredCount} sub="companies starred" />
          <StatCard label="Partners" value={stats.partnerCount} sub="companies tagged" />
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setPartnerOnly((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors",
            partnerOnly ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
          )}
        >
          <Handshake size={12} /> Partners only
          {partnerOnly && <X size={11} className="ml-0.5" />}
        </button>

        {SIZE_OPTIONS.map((opt) => {
          const active = sizeFilter === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setSizeFilter(active ? null : opt.value)}
              className={cn(
                "text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors",
                active ? SIZE_COLORS[opt.value] : "border-gray-200 text-gray-500 hover:bg-gray-50"
              )}
            >
              {opt.label}
              {active && <X size={11} className="inline ml-1" />}
            </button>
          )
        })}

        {(partnerOnly || sizeFilter) && (
          <button
            onClick={() => { setPartnerOnly(false); setSizeFilter(null) }}
            className="text-xs text-gray-400 hover:text-gray-600 ml-1"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Empty states */}
      {companies.length === 0 ? (
        <div className="text-center py-20">
          <Building2 size={40} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-500 font-medium text-sm">No companies tagged yet</p>
          <p className="text-gray-400 text-xs mt-1">
            Go to <a href="/companies" className="text-blue-500 hover:underline">Companies</a> and star or tag companies as partners to see them here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">No companies match your filters.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CompanyCard
              key={c.name}
              company={c}
              onContactClick={setActiveContactId}
            />
          ))}
        </div>
      )}

      <ContactDetail contactId={activeContactId} onClose={() => setActiveContactId(null)} />
    </div>
  )
}
