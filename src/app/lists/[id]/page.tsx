"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Share2, Trash2, UserMinus, Zap,
  ArrowUpDown, ArrowUp, ArrowDown, Sparkles, Pencil,
} from "lucide-react"
import { cn, initials, formatDate, photoSrc } from "@/lib/utils"
import { summariseSegment, type SegmentDef } from "@/lib/segment-executor"
import ShareModal from "@/components/ShareModal"
import ContactDetail from "@/components/ContactDetail"
import SegmentBuilder from "@/components/SegmentBuilder"
import { usePrivacy } from "@/contexts/PrivacyContext"
import { linkedinLevel, type ContactSummary } from "@/components/ContactCard"

// ── Country → flag emoji ─────────────────────────────────────────────────────

const COUNTRY_ISO: Record<string, string> = {
  "Afghanistan":"AF","Albania":"AL","Algeria":"DZ","Angola":"AO","Argentina":"AR",
  "Armenia":"AM","Australia":"AU","Austria":"AT","Azerbaijan":"AZ","Bahrain":"BH",
  "Bangladesh":"BD","Belarus":"BY","Belgium":"BE","Bolivia":"BO","Brazil":"BR",
  "Bulgaria":"BG","Cambodia":"KH","Cameroon":"CM","Canada":"CA","Chile":"CL",
  "China":"CN","Colombia":"CO","Costa Rica":"CR","Croatia":"HR","Cyprus":"CY",
  "Czech Republic":"CZ","Czechia":"CZ","Denmark":"DK","Dominican Republic":"DO",
  "Ecuador":"EC","Egypt":"EG","Estonia":"EE","Ethiopia":"ET","Finland":"FI",
  "France":"FR","Georgia":"GE","Germany":"DE","Ghana":"GH","Greece":"GR",
  "Guatemala":"GT","Honduras":"HN","Hong Kong":"HK","Hungary":"HU","Iceland":"IS",
  "India":"IN","Indonesia":"ID","Iran":"IR","Iraq":"IQ","Ireland":"IE",
  "Israel":"IL","Italy":"IT","Ivory Coast":"CI","Japan":"JP","Jordan":"JO",
  "Kazakhstan":"KZ","Kenya":"KE","Kuwait":"KW","Latvia":"LV","Lebanon":"LB",
  "Libya":"LY","Lithuania":"LT","Luxembourg":"LU","Malaysia":"MY","Malta":"MT",
  "Mexico":"MX","Moldova":"MD","Morocco":"MA","Mozambique":"MZ","Myanmar":"MM",
  "Nepal":"NP","Netherlands":"NL","New Zealand":"NZ","Nigeria":"NG","Norway":"NO",
  "Oman":"OM","Pakistan":"PK","Palestine":"PS","Panama":"PA","Peru":"PE",
  "Philippines":"PH","Poland":"PL","Portugal":"PT","Qatar":"QA","Romania":"RO",
  "Russia":"RU","Rwanda":"RW","Saudi Arabia":"SA","Senegal":"SN","Serbia":"RS",
  "Singapore":"SG","Slovakia":"SK","Slovenia":"SI","South Africa":"ZA",
  "South Korea":"KR","Spain":"ES","Sri Lanka":"LK","Sudan":"SD","Sweden":"SE",
  "Switzerland":"CH","Syria":"SY","Taiwan":"TW","Tanzania":"TZ","Thailand":"TH",
  "Tunisia":"TN","Turkey":"TR","Türkiye":"TR","Uganda":"UG","Ukraine":"UA",
  "United Arab Emirates":"AE","UAE":"AE","United Kingdom":"GB","UK":"GB",
  "United States":"US","USA":"US","Uruguay":"UY","Uzbekistan":"UZ",
  "Venezuela":"VE","Vietnam":"VN","Yemen":"YE","Zambia":"ZM","Zimbabwe":"ZW",
}

function countryFlag(country: string): string {
  const iso = COUNTRY_ISO[country]
  if (!iso) return ""
  return iso.split("").map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397)).join("")
}

function whatsappHref(phone: string): string {
  const clean = phone.replace(/[^\d]/g, "")
  return `https://wa.me/${clean}`
}

// ── Types ────────────────────────────────────────────────────────────────────

type Contact = {
  id: string
  firstName: string
  lastName: string
  position: string | null
  company: string | null
  location: string | null
  city: string | null
  country: string | null
  industry: string | null
  photoUrl: string | null
  profileUrl: string | null
  phoneNumber: string | null
  outreachStatus: string | null
  commonConnections: number | null
  interactionScore: number | null
  connectedOn: string | null
  linkedinDegree: string | null
  notes: { id: string }[]
  labels: { label: { id: string; name: string; color: string } }[]
}

type Member = { id: string; addedAt: string; contact: Contact }

type ListData = {
  id: string
  name: string
  description: string | null
  filterCompany: string | null
  filterSegment: string | null
  shareEnabled: boolean
  shareToken: string | null
  members: Member[]
  _count: { members: number }
}

type SortCol = "name" | "company" | "city" | "country" | "connections" | "added"

const LI_ICON_PATH =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"

const WA_ICON_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.524 5.826L0 24l6.342-1.5A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.846 0-3.573-.5-5.061-1.374l-.364-.216-3.766.891.953-3.675-.236-.376A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"

// Grid columns — shared between header and rows
const GRID = "36px 1fr 1fr 90px 1fr 6.5rem 3.5rem 4rem auto"

// ── Page ─────────────────────────────────────────────────────────────────────

function ListDetailContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id
  const { blurred } = usePrivacy()

  const [list, setList] = useState<ListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  // Header editing
  const [editingMeta, setEditingMeta] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [savingMeta, setSavingMeta] = useState(false)

  // Segment editor
  const [editingSegment, setEditingSegment] = useState(false)

  // Remove
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  function cycleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortCol(col); setSortDir("asc") }
  }

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const searchParams = useSearchParams()

  useEffect(() => {
    const contactId = searchParams.get("contact")
    if (contactId) setActiveContactId(contactId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handlePopState() {
      const p = new URLSearchParams(window.location.search)
      setActiveContactId(p.get("contact"))
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  function openContact(cid: string) {
    setActiveContactId(cid)
    const url = new URL(window.location.href)
    url.searchParams.set("contact", cid)
    window.history.pushState({ contactId: cid }, "", url.toString())
  }

  function closeContact() {
    setActiveContactId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("contact")
    window.history.replaceState({}, "", url.toString())
  }

  const fetchList = useCallback(async () => {
    const res = await fetch(`/api/lists/${id}`)
    if (!res.ok) { router.replace("/lists"); return }
    const data = await res.json()
    setList(data)
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    if (status === "authenticated") fetchList()
  }, [status, fetchList])

  async function saveMeta() {
    if (!editName.trim() || !list) return
    setSavingMeta(true)
    await fetch(`/api/lists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
    })
    setList((prev) => prev
      ? { ...prev, name: editName.trim(), description: editDesc.trim() || null }
      : prev)
    setEditingMeta(false)
    setSavingMeta(false)
  }

  function startEditMeta() {
    if (!list) return
    setEditName(list.name)
    setEditDesc(list.description ?? "")
    setEditingMeta(true)
  }

  async function removeContact(contactId: string) {
    setRemovingId(contactId)
    await fetch(`/api/lists/${id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    })
    setList((prev) =>
      prev ? {
        ...prev,
        members: prev.members.filter((m) => m.contact.id !== contactId),
        _count: { members: prev._count.members - 1 },
      } : prev
    )
    setRemovingId(null)
  }

  async function deleteList() {
    if (!confirm("Delete this list? Contacts won't be deleted.")) return
    await fetch(`/api/lists/${id}`, { method: "DELETE" })
    router.push("/lists")
  }

  if (status === "loading" || loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!list) return null

  const sortedMembers = [...(list.members ?? [])].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1
    const ca = a.contact, cb = b.contact
    switch (sortCol) {
      case "name":    return dir * (`${ca.firstName} ${ca.lastName}`).localeCompare(`${cb.firstName} ${cb.lastName}`)
      case "company": return dir * (ca.company ?? "").localeCompare(cb.company ?? "")
      case "city":    return dir * (ca.city ?? "").localeCompare(cb.city ?? "")
      case "country": return dir * (ca.country ?? "").localeCompare(cb.country ?? "")
      case "connections": return dir * ((ca.commonConnections ?? 0) - (cb.commonConnections ?? 0))
      case "added":   return dir * a.addedAt.localeCompare(b.addedAt)
      default: return 0
    }
  })

  const isSmartList    = !!list.filterSegment && !list.filterCompany
  const isCompanyList  = !!list.filterCompany
  const isDynamicList  = isSmartList || isCompanyList
  const segmentDef     = isSmartList ? (() => { try { return JSON.parse(list.filterSegment!) as SegmentDef } catch { return null } })() : null

  const HEADER_COLS: { key: SortCol | null; label: string }[] = [
    { key: "name",        label: "Name" },
    { key: "company",     label: "Company" },
    { key: "city",        label: "City" },
    { key: "country",     label: "Country" },
    { key: null,          label: "WhatsApp" },
    { key: "connections", label: "Connections" },
    { key: null,          label: "" },  // actions
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Back */}
      <Link
        href="/lists"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
      >
        <ArrowLeft size={14} />
        All lists
      </Link>

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1 min-w-0">
          {editingMeta ? (
            <div className="space-y-2 max-w-md">
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveMeta(); if (e.key === "Escape") setEditingMeta(false) }}
                className="w-full text-2xl font-bold text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent"
              />
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveMeta}
                  disabled={!editName.trim() || savingMeta}
                  className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {savingMeta ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingMeta(false)}
                  className="text-sm text-gray-500 border border-gray-200 px-4 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">{list.name}</h1>
                <button
                  onClick={startEditMeta}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit name & description"
                >
                  <Pencil size={15} />
                </button>
              </div>
              {list.description && (
                <p className="text-sm text-gray-500 mt-0.5">{list.description}</p>
              )}
            </>
          )}

          {/* List type badge + segment criteria */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {isCompanyList && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
                <Zap size={9} />
                Dynamic · {list.filterCompany}
              </span>
            )}
            {isSmartList && (
              <>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <Sparkles size={9} />
                  Smart list
                </span>
                {segmentDef && (
                  <span className="text-xs text-gray-500 truncate max-w-xs">
                    {summariseSegment(segmentDef, 3)}
                  </span>
                )}
                <button
                  onClick={() => setEditingSegment((v) => !v)}
                  className="inline-flex items-center gap-0.5 text-xs text-emerald-600 hover:text-emerald-800 hover:underline transition-colors"
                >
                  <Pencil size={9} />
                  {editingSegment ? "Cancel" : "Edit criteria"}
                </button>
              </>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-1">
            {list._count.members} contact{list._count.members !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShareOpen(true)}
            className={cn(
              "flex items-center gap-1.5 text-sm border rounded-xl px-3 py-2 font-medium transition-colors",
              list.shareEnabled
                ? "text-green-700 border-green-300 bg-green-50 hover:bg-green-100"
                : "text-gray-700 border-gray-200 bg-white hover:bg-gray-50"
            )}
          >
            <Share2 size={14} />
            {list.shareEnabled ? "Shared" : "Share"}
          </button>
          <button
            onClick={deleteList}
            className="flex items-center gap-1.5 text-sm text-red-500 border border-red-200 bg-white hover:bg-red-50 rounded-xl px-3 py-2 transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {/* ── Inline segment editor ── */}
      {editingSegment && segmentDef && (
        <div className="mb-6">
          <SegmentBuilder
            initialDef={segmentDef}
            editingListId={id}
            editingListName={list.name}
            onClose={() => setEditingSegment(false)}
            onSaved={() => { setEditingSegment(false); fetchList() }}
          />
        </div>
      )}

      {/* ── Contact table ── */}
      {list.members.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-gray-500 font-medium">No contacts in this list</p>
          <p className="text-sm text-gray-400 mt-1">
            {isCompanyList
              ? <>No contacts found at <strong>{list.filterCompany}</strong>.</>
              : isSmartList
                ? <>No contacts match the current criteria.</>
                : <><Link href="/contacts" className="text-blue-500 hover:underline">Go to Contacts</Link> to add some.</>
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          {/* ── Table header ── */}
          <div
            className="px-3 py-2.5 border-b border-gray-100 bg-gray-50/80 text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
            style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px", alignItems: "center" }}
          >
            {/* Avatar spacer */}
            <div />
            {/* Sortable columns */}
            {HEADER_COLS.map(({ key, label }, i) => (
              key ? (
                <button
                  key={i}
                  onClick={() => cycleSort(key)}
                  className="flex items-center gap-1 hover:text-gray-600 transition-colors text-left"
                >
                  {label}
                  {sortCol === key
                    ? sortDir === "asc"
                      ? <ArrowUp size={10} className="text-blue-500" />
                      : <ArrowDown size={10} className="text-blue-500" />
                    : <ArrowUpDown size={9} className="opacity-30" />
                  }
                </button>
              ) : (
                <div key={i} className="text-left">{label}</div>
              )
            ))}
          </div>

          {/* ── Rows ── */}
          {sortedMembers.map(({ id: memberId, contact }) => {
            const fullName = `${contact.firstName} ${contact.lastName}`
            const inits = initials(contact.firstName, contact.lastName)
            const liLevel = linkedinLevel(contact as unknown as ContactSummary)
            const liColor =
              liLevel === "connected" ? "#0A66C2"
              : liLevel === "pending"   ? "#7C3AED"
              : liLevel === "followed"  ? "#D97706"
              : liLevel === "saved"     ? "#9CA3AF"
              : null
            const liTitle =
              liLevel === "connected" ? "1st-degree connection"
              : liLevel === "pending"   ? "Pending request"
              : liLevel === "followed"  ? "Followed (not connected)"
              : "Profile saved – not connected"
            const flag = contact.country ? countryFlag(contact.country) : ""
            const hasWhatsApp = !!contact.phoneNumber

            return (
              <div
                key={memberId}
                className="px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors group"
                style={{ display: "grid", gridTemplateColumns: GRID, gap: "12px", alignItems: "center" }}
              >
                {/* ── Avatar (clickable) ── */}
                <div
                  className="w-9 h-9 shrink-0 cursor-pointer"
                  onClick={() => openContact(contact.id)}
                >
                  {contact.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoSrc(contact.photoUrl)!}
                      alt={fullName}
                      className={cn("w-9 h-9 rounded-full object-cover border border-gray-100", blurred && "blur")}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold select-none">
                      {inits}
                    </div>
                  )}
                </div>

                {/* ── Name + position (clickable) ── */}
                <div
                  className="min-w-0 cursor-pointer"
                  onClick={() => openContact(contact.id)}
                >
                  <p className={cn("text-sm font-medium text-gray-900 truncate leading-snug hover:text-blue-600 transition-colors", blurred && "blur-sm select-none")}>
                    {fullName}
                  </p>
                  {contact.position && (
                    <p className="text-xs text-gray-500 truncate">{contact.position}</p>
                  )}
                </div>

                {/* ── Company ── */}
                <div className="min-w-0">
                  {contact.company
                    ? <p className="text-sm text-gray-700 truncate">{contact.company}</p>
                    : <span className="text-gray-300">—</span>
                  }
                  {contact.industry && (
                    <p className="text-[11px] text-gray-400 truncate">{contact.industry}</p>
                  )}
                </div>

                {/* ── City ── */}
                <div className="min-w-0">
                  {contact.city
                    ? <p className="text-xs text-gray-600 truncate">{contact.city}</p>
                    : <span className="text-gray-300 text-xs">—</span>
                  }
                </div>

                {/* ── Country + flag ── */}
                <div className="min-w-0 flex items-center gap-1.5">
                  {contact.country ? (
                    <>
                      {flag && <span className="text-base leading-none shrink-0" title={contact.country}>{flag}</span>}
                      <p className="text-xs text-gray-600 truncate">{contact.country}</p>
                    </>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </div>

                {/* ── WhatsApp number ── */}
                <div className="min-w-0">
                  {contact.phoneNumber ? (
                    <a
                      href={whatsappHref(contact.phoneNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-gray-600 hover:text-green-600 transition-colors truncate block"
                      title="Open in WhatsApp"
                    >
                      {contact.phoneNumber}
                    </a>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </div>

                {/* ── Mutual connections (LinkedIn) ── */}
                <div className="flex items-center justify-center">
                  {contact.commonConnections != null && contact.commonConnections > 0 ? (
                    <span className="text-xs font-medium text-blue-600 tabular-nums">
                      {contact.commonConnections}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </div>

                {/* ── Actions ── */}
                <div className="flex items-center gap-1.5 justify-end">
                  {/* LinkedIn icon */}
                  {contact.profileUrl && liColor ? (
                    <a
                      href={contact.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={liTitle}
                      className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
                    >
                      <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: liColor }}>
                        <path d={LI_ICON_PATH} />
                      </svg>
                    </a>
                  ) : (
                    <span className="w-4" /> // spacer
                  )}

                  {/* WhatsApp icon */}
                  {hasWhatsApp ? (
                    <a
                      href={whatsappHref(contact.phoneNumber!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Open WhatsApp chat"
                      className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
                    >
                      <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "#25D366" }}>
                        <path d={WA_ICON_PATH} />
                      </svg>
                    </a>
                  ) : (
                    <span className="w-4" /> // spacer
                  )}

                  {/* Remove (manual lists only) */}
                  {!isDynamicList && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeContact(contact.id) }}
                      disabled={removingId === contact.id}
                      title="Remove from list"
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                    >
                      <UserMinus size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Contact detail panel ── */}
      <ContactDetail contactId={activeContactId} onClose={closeContact} />

      {/* ── Share modal ── */}
      {shareOpen && (
        <ShareModal
          listId={list.id}
          listName={list.name}
          shareEnabled={list.shareEnabled}
          shareToken={list.shareToken}
          onClose={() => setShareOpen(false)}
          onToggle={(enabled) =>
            setList((prev) => prev ? { ...prev, shareEnabled: enabled } : prev)
          }
        />
      )}
    </div>
  )
}

export default function ListDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ListDetailContent />
    </Suspense>
  )
}
