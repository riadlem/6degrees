"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft, Handshake, Globe, Building2, Users, Check, X, Pencil,
  ExternalLink, Mail, UserPlus, Ban, Clock, ChevronDown, ChevronUp, Link2, Plus
} from "lucide-react"
import { cn, initials, formatDate } from "@/lib/utils"
import ContactDetail from "@/components/ContactDetail"
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
  datalistId,
  icon: Icon,
  linkify,
}: {
  value: string | null
  placeholder: string
  onSave: (v: string | null) => void
  datalist?: string[]
  datalistId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>
  linkify?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState("")

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className="text-gray-400 shrink-0" />}
        <input
          autoFocus
          list={datalistId}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onSave(val.trim() || null); setEditing(false) }
            if (e.key === "Escape") setEditing(false)
          }}
          placeholder={placeholder}
          className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        />
        {datalist && datalistId && (
          <datalist id={datalistId}>
            {datalist.map((c) => <option key={c} value={c} />)}
          </datalist>
        )}
        <button onClick={() => { onSave(val.trim() || null); setEditing(false) }} className="text-green-500 hover:text-green-600"><Check size={14} /></button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 group/field">
      {Icon && <Icon size={14} className="text-gray-400 shrink-0" />}
      {value ? (
        linkify ? (
          <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline flex-1 truncate flex items-center gap-1">
            {value} <ExternalLink size={11} />
          </a>
        ) : (
          <span className="text-sm text-gray-700 flex-1 truncate">{value}</span>
        )
      ) : (
        <span className="text-sm text-gray-300 italic flex-1">{placeholder}</span>
      )}
      <button
        onClick={() => { setVal(value ?? ""); setEditing(true) }}
        className="md:opacity-0 md:group-hover/field:opacity-100 transition-opacity text-gray-300 hover:text-gray-500"
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

  const [company, setCompany] = useState<CompanyData | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [domains, setDomains] = useState<string[]>([])
  const [manualDomains, setManualDomains] = useState<string[]>([])
  const [inferredDomains, setInferredDomains] = useState<string[]>([])
  const [addingDomain, setAddingDomain] = useState(false)
  const [newDomain, setNewDomain] = useState("")
  const [loading, setLoading] = useState(true)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  // Unmatched senders
  const [unmatched, setUnmatched] = useState<UnmatchedSender[]>([])
  const [unmatchedLoaded, setUnmatchedLoaded] = useState(false)
  const [unmatchedOpen, setUnmatchedOpen] = useState(false)
  const [matchingEmail, setMatchingEmail] = useState<string | null>(null)
  const [matchSearch, setMatchSearch] = useState("")
  const [matchResults, setMatchResults] = useState<{ id: string; firstName: string; lastName: string; company: string | null }[]>([])

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
      }
    } finally {
      setLoading(false)
    }
  }, [companyName])

  useEffect(() => { if (status === "authenticated") load() }, [status, load])

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
    await fetch("/api/gmail/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fromEmail }),
    })
    setUnmatched((prev) => prev.filter((s) => s.fromEmail !== fromEmail))
  }

  async function assignMatch(fromEmail: string, contactId: string) {
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
  }

  async function addToLinkedIn(fromEmail: string, fromName: string | null) {
    await fetch("/api/gmail/add-to-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromEmail, fromName }),
    })
    const name = fromName ?? fromEmail.split("@")[0]
    window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`, "_blank")
    setUnmatched((prev) => prev.filter((s) => s.fromEmail !== fromEmail))
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
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {initials(company.name.split(" ")[0] ?? company.name, company.name.split(" ")[1] ?? "")}
            </div>
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
          {company.parentCompany && (
            <div className="flex items-center gap-2 text-sm text-indigo-600">
              <span className="text-gray-400 text-xs">↳</span>
              <span>{company.parentCompany}</span>
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
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <Users size={14} className="text-gray-400" />
          <h2 className="font-semibold text-gray-800 text-sm">{company.count} contact{company.count !== 1 ? "s" : ""}</h2>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No contacts found</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {contacts.map((c) => {
              const inits = initials(c.firstName, c.lastName)
              const score = c.interactionScore ?? 0
              const scoreWidth = Math.min(100, score * 20)
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors group"
                  onClick={() => setSelectedContactId(c.id)}
                >
                  {/* Avatar */}
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photoUrl} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {inits}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{c.firstName} {c.lastName}</p>
                    {c.position && <p className="text-xs text-gray-500 truncate">{c.position}</p>}
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
                          onClick={() => addToLinkedIn(sender.fromEmail, sender.fromName)}
                          className="flex items-center gap-1 text-xs text-sky-600 border border-sky-200 rounded-lg px-2 py-1 hover:bg-sky-50 transition-colors"
                        >
                          <UserPlus size={11} />
                          LinkedIn
                        </button>
                        <button
                          onClick={() => dismissSender(sender.fromEmail)}
                          className="flex items-center gap-1 text-xs text-gray-400 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50 transition-colors"
                        >
                          <Ban size={11} />
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
                            onClick={() => assignMatch(sender.fromEmail, s.contactId)}
                            className="text-xs text-blue-600 border border-blue-200 rounded-lg px-2 py-0.5 hover:bg-blue-50 transition-colors"
                          >
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
                                onClick={() => assignMatch(sender.fromEmail, c.id)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                              >
                                <span>{c.firstName} {c.lastName}</span>
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
