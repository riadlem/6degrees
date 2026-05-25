"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft, Handshake, Globe, Building2, Network, Users, Check, X, Pencil,
  ExternalLink, Mail, UserPlus, Ban, Clock, ChevronDown, ChevronUp, Link2, Plus, Loader2
} from "lucide-react"
import { cn, initials, formatDate } from "@/lib/utils"
import ContactDetail from "@/components/ContactDetail"
import BulkAssignPopover from "@/components/BulkAssignPopover"
import CompanyLogo from "@/components/CompanyLogo"
import { usePrivacy } from "@/contexts/PrivacyContext"
import Link from "next/link"
import { STATUS_BADGE } from "@/lib/reconnect-status"

type CompanyType = "brand" | "non-brand" | "independent"
type CompanySize = "small" | "medium" | "corporate" | "fortune500"

const SIZE_COLORS: Record<string, string> = {
  small:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium:     "bg-sky-50 text-sky-700 border-sky-200",
  corporate:  "bg-violet-50 text-violet-700 border-violet-200",
  fortune500: "bg-amber-50 text-amber-700 border-amber-200",
}

const TYPE_COLORS: Record<string, string> = {
  "brand":       "bg-violet-50 text-violet-700 border-violet-200",
  "non-brand":   "bg-emerald-50 text-emerald-700 border-emerald-200",
  "independent": "bg-amber-50 text-amber-700 border-amber-200",
}

type CompanyData = {
  name: string
  count: number
  ignored: boolean
  isPartner: boolean
  preferred: boolean
  size: CompanySize | null
  type: CompanyType | null
  parentCompany: string | null
  industry: string | null
  website: string | null
}

type ContactRow = {
  id: string
  firstName: string
  lastName: string
  position: string | null
  company: string | null
  photoUrl: string | null
  emailAddress: string | null
  lastInteractionAt: string | null
  interactionScore: number | null
  outreachStatus: string | null
  profileUrl: string | null
  country: string | null
  industry: string | null
  commonConnections: number | null
  connectedOn: string | null
  labels: { label: { id: string; name: string; color: string } }[]
}

type UnmatchedSender = {
  fromEmail: string
  fromName: string | null
  messageCount: number
  lastSeen: string | null
  suggestions: { contactId: string; name: string }[]
}

const INDUSTRY_CATEGORIES = [
  "Accounting","Aerospace & Defense","Agriculture","Consulting","Construction & Engineering",
  "Education","Energy","Financial Services","Food & Beverages","Healthcare & Pharma",
  "Hospitality & Tourism","Human Resources","Legal","Logistics & Transport","Manufacturing",
  "Marketing & Advertising","Media & Entertainment","Non-Profit","Public Sector",
  "Real Estate","Retail & Luxury","Technology","Telecommunications","Other",
]

const SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "corporate", label: "Corporate" },
  { value: "fortune500", label: "Fortune 500" },
]

const TYPE_OPTIONS = [
  { value: "brand", label: "Brand" },
  { value: "non-brand", label: "Non-brand" },
  { value: "independent", label: "Independent" },
]

function EditableField({
  value,
  placeholder,
  onSave,
  datalist,
  icon: Icon,
  linkify,
  href,
}: {
  value: string | null
  placeholder: string
  onSave: (v: string | null) => void
  datalist?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>
  linkify?: boolean
  href?: (v: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const escapedRef = useRef(false)

  function getSuggestions(q: string): string[] {
    if (!datalist) return []
    const lower = q.toLowerCase().trim()
    if (!lower) return datalist.slice(0, 8)
    return datalist.filter((c) => c.toLowerCase().includes(lower)).slice(0, 8)
  }

  function startEdit() {
    escapedRef.current = false
    setVal(value ?? "")
    setSuggestions(getSuggestions(value ?? ""))
    setEditing(true)
  }

  function save(override?: string) {
    const v = (override ?? val).trim() || null
    onSave(v)
    setEditing(false)
    setSuggestions([])
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setVal(v)
    setSuggestions(getSuggestions(v))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { save(); return }
    if (e.key === "Escape") { escapedRef.current = true; setEditing(false); setSuggestions([]) }
  }

  function handleBlur() {
    // Suggestions use onMouseDown+preventDefault so focus never leaves the input.
    // This blur only fires when the user clicks truly away — save then.
    if (!escapedRef.current) save()
  }

  const isLink = !!(linkify || (href && value))

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className="text-gray-400 shrink-0" />}
        <div className="flex-1 relative">
          <input
            autoFocus
            value={val}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="w-full text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-0.5 max-h-48 overflow-y-auto">
              {suggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault() // keep focus on input so blur doesn't fire
                    save(c)
                  }}
                  className="w-full text-left text-sm px-3 py-1.5 hover:bg-blue-50 text-gray-700 first:rounded-t-lg last:rounded-b-lg"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onMouseDown={(e) => { e.preventDefault(); save() }} className="text-green-500 hover:text-green-600 shrink-0"><Check size={14} /></button>
        <button onMouseDown={(e) => { e.preventDefault(); escapedRef.current = true; setEditing(false); setSuggestions([]) }} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={14} /></button>
      </div>
    )
  }

  return (
    <div
      className={cn("flex items-center gap-2 group/field", !isLink && "cursor-text")}
      onClick={!isLink ? startEdit : undefined}
    >
      {Icon && <Icon size={14} className="text-gray-400 shrink-0" />}
      {value ? (
        linkify ? (
          <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline flex-1 truncate flex items-center gap-1">
            {value} <ExternalLink size={11} />
          </a>
        ) : href ? (
          <Link href={href(value)} className="text-sm text-indigo-600 hover:underline flex-1 truncate">
            {value}
          </Link>
        ) : (
          <span className="text-sm text-gray-700 flex-1 truncate">{value}</span>
        )
      ) : (
        <span
          className="text-sm text-gray-300 italic flex-1 cursor-text"
          onClick={(e) => { e.stopPropagation(); startEdit() }}
        >
          {placeholder}
        </span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); startEdit() }}
        className="md:opacity-0 md:group-hover/field:opacity-100 transition-opacity text-gray-300 hover:text-gray-500 shrink-0"
      >
        <Pencil size={12} />
      </button>
    </div>
  )
}

export default function CompanyDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const companyName = decodeURIComponent(params.name as string)
  const { blurred } = usePrivacy()

  const [company, setCompany] = useState<CompanyData | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [domains, setDomains] = useState<string[]>([])
  const [manualDomains, setManualDomains] = useState<string[]>([])
  const [inferredDomains, setInferredDomains] = useState<string[]>([])
  const [addingDomain, setAddingDomain] = useState(false)
  const [newDomain, setNewDomain] = useState("")
  const [subsidiaries, setSubsidiaries] = useState<string[]>([])
  const [allCompanies, setAllCompanies] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  const [contactSort, setContactSort] = useState<string>("score")  // default: by interaction score
  const [contactFilter, setContactFilter] = useState<string>("")   // text filter on name/position/country/industry
  const [contactView, setContactView] = useState<"list" | "photos">("list")

  // Unmatched senders
  const [unmatched, setUnmatched] = useState<UnmatchedSender[]>([])
  const [unmatchedLoaded, setUnmatchedLoaded] = useState(false)
  const [unmatchedOpen, setUnmatchedOpen] = useState(false)
  const [matchingEmail, setMatchingEmail] = useState<string | null>(null)
  const [matchSearch, setMatchSearch] = useState("")
  const [matchResults, setMatchResults] = useState<{ id: string; firstName: string; lastName: string; company: string | null }[]>([])
  const [assigningEmail, setAssigningEmail] = useState<string | null>(null)
  const [dismissingEmail, setDismissingEmail] = useState<string | null>(null)
  const [addingToLinkedInEmail, setAddingToLinkedInEmail] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${encodeURIComponent(companyName)}`)
      if (res.ok) {
        const data = await res.json()
        setCompany(data.company)
        setContacts(data.contacts)
        setDomains(data.domains)
        setManualDomains(data.manualDomains ?? [])
        setInferredDomains(data.inferredDomains ?? [])
        setSubsidiaries(data.subsidiaries ?? [])
        setAllCompanies(data.allCompanies ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [companyName])

  useEffect(() => { if (status === "authenticated") load() }, [status, load])

  const filteredContacts = contacts
    .filter((c) => {
      if (!contactFilter) return true
      const q = contactFilter.toLowerCase()
      return (
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        (c.position ?? "").toLowerCase().includes(q) ||
        (c.country ?? "").toLowerCase().includes(q) ||
        (c.industry ?? "").toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (contactSort === "name") return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      if (contactSort === "name_desc") return `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`)
      if (contactSort === "country") return (a.country ?? "").localeCompare(b.country ?? "")
      if (contactSort === "industry") return (a.industry ?? "").localeCompare(b.industry ?? "")
      if (contactSort === "position") return (a.position ?? "").localeCompare(b.position ?? "")
      if (contactSort === "mutual") return (b.commonConnections ?? 0) - (a.commonConnections ?? 0)
      if (contactSort === "mutual_asc") return (a.commonConnections ?? 0) - (b.commonConnections ?? 0)
      if (contactSort === "connected") {
        if (!a.connectedOn && !b.connectedOn) return 0
        if (!a.connectedOn) return 1
        if (!b.connectedOn) return -1
        return new Date(b.connectedOn).getTime() - new Date(a.connectedOn).getTime()
      }
      if (contactSort === "connected_asc") {
        if (!a.connectedOn && !b.connectedOn) return 0
        if (!a.connectedOn) return 1
        if (!b.connectedOn) return -1
        return new Date(a.connectedOn).getTime() - new Date(b.connectedOn).getTime()
      }
      // default: score desc
      return (b.interactionScore ?? 0) - (a.interactionScore ?? 0)
    })

  function toggleContactSelect(id: string) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function selectAllContacts() { setSelectedContactIds(new Set(filteredContacts.map(c => c.id))) }
  function clearContactSelection() { setSelectedContactIds(new Set()) }

  async function handleBulkAssign(field: "country" | "industry" | "note", value: string) {
    const ids = [...selectedContactIds]
    await fetch("/api/contacts/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, field, value }),
    })
    // Optimistically update local state for country/industry
    if (field !== "note") {
      setContacts((prev) => prev.map((c) =>
        selectedContactIds.has(c.id) ? { ...c, [field]: value || null } : c
      ))
    }
    clearContactSelection()
  }

  async function loadUnmatched() {
    if (domains.length === 0) { setUnmatchedLoaded(true); return }
    const res = await fetch(`/api/companies/${encodeURIComponent(companyName)}/unmatched?domains=${domains.join(",")}`)
    if (res.ok) {
      const data = await res.json()
      setUnmatched(data.senders)
    }
    setUnmatchedLoaded(true)
  }

  useEffect(() => {
    if (unmatchedOpen && !unmatchedLoaded && domains.length > 0) loadUnmatched()
  }, [unmatchedOpen, unmatchedLoaded, domains]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addDomain() {
    const raw = newDomain.trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0]
    if (!raw || !raw.includes(".")) return
    setNewDomain("")
    setAddingDomain(false)
    const res = await fetch(`/api/companies/${encodeURIComponent(companyName)}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: raw }),
    })
    if (res.ok) {
      const data = await res.json()
      const d = data.domain as string
      setManualDomains((prev) => prev.includes(d) ? prev : [...prev, d].sort())
      setDomains((prev) => prev.includes(d) ? prev : [...prev, d])
      setUnmatchedLoaded(false) // trigger reload
    }
  }

  async function removeDomain(domain: string) {
    setManualDomains((prev) => prev.filter((d) => d !== domain))
    setDomains((prev) => {
      if (inferredDomains.includes(domain)) return prev
      return prev.filter((d) => d !== domain)
    })
    setUnmatchedLoaded(false)
    await fetch(`/api/companies/${encodeURIComponent(companyName)}/domains`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    })
  }

  async function excludeDomain(domain: string) {
    setInferredDomains((prev) => prev.filter((d) => d !== domain))
    setDomains((prev) => prev.filter((d) => d !== domain))
    setUnmatchedLoaded(false)
    await fetch(`/api/companies/${encodeURIComponent(companyName)}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, exclude: true }),
    })
  }

  async function patch(updates: Record<string, unknown>) {
    if (!company) return
    setCompany((prev) => prev ? { ...prev, ...updates } : null)
    await fetch(`/api/companies/${encodeURIComponent(companyName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  }

  async function dismissSender(fromEmail: string) {
    setDismissingEmail(fromEmail)
    try {
      await fetch("/api/gmail/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fromEmail }),
      })
      setUnmatched((prev) => prev.filter((s) => s.fromEmail !== fromEmail))
    } finally {
      setDismissingEmail(null)
    }
  }

  async function assignMatch(fromEmail: string, contactId: string) {
    setAssigningEmail(fromEmail)
    try {
      await fetch("/api/gmail/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fromEmail, contactId }),
      })
      setUnmatched((prev) => prev.filter((s) => s.fromEmail !== fromEmail))
      setMatchingEmail(null)
      // Patch just the matched contact's updated score/email without reloading the page
      fetch(`/api/contacts/${contactId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((updated) => {
          if (!updated) return
          setContacts((prev) => prev.map((c) =>
            c.id === contactId
              ? { ...c, interactionScore: updated.interactionScore, lastInteractionAt: updated.lastInteractionAt, emailAddress: updated.emailAddress }
              : c
          ))
        })
        .catch(() => {})
    } finally {
      setAssigningEmail(null)
    }
  }

  async function addToLinkedIn(fromEmail: string, fromName: string | null) {
    setAddingToLinkedInEmail(fromEmail)
    try {
      await fetch("/api/gmail/add-to-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromEmail, fromName }),
      })
      const name = fromName ?? fromEmail.split("@")[0]
      window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`, "_blank")
      setUnmatched((prev) => prev.filter((s) => s.fromEmail !== fromEmail))
    } finally {
      setAddingToLinkedInEmail(null)
    }
  }

  async function searchMatchContacts(q: string) {
    if (!q.trim()) { setMatchResults([]); return }
    const res = await fetch(`/api/contacts?q=${encodeURIComponent(q)}&limit=5&page=1&sort=name&industry=&location=&position=&label=&company=`)
    if (res.ok) {
      const data = await res.json()
      setMatchResults(data.contacts ?? [])
    }
  }

  if (status === "loading" || loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!company) {
    return <div className="max-w-3xl mx-auto px-4 py-8 text-gray-500">Company not found.</div>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back */}
      <Link href="/companies" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-6 transition-colors">
        <ArrowLeft size={14} />
        All companies
      </Link>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          {/* Logo + name */}
          <div className="flex items-center gap-4">
            <CompanyLogo
              domain={domains[0] ?? null}
              name={company.name}
              size={56}
              radius="rounded-2xl"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{company.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{company.count} contact{company.count !== 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => patch({ isPartner: !company.isPartner })}
              className={cn("flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                company.isPartner ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-gray-500 border-gray-200 hover:border-blue-200")}
            >
              <Handshake size={13} />
              {company.isPartner ? "Partner" : "Partner?"}
            </button>
            <button
              onClick={() => patch({ ignored: !company.ignored })}
              className={cn("text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                company.ignored ? "bg-gray-100 text-gray-600 border-gray-300" : "bg-white text-gray-400 border-gray-200 hover:border-gray-300")}
            >
              {company.ignored ? "Ignored" : "Ignore"}
            </button>
          </div>
        </div>

        {/* Info fields */}
        <div className="space-y-3">
          {/* Industry — dropdown */}
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-gray-400 shrink-0" />
            <select
              value={company.industry ?? ""}
              onChange={(e) => patch({ industry: e.target.value || null })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700"
            >
              <option value="">Add industry…</option>
              {INDUSTRY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <EditableField
            icon={Building2}
            value={company.website}
            placeholder="Add website…"
            onSave={(v) => patch({ website: v })}
            linkify
          />
          <EditableField
            icon={Network}
            value={company.parentCompany}
            placeholder="Add parent company…"
            onSave={(v) => patch({ parentCompany: v })}
            datalist={allCompanies.filter((n) => n !== company.name)}
            href={(v) => `/companies/${encodeURIComponent(v)}`}
          />
          {subsidiaries.length > 0 && (
            <div className="flex items-start gap-2">
              <Network size={14} className="text-gray-400 shrink-0 mt-1" />
              <div className="flex flex-wrap gap-1.5 flex-1">
                {subsidiaries.map((sub) => (
                  <Link
                    key={sub}
                    href={`/companies/${encodeURIComponent(sub)}`}
                    className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-0.5 hover:bg-indigo-100 transition-colors"
                  >
                    {sub}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Domains */}
          <div className="flex items-start gap-2">
            <Link2 size={14} className="text-gray-400 shrink-0 mt-1.5" />
            <div className="flex flex-wrap gap-1.5 flex-1">
              {/* Manual domains — removable */}
              {manualDomains.map((d) => (
                <span key={d} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
                  {d}
                  <button onClick={() => removeDomain(d)} className="text-blue-400 hover:text-blue-700 ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {/* Inferred domains — removable */}
              {inferredDomains.filter((d) => !manualDomains.includes(d)).map((d) => (
                <span key={d} className="flex items-center gap-1 text-xs bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5" title="Inferred from contacts">
                  {d}
                  <button onClick={() => excludeDomain(d)} className="text-gray-300 hover:text-red-500 ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {/* Add domain */}
              {addingDomain ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addDomain()
                      if (e.key === "Escape") { setAddingDomain(false); setNewDomain("") }
                    }}
                    placeholder="e.g. heroku.com"
                    className="text-xs border border-blue-300 rounded-full px-2.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white w-36"
                  />
                  <button onClick={addDomain} className="text-green-500 hover:text-green-600"><Check size={12} /></button>
                  <button onClick={() => { setAddingDomain(false); setNewDomain("") }} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingDomain(true)}
                  className="flex items-center gap-0.5 text-xs text-gray-400 border border-dashed border-gray-300 rounded-full px-2 py-0.5 hover:border-blue-300 hover:text-blue-500 transition-colors"
                >
                  <Plus size={10} /> domain
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap gap-2 mt-4">
          {company.isPartner && (
            <span className="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">Partner</span>
          )}
          {company.size && (
            <span className={cn("text-xs font-medium rounded-full px-2.5 py-0.5 border", SIZE_COLORS[company.size])}>
              {SIZE_OPTIONS.find((o) => o.value === company.size)?.label}
            </span>
          )}
          {company.type && (
            <span className={cn("text-xs font-medium rounded-full px-2.5 py-0.5 border", TYPE_COLORS[company.type] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
              {TYPE_OPTIONS.find((o) => o.value === company.type)?.label ?? company.type}
            </span>
          )}

          {/* Size selector */}
          <select
            value={company.size ?? ""}
            onChange={(e) => patch({ size: e.target.value || null })}
            className="text-xs border border-gray-200 rounded-lg px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-500"
          >
            <option value="">Size…</option>
            {SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Type selector */}
          <select
            value={company.type ?? ""}
            onChange={(e) => patch({ type: e.target.value || null })}
            className="text-xs border border-gray-200 rounded-lg px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-500"
          >
            <option value="">Type…</option>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-white border border-gray-200 rounded-2xl mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
          {/* Title row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-gray-400" />
              <h2 className="font-semibold text-gray-800 text-sm">{company.count} contact{company.count !== 1 ? "s" : ""}</h2>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setContactView("list")}
                  title="List view"
                  className={cn("px-2 py-1.5 transition-colors", contactView === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="2" rx="1" fill="currentColor"/><rect x="1" y="6" width="12" height="2" rx="1" fill="currentColor"/><rect x="1" y="10" width="12" height="2" rx="1" fill="currentColor"/></svg>
                </button>
                <button
                  onClick={() => setContactView("photos")}
                  title="Photo grid"
                  className={cn("px-2 py-1.5 transition-colors border-l border-gray-200", contactView === "photos" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="3.5" cy="4" r="2.5" fill="currentColor"/><circle cx="10.5" cy="4" r="2.5" fill="currentColor"/><circle cx="3.5" cy="10" r="2.5" fill="currentColor"/><circle cx="10.5" cy="10" r="2.5" fill="currentColor"/></svg>
                </button>
              </div>
              {/* Sort select — hidden in photo mode */}
              {contactView === "list" && (
                <select
                  value={contactSort}
                  onChange={(e) => setContactSort(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="score">By score</option>
                  <option value="mutual">Most connections</option>
                  <option value="mutual_asc">Fewest connections</option>
                  <option value="connected">Recently connected</option>
                  <option value="connected_asc">Oldest connection</option>
                  <option value="name">Name A–Z</option>
                  <option value="name_desc">Name Z–A</option>
                  <option value="country">Country A–Z</option>
                  <option value="industry">Industry A–Z</option>
                  <option value="position">Position A–Z</option>
                </select>
              )}
              {/* Select all / none — hidden in photo mode */}
              {contactView === "list" && (
                selectedContactIds.size === 0 ? (
                  <button onClick={selectAllContacts} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Select all
                  </button>
                ) : (
                  <button onClick={clearContactSelection} className="text-xs text-gray-500 hover:text-gray-700">
                    Clear ({selectedContactIds.size})
                  </button>
                )
              )}
            </div>
          </div>
          {/* Connection-year mini chart */}
          {(() => {
            const yearCounts = new Map<number, number>()
            for (const c of contacts) {
              if (!c.connectedOn) continue
              const yr = new Date(c.connectedOn).getFullYear()
              yearCounts.set(yr, (yearCounts.get(yr) ?? 0) + 1)
            }
            const years = Array.from(yearCounts.entries()).map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year)
            if (years.length < 2) return null
            const max = Math.max(...years.map(y => y.count), 1)
            return (
              <div className="flex items-end gap-1 h-10 pt-1">
                {years.map(({ year, count }) => (
                  <div key={year} className="flex flex-col items-center gap-0.5 flex-1 min-w-0" title={`${count} in ${year}`}>
                    <div className="w-full rounded-t-sm bg-blue-400 hover:bg-blue-500 transition-colors" style={{ height: `${Math.max(3, (count / max) * 24)}px` }} />
                    <span className="text-[9px] text-gray-400 leading-none">{String(year).slice(2)}</span>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Search/filter row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filter by name, role, country…"
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
            {selectedContactIds.size > 0 && (
              <BulkAssignPopover
                count={selectedContactIds.size}
                industries={[...new Set(contacts.map(c => c.industry).filter(Boolean))] as string[]}
                onAssign={handleBulkAssign}
              />
            )}
          </div>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No contacts found</p>
        ) : filteredContacts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No contacts match your filter</p>
        ) : contactView === "photos" ? (
          /* ── Photo grid ── */
          <div className="p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {filteredContacts.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedContactId(c.id)}
                className="group flex flex-col rounded-xl overflow-hidden bg-white border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
              >
                <div className="aspect-square w-full relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.photoUrl}
                      alt={`${c.firstName} ${c.lastName}`}
                      className={cn("w-full h-full object-cover group-hover:scale-105 transition-transform duration-300", blurred && "blur")}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-xl">
                      {initials(c.firstName, c.lastName)}
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className={cn("text-xs font-semibold text-gray-900 truncate leading-tight", blurred && "blur-sm select-none")}>
                    {c.firstName} {c.lastName}
                  </p>
                  {c.position && (
                    <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{c.position}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* ── List view ── */
          <div className="divide-y divide-gray-50">
            {filteredContacts.map((c) => {
              const inits = initials(c.firstName, c.lastName)
              const score = c.interactionScore ?? 0
              const scoreWidth = Math.min(100, score * 20)
              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors group",
                    selectedContactIds.has(c.id) ? "bg-blue-50" : "odd:bg-white even:bg-gray-50/60 hover:bg-gray-100"
                  )}
                  onClick={() => setSelectedContactId(c.id)}
                >
                  {/* Checkbox */}
                  <div
                    className="shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggleContactSelect(c.id) }}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                      selectedContactIds.has(c.id) ? "bg-blue-600 border-blue-600" : "border-gray-300 hover:border-gray-400"
                    )}>
                      {selectedContactIds.has(c.id) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Avatar */}
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photoUrl} alt="" className={cn("w-9 h-9 rounded-xl object-cover shrink-0", blurred && "blur")} />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {inits}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium text-gray-900 text-sm truncate", blurred && "blur-sm select-none")}>{c.firstName} {c.lastName}</p>
                    {c.position && <p className="text-xs text-gray-500 truncate">{c.position}</p>}
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {c.country && <span className="text-[9px] bg-gray-100 text-gray-500 rounded px-1 py-0.5">{c.country}</span>}
                      {c.industry && <span className="text-[9px] bg-blue-50 text-blue-500 rounded px-1 py-0.5 truncate max-w-[80px]">{c.industry}</span>}
                      {c.commonConnections != null && c.commonConnections > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-bold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5 shadow-sm">
                          <Users size={10} />{c.commonConnections}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${scoreWidth}%` }} />
                      </div>
                      {c.lastInteractionAt && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <Clock size={9} />
                          {formatDate(c.lastInteractionAt)}
                        </span>
                      )}
                      {c.outreachStatus && STATUS_BADGE[c.outreachStatus] && (
                        <span className={cn("text-[10px] rounded-full px-1.5 py-0.5 border font-medium", STATUS_BADGE[c.outreachStatus].className)}>
                          {STATUS_BADGE[c.outreachStatus].label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Email + LinkedIn */}
                  <div className="flex items-center gap-2 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {c.emailAddress && (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-600 bg-green-50 rounded-full px-2 py-0.5">
                        <Mail size={10} /> email
                      </span>
                    )}
                    {c.profileUrl && (
                      <a
                        href={c.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] text-blue-500 hover:text-blue-700"
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Unmatched emails */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setUnmatchedOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-gray-400" />
            <span className="font-semibold text-gray-800 text-sm">Unmatched emails</span>
            {unmatchedLoaded && unmatched.length > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-semibold">{unmatched.length}</span>
            )}
          </div>
          {unmatchedOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </button>

        {unmatchedOpen && (
          <div className="border-t border-gray-100">
            {!unmatchedLoaded ? (
              <div className="py-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : domains.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No domains linked — add one above (e.g. salesforce.com).
              </p>
            ) : unmatched.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No unmatched senders from this company.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {unmatched.map((sender) => (
                  <div key={sender.fromEmail} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {sender.fromName ?? sender.fromEmail}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{sender.fromEmail}</p>
                        <p className="text-xs text-gray-400">
                          {sender.messageCount} email{sender.messageCount !== 1 ? "s" : ""}
                          {sender.lastSeen ? ` · last ${formatDate(sender.lastSeen)}` : ""}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <button
                          disabled={addingToLinkedInEmail === sender.fromEmail}
                          onClick={() => addToLinkedIn(sender.fromEmail, sender.fromName)}
                          className="flex items-center gap-1 text-xs text-sky-600 border border-sky-200 rounded-lg px-2 py-1 hover:bg-sky-50 disabled:opacity-50 transition-colors"
                        >
                          {addingToLinkedInEmail === sender.fromEmail ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                          LinkedIn
                        </button>
                        <button
                          disabled={dismissingEmail === sender.fromEmail}
                          onClick={() => dismissSender(sender.fromEmail)}
                          className="flex items-center gap-1 text-xs text-gray-400 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          {dismissingEmail === sender.fromEmail ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
                          Ignore
                        </button>
                      </div>
                    </div>

                    {/* Quick-match suggestions */}
                    {sender.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-[10px] text-gray-400 self-center">Match to:</span>
                        {sender.suggestions.map((s) => (
                          <button
                            key={s.contactId}
                            disabled={assigningEmail === sender.fromEmail}
                            onClick={() => assignMatch(sender.fromEmail, s.contactId)}
                            className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded-lg px-2 py-0.5 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                          >
                            {assigningEmail === sender.fromEmail && <Loader2 size={10} className="animate-spin" />}
                            {s.name}
                          </button>
                        ))}
                        <button
                          onClick={() => { setMatchingEmail(sender.fromEmail); setMatchSearch(""); setMatchResults([]) }}
                          className="text-xs text-gray-400 border border-dashed border-gray-300 rounded-lg px-2 py-0.5 hover:border-gray-400 transition-colors"
                        >
                          Search…
                        </button>
                      </div>
                    )}

                    {/* Manual search */}
                    {matchingEmail === sender.fromEmail && (
                      <div className="mt-2 relative">
                        <input
                          autoFocus
                          value={matchSearch}
                          onChange={(e) => { setMatchSearch(e.target.value); searchMatchContacts(e.target.value) }}
                          placeholder="Search contacts…"
                          className="w-full text-sm border border-blue-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                        {matchResults.length > 0 && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto">
                            {matchResults.map((c) => (
                              <button
                                key={c.id}
                                disabled={assigningEmail === sender.fromEmail}
                                onClick={() => assignMatch(sender.fromEmail, c.id)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between disabled:opacity-50"
                              >
                                {assigningEmail === sender.fromEmail ? <Loader2 size={12} className="animate-spin mr-1.5 text-blue-500" /> : null}
                                <span className={cn(blurred && "blur-sm select-none")}>{c.firstName} {c.lastName}</span>
                                {c.company && <span className="text-xs text-gray-400 truncate ml-2">{c.company}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => setMatchingEmail(null)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ContactDetail contactId={selectedContactId} onClose={() => setSelectedContactId(null)} />
    </div>
  )
}
