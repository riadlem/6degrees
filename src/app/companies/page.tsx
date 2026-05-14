"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Star, Users, ChevronDown, ChevronUp, Search, X, EyeOff } from "lucide-react"
import { cn, initials } from "@/lib/utils"
import ContactRow from "@/components/ContactRow"
import ContactDetail from "@/components/ContactDetail"
import AddToListModal from "@/components/AddToListModal"
import { type ContactSummary } from "@/components/ContactCard"

type Company = {
  name: string
  count: number
  preferred: boolean
  ignored: boolean
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

function CompanyRow({
  company,
  onSetStatus,
  onContactClick,
  onAddToList,
}: {
  company: Company
  onSetStatus: (name: string, status: "preferred" | "ignored" | "none") => void
  onContactClick: (id: string) => void
  onAddToList: (contacts: ContactSummary[]) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [contacts, setContacts] = useState<ContactSummary[] | null>(null)
  const [loading, setLoading] = useState(false)

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

  const starStatus = company.preferred ? "none" : "preferred"
  const ignoreStatus = company.ignored ? "none" : "ignored"

  return (
    <div className={cn(
      "border rounded-xl overflow-hidden transition-colors",
      company.preferred ? "border-amber-300 bg-amber-50/30" :
      company.ignored   ? "border-gray-200 bg-gray-50/50 opacity-60" :
                          "border-gray-200 bg-white"
    )}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={expand}
      >
        {/* Star */}
        <button
          onClick={(e) => { e.stopPropagation(); onSetStatus(company.name, starStatus) }}
          className={cn("shrink-0 transition-colors", company.preferred ? "text-amber-400 hover:text-amber-500" : "text-gray-300 hover:text-amber-400")}
          title={company.preferred ? "Remove from preferred" : "Mark as preferred"}
        >
          <Star size={16} fill={company.preferred ? "currentColor" : "none"} />
        </button>

        {/* Name + industry */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 text-sm truncate">{company.name}</p>
            {company.preferred && (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-100 rounded-full px-1.5 py-0.5 shrink-0">preferred</span>
            )}
            {company.ignored && (
              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 shrink-0">ignored</span>
            )}
          </div>
          {company.industry && (
            <p className="text-xs text-gray-400 truncate">{company.industry}</p>
          )}
        </div>

        {/* Avatar stack */}
        <div className="hidden sm:block">
          <AvatarStack photos={company.photos} name={company.name} count={company.count} />
        </div>

        {/* Expand toggle */}
        <div className="shrink-0 text-gray-400 sm:hidden">
          <span className="text-xs text-gray-500 mr-1">{company.count}</span>
          <Users size={14} className="inline" />
        </div>

        {/* Ignore button */}
        <button
          onClick={(e) => { e.stopPropagation(); onSetStatus(company.name, ignoreStatus) }}
          className={cn("shrink-0 transition-colors", company.ignored ? "text-gray-400 hover:text-gray-600" : "text-gray-200 hover:text-gray-400")}
          title={company.ignored ? "Unignore" : "Ignore company"}
        >
          <EyeOff size={15} />
        </button>

        <div className="shrink-0 text-gray-400 ml-1">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
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
  const [showIgnored, setShowIgnored] = useState(false)
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
    // Optimistic update
    setCompanies((prev) => {
      const updated = prev.map((c) => {
        if (c.name !== name) return c
        return {
          ...c,
          preferred: newStatus === "preferred",
          ignored:   newStatus === "ignored",
        }
      })
      updated.sort((a, b) => {
        if (a.ignored  !== b.ignored)  return a.ignored  ? 1 : -1
        if (a.preferred !== b.preferred) return a.preferred ? -1 : 1
        return b.count - a.count
      })
      return updated
    })

    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: name, status: newStatus }),
    })

    if (!res.ok) {
      // Revert: reload from server
      load()
    }
  }

  const filtered = q
    ? companies.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.industry?.toLowerCase().includes(q.toLowerCase()))
    : companies

  const preferred = filtered.filter((c) => c.preferred)
  const neutral   = filtered.filter((c) => !c.preferred && !c.ignored)
  const ignored   = filtered.filter((c) => c.ignored)

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
            {ignored.length > 0 && (
              <span className="ml-1 text-gray-400">({ignored.length} ignored)</span>
            )}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
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

      {companies.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          No companies yet — sync your LinkedIn contacts first.
        </div>
      ) : filtered.filter((c) => !c.ignored).length === 0 && !showIgnored ? (
        <div className="text-center py-20 text-gray-400 text-sm">No companies match &ldquo;{q}&rdquo;</div>
      ) : (
        <div className="space-y-3">
          {/* Preferred section */}
          {preferred.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
                <Star size={11} fill="currentColor" /> Preferred
              </p>
              {preferred.map((c) => (
                <CompanyRow
                  key={c.name}
                  company={c}
                  onSetStatus={setStatus}
                  onContactClick={setActiveContactId}
                  onAddToList={setAddToListContacts}
                />
              ))}
            </div>
          )}

          {/* Neutral companies */}
          {neutral.length > 0 && (
            <div className="space-y-2">
              {preferred.length > 0 && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4">All companies</p>
              )}
              {neutral.map((c) => (
                <CompanyRow
                  key={c.name}
                  company={c}
                  onSetStatus={setStatus}
                  onContactClick={setActiveContactId}
                  onAddToList={setAddToListContacts}
                />
              ))}
            </div>
          )}

          {/* Ignored section */}
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
                <CompanyRow
                  key={c.name}
                  company={c}
                  onSetStatus={setStatus}
                  onContactClick={setActiveContactId}
                  onAddToList={setAddToListContacts}
                />
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
