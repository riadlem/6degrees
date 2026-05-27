"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, UserPlus,
  ExternalLink, Loader2, Settings, Users, Pencil, Unlink2, EyeOff, RotateCcw
} from "lucide-react"
import { cn, initials, photoSrc } from "@/lib/utils"
import { usePrivacy } from "@/contexts/PrivacyContext"
import Link from "next/link"
import ContactDetail from "@/components/ContactDetail"

// ── Helpers ───────────────────────────────────────────────────────────────────

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
const FR_COUNTRY: Record<string, string> = {
  "royaume-uni": "United Kingdom", "royaume uni": "United Kingdom",
  "états-unis": "United States", "etats-unis": "United States",
  "etats unis": "United States", "états unis": "United States",
  "usa": "United States", "allemagne": "Germany", "espagne": "Spain",
  "italie": "Italy", "pays-bas": "Netherlands", "belgique": "Belgium",
  "suisse": "Switzerland", "autriche": "Austria", "chine": "China",
  "japon": "Japan", "russie": "Russia", "pologne": "Poland",
  "grèce": "Greece", "grece": "Greece", "danemark": "Denmark",
  "norvège": "Norway", "norvege": "Norway", "suède": "Sweden",
  "suede": "Sweden", "finlande": "Finland", "irlande": "Ireland",
  "turquie": "Turkey", "maroc": "Morocco", "australie": "Australia",
  "brésil": "Brazil", "bresil": "Brazil", "mexique": "Mexico",
  "inde": "India", "égypte": "Egypt", "egypte": "Egypt",
  "afrique du sud": "South Africa",
  "emirats arabes unis": "United Arab Emirates",
  "émirats arabes unis": "United Arab Emirates",
  "arabie saoudite": "Saudi Arabia",
  "sénégal": "Senegal", "senegal": "Senegal",
  "côte d'ivoire": "Ivory Coast", "cote d'ivoire": "Ivory Coast",
  "cameroun": "Cameroon",
}
function normCountry(c: string | null | undefined): string | null {
  if (!c) return null
  return FR_COUNTRY[c.trim().toLowerCase()] ?? c.trim()
}
function countryFlag(country: string): string {
  const iso = COUNTRY_ISO[country]
  if (!iso) return ""
  return iso.split("").map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397)).join("")
}
function relTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const h = ms / 3_600_000
  if (h < 1)  return "now"
  if (h < 24) return `${Math.floor(h)}h`
  const d = ms / 86_400_000
  if (d < 7)  return `${Math.floor(d)}d`
  if (d < 30) return `${Math.floor(d / 7)}w`
  return `${Math.floor(d / 30)}mo`
}

// LinkedIn blue SVG logo
function LiIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

// Grid columns — header + rows must match
const GRID = "2.5rem 1fr 4.5rem 6rem 5rem 6rem 3.5rem"

type LiDMChat = {
  conversationId: string
  chatName: string
  profileUrl: string | null
  contactId: string | null
  contact: {
    id: string
    firstName: string
    lastName: string
    company: string | null
    photoUrl: string | null
    city: string | null
    country: string | null
    linkedinDegree: string | null
    connectedOn: string | null
  } | null
  messageCount: number
  outboundCount: number
  firstAt: string | null
  lastAt: string | null
  lastIsOutbound: boolean | null
  ignored: boolean
  recentMessages: { sentAt: string; isOutbound: boolean }[]
}

type Stats = {
  totalChats: number
  totalMessages: number
  matched: number
  unmatched: number
  notConnected: number
  ignored: number
}

type Filter = "all" | "matched" | "unmatched" | "not_connected" | "ignored"
type Sort   = "lastAt" | "messageCount"
type Order  = "desc" | "asc"

function ChatRow({
  chat,
  blurred,
  onLinkClick,
  onContactClick,
  onRestore,
}: {
  chat: LiDMChat
  blurred: boolean
  onLinkClick: (chat: LiDMChat) => void
  onContactClick: (contactId: string) => void
  onRestore?: (conversationId: string) => void
}) {
  const contact = chat.contact
  const displayName = contact
    ? `${contact.firstName} ${contact.lastName}`
    : chat.chatName
  const inits = contact
    ? initials(contact.firstName, contact.lastName)
    : initials(chat.chatName.split(" ")[0] ?? "", chat.chatName.split(" ")[1] ?? "")

  const inboundCount = chat.messageCount - chat.outboundCount
  const responseRate = chat.messageCount > 0
    ? Math.round((inboundCount / chat.messageCount) * 100)
    : 0

  const country = normCountry(contact?.country)
  const flag = country ? countryFlag(country) : ""

  return (
    <div
      className="group grid items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 text-xs"
      style={{ gridTemplateColumns: GRID }}
    >
      {/* Avatar — click to open contact profile */}
      <div
        className={cn("shrink-0 w-9 h-9 rounded-full overflow-hidden", contact && "cursor-pointer")}
        onClick={() => contact && onContactClick(contact.id)}
      >
        {contact?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc(contact.photoUrl)!}
            alt={displayName}
            className={cn("w-9 h-9 rounded-full object-cover", blurred && "blur")}
          />
        ) : (
          <div className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold",
            contact ? "bg-gradient-to-br from-blue-500 to-blue-700" : "bg-gradient-to-br from-gray-400 to-gray-600"
          )}>
            {inits}
          </div>
        )}
      </div>

      {/* Name + company + LinkedIn link — click to open contact profile */}
      <div
        className={cn("min-w-0", contact && "cursor-pointer")}
        onClick={() => contact && onContactClick(contact.id)}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <p className={cn("text-sm font-semibold text-gray-900 truncate leading-tight", blurred && "blur-sm select-none")}>
            {displayName}
          </p>
          {chat.profileUrl && (
            <a
              href={chat.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-blue-400 hover:text-blue-600 transition-colors"
              title="View LinkedIn profile"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={11} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {contact?.company && (
            <p className="text-xs text-gray-400 truncate">{contact.company}</p>
          )}
          {!contact && (
            <p className="text-xs text-amber-500 font-medium">Not matched</p>
          )}
        </div>
      </div>

      {/* Message count badge */}
      <div className="shrink-0">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
          <LiIcon size={9} />
          {chat.messageCount.toLocaleString()}
        </span>
      </div>

      {/* Response rate bar */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-0">
            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${responseRate}%` }} />
          </div>
          <span className="text-xs text-gray-400 w-7 text-right shrink-0">{responseRate}%</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
          <span className="text-emerald-600">↓{inboundCount}</span>
          {" · "}
          <span className="text-blue-500">↑{chat.outboundCount}</span>
        </p>
      </div>

      {/* Country + flag */}
      <div className="min-w-0 flex items-center gap-1">
        {flag && <span className="text-sm leading-none shrink-0">{flag}</span>}
        {country && <p className="text-xs text-gray-500 truncate">{country}</p>}
      </div>

      {/* Last message + direction */}
      <div className="flex flex-col items-end shrink-0">
        {chat.lastAt ? (
          <>
            <span className={cn("font-medium tabular-nums", chat.lastIsOutbound ? "text-blue-500" : "text-emerald-600")}>
              {chat.lastIsOutbound === true ? "↑" : chat.lastIsOutbound === false ? "↓" : ""}{" "}
              {relTime(chat.lastAt)}
            </span>
            {chat.firstAt && (
              <span className="text-[10px] text-gray-300 tabular-nums">
                first {relTime(chat.firstAt)}
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-200">—</span>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center justify-end gap-2">
        {onRestore ? (
          <button
            onClick={() => onRestore(chat.conversationId)}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            title="Restore from ignored"
          >
            <RotateCcw size={11} />
            <span>Restore</span>
          </button>
        ) : contact ? (
          <>
            <Link
              href={`/contacts?contact=${contact.id}`}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 hover:text-blue-700"
              title="Open contact"
            >
              <ExternalLink size={12} />
            </Link>
            <button
              onClick={() => onLinkClick(chat)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
              title="Re-assign"
            >
              <Pencil size={11} />
            </button>
          </>
        ) : (
          <button
            onClick={() => onLinkClick(chat)}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
          >
            <UserPlus size={12} />
            <span>Link</span>
          </button>
        )}
      </div>
    </div>
  )
}

function NotConnectedCard({
  chat,
  blurred,
  onLinkClick,
  onContactClick,
  onIgnore,
}: {
  chat: LiDMChat
  blurred: boolean
  onLinkClick: (chat: LiDMChat) => void
  onContactClick: (contactId: string) => void
  onIgnore: (conversationId: string) => void
}) {
  const contact = chat.contact
  const displayName = contact
    ? `${contact.firstName} ${contact.lastName}`
    : chat.chatName
  const inits = contact
    ? initials(contact.firstName, contact.lastName)
    : initials(chat.chatName.split(" ")[0] ?? "", chat.chatName.split(" ")[1] ?? "")

  const degreeLabel = contact?.linkedinDegree === "2" ? "2nd degree"
    : contact?.linkedinDegree === "3" ? "3rd degree"
    : "No connection"

  const country = normCountry(contact?.country)
  const flag = country ? countryFlag(country) : ""

  return (
    <div className="group flex items-start gap-3 px-4 py-4 border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors">
      {/* Avatar */}
      <div
        className={cn("shrink-0 w-10 h-10 rounded-full overflow-hidden mt-0.5", contact && "cursor-pointer")}
        onClick={() => contact && onContactClick(contact.id)}
      >
        {contact?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc(contact.photoUrl)!}
            alt={displayName}
            className={cn("w-10 h-10 rounded-full object-cover", blurred && "blur")}
          />
        ) : (
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold",
            contact ? "bg-gradient-to-br from-blue-500 to-blue-700" : "bg-gradient-to-br from-gray-400 to-gray-600"
          )}>
            {inits}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p
                className={cn("font-semibold text-gray-900 hover:text-blue-600 transition-colors", contact && "cursor-pointer", blurred && "blur-sm select-none")}
                onClick={() => contact && onContactClick(contact.id)}
              >
                {displayName}
              </p>
              {chat.profileUrl && (
                <a
                  href={chat.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-600 transition-colors"
                  title="View LinkedIn profile"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
            {contact?.company && (
              <p className="text-xs text-gray-400 mt-0.5">{contact.company}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="inline-flex items-center text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                {degreeLabel}
              </span>
              {flag && country && (
                <span className="text-[10px] text-gray-400">{flag} {country}</span>
              )}
              {chat.messageCount > 0 && (
                <span className="text-[10px] text-gray-400">
                  {chat.messageCount} msg{chat.messageCount !== 1 ? "s" : ""}
                  {" · "}
                  <span className="text-emerald-600">↓{chat.messageCount - chat.outboundCount}</span>
                  {" "}
                  <span className="text-blue-500">↑{chat.outboundCount}</span>
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onLinkClick(chat)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-2 py-1 transition-colors"
              title={contact ? "Re-assign" : "Link to contact"}
            >
              {contact ? <Pencil size={11} /> : <UserPlus size={11} />}
              <span>{contact ? "Re-assign" : "Link"}</span>
            </button>
            <button
              onClick={() => onIgnore(chat.conversationId)}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-lg px-2 py-1 transition-colors"
              title="Move to Ignored"
            >
              <EyeOff size={11} />
              <span>Ignore</span>
            </button>
          </div>
        </div>

        {/* Message timeline — last 3 interactions */}
        {chat.recentMessages.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">History</span>
            {chat.recentMessages.map((msg, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
                  msg.isOutbound ? "text-blue-500" : "text-emerald-600"
                )}
              >
                {msg.isOutbound ? "↑" : "↓"} {relTime(msg.sentAt)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function LinkedInDMPage() {
  const { status } = useSession()
  const router = useRouter()
  const { blurred } = usePrivacy()

  const [chats, setChats] = useState<LiDMChat[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("lastAt")
  const [order, setOrder] = useState<Order>("desc")
  const [q, setQ] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const [rematching, setRematching] = useState(false)
  const [rematchResult, setRematchResult] = useState<{ fixed: number; checked: number } | null>(null)
  const [activeContactId, setActiveContactId] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ filter, sort, order, q })
    const res = await fetch(`/api/linkedin-dm/chats?${params}`)
    if (res.ok) {
      const data = await res.json()
      setChats(data.chats)
      setStats(data.stats)
    }
    setLoading(false)
  }, [filter, sort, order, q])

  useEffect(() => {
    if (status === "authenticated") load()
  }, [status, load])

  function toggleSort(s: Sort) {
    if (sort === s) setOrder((o) => (o === "desc" ? "asc" : "desc"))
    else { setSort(s); setOrder("desc") }
  }

  // Link / re-assign / unlink panel
  const [linkingChat, setLinkingChat] = useState<LiDMChat | null>(null)
  const [linkSearch, setLinkSearch] = useState("")
  const [linkResults, setLinkResults] = useState<{ id: string; firstName: string; lastName: string; company: string | null }[]>([])
  const [linking, setLinking] = useState(false)

  function openLinkModal(chat: LiDMChat) {
    setLinkingChat(chat)
    setLinkSearch("")
    setLinkResults([])
  }

  function closeLinkModal() {
    setLinkingChat(null)
    setLinkSearch("")
    setLinkResults([])
  }

  useEffect(() => {
    if (!linkSearch.trim()) { setLinkResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/contacts?q=${encodeURIComponent(linkSearch)}&limit=6`)
      if (res.ok) {
        const data = await res.json()
        setLinkResults(data.contacts ?? [])
      }
    }, 200)
    return () => clearTimeout(t)
  }, [linkSearch])

  async function doLink(conversationId: string, contactId: string) {
    setLinking(true)
    try {
      const res = await fetch("/api/linkedin-dm/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, contactId }),
      })
      if (res.ok) {
        closeLinkModal()
        await load()
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? "Failed to link contact")
      }
    } finally {
      setLinking(false)
    }
  }

  async function doRematch() {
    setRematching(true)
    setRematchResult(null)
    try {
      const res = await fetch("/api/linkedin-dm/match", { method: "PUT" })
      if (res.ok) {
        const data = await res.json()
        setRematchResult({ fixed: data.fixed, checked: data.checked })
        await load()
      }
    } finally {
      setRematching(false)
    }
  }

  async function doIgnore(conversationId: string) {
    await fetch("/api/linkedin-dm/ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    })
    await load()
  }

  async function doRestore(conversationId: string) {
    await fetch("/api/linkedin-dm/ignore", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    })
    await load()
  }

  async function doUnlink(conversationId: string) {
    setLinking(true)
    try {
      const res = await fetch("/api/linkedin-dm/match", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      })
      if (res.ok) {
        closeLinkModal()
        await load()
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? "Failed to unlink")
      }
    } finally {
      setLinking(false)
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-sm">
            <LiIcon size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">LinkedIn Messages</h1>
            <p className="text-sm text-gray-500">Direct messages imported from LinkedIn export</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {stats && stats.unmatched > 0 && (
            <button
              onClick={doRematch}
              disabled={rematching}
              title="Re-run automatic matching on all unmatched conversations using the latest algorithm"
              className="flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900 transition-colors disabled:opacity-50"
            >
              {rematching ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {rematching ? "Matching…" : `Re-match (${stats.unmatched})`}
            </button>
          )}
          {rematchResult && !rematching && (
            <span className="text-xs text-blue-600 font-medium">
              ✓ {rematchResult.fixed} newly matched
            </span>
          )}
          <Link
            href="/settings#linkedin-dm"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Settings size={14} />
            Import / reset
          </Link>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total chats", value: stats.totalChats.toLocaleString() },
            { label: "Messages", value: stats.totalMessages.toLocaleString() },
            { label: "Matched contacts", value: stats.matched.toLocaleString(), accent: true },
            { label: "Not matched", value: stats.unmatched.toLocaleString() },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
              <p className={cn("text-2xl font-bold", accent ? "text-blue-600" : "text-gray-900")}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* LinkedIn DM note */}
      <div className="mb-4 text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
        <Users size={12} className="shrink-0" />
        <span>
          LinkedIn only exports 1-to-1 direct messages. Group conversations are not included in the archive.
        </span>
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
          {([
            { id: "all",           label: "All",           count: stats?.totalChats },
            { id: "matched",       label: "Matched",       count: stats?.matched },
            { id: "unmatched",     label: "Unmatched",     count: stats?.unmatched },
            { id: "not_connected", label: "Not Connected", count: stats?.notConnected, alert: true },
            { id: "ignored",       label: "Ignored",       count: stats?.ignored },
          ] as { id: Filter; label: string; count?: number; alert?: boolean }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                filter === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                  tab.alert
                    ? filter === tab.id ? "bg-amber-100 text-amber-700" : "bg-amber-200 text-amber-800"
                    : filter === tab.id ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-[120px]">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="text-sm outline-none flex-1 bg-transparent w-0"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {/* Column headers — hidden for not_connected (uses card layout) */}
        {filter !== "not_connected" && (
          <div
            className="grid items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-400 uppercase tracking-wide"
            style={{ gridTemplateColumns: GRID }}
          >
            <div />
            <div>Name</div>
            <button
              onClick={() => toggleSort("messageCount")}
              className={cn("flex items-center justify-center gap-1 hover:text-gray-600 transition-colors", sort === "messageCount" && "text-gray-600")}
            >
              Msgs
              {sort === "messageCount" ? (order === "desc" ? <ArrowDown size={10} className="text-blue-500" /> : <ArrowUp size={10} className="text-blue-500" />) : <ArrowUpDown size={9} className="opacity-30" />}
            </button>
            <div>Response</div>
            <div>Country</div>
            <button
              onClick={() => toggleSort("lastAt")}
              className={cn("flex items-center justify-end gap-1 hover:text-gray-600 transition-colors", sort === "lastAt" && "text-gray-600")}
            >
              Last
              {sort === "lastAt" ? (order === "desc" ? <ArrowDown size={10} className="text-blue-500" /> : <ArrowUp size={10} className="text-blue-500" />) : <ArrowUpDown size={9} className="opacity-30" />}
            </button>
            <div />
          </div>
        )}

        {filter === "not_connected" && chats.length > 0 && (
          <div className="px-4 py-2.5 border-b border-gray-100 bg-amber-50 flex items-center gap-2">
            <EyeOff size={12} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">
              These contacts sent you messages but are not in your LinkedIn connections.
              Keep, link to a contact, or ignore each one.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <div className="py-16 text-center">
            <LiIcon size={32} className="text-gray-200 mx-auto mb-3" />
            {stats?.totalChats === 0 ? (
              <>
                <p className="text-sm font-medium text-gray-500">No LinkedIn DM data yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  <Link href="/settings#linkedin-dm" className="text-blue-600 hover:underline">Import your messages</Link> from Settings
                </p>
              </>
            ) : filter === "not_connected" ? (
              <p className="text-sm text-gray-400">No unconnected senders found</p>
            ) : filter === "ignored" ? (
              <p className="text-sm text-gray-400">No ignored conversations</p>
            ) : (
              <p className="text-sm text-gray-400">No chats match your filters</p>
            )}
          </div>
        ) : filter === "not_connected" ? (
          chats.map((chat) => (
            <NotConnectedCard
              key={chat.conversationId}
              chat={chat}
              blurred={blurred}
              onLinkClick={openLinkModal}
              onContactClick={setActiveContactId}
              onIgnore={doIgnore}
            />
          ))
        ) : (
          chats.map((chat) => (
            <ChatRow
              key={chat.conversationId}
              chat={chat}
              blurred={blurred}
              onLinkClick={openLinkModal}
              onContactClick={setActiveContactId}
              onRestore={filter === "ignored" ? doRestore : undefined}
            />
          ))
        )}
      </div>

      {/* Link / re-assign / unlink modal */}
      {linkingChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeLinkModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900">
                {linkingChat.contact ? "Re-assign chat" : "Link to contact"}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-medium text-gray-700">{linkingChat.chatName}</span>
              </p>
              {linkingChat.contact && (
                <div className="mt-2 flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-xs text-gray-500">Currently linked to</p>
                    <p className="text-sm font-medium text-gray-800">
                      {linkingChat.contact.firstName} {linkingChat.contact.lastName}
                    </p>
                    {linkingChat.contact.company && (
                      <p className="text-xs text-gray-400">{linkingChat.contact.company}</p>
                    )}
                  </div>
                  <button
                    disabled={linking}
                    onClick={() => doUnlink(linkingChat.conversationId)}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 font-medium disabled:opacity-50 ml-3 shrink-0"
                  >
                    {linking ? <Loader2 size={12} className="animate-spin" /> : <Unlink2 size={13} />}
                    Unlink
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 mb-3">
              <Search size={13} className="text-gray-400 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder={linkingChat.contact ? "Search to re-assign…" : "Search contacts…"}
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                className="text-sm outline-none flex-1"
              />
            </div>
            {linkResults.length > 0 && (
              <ul className="border border-gray-100 rounded-xl overflow-hidden mb-4 divide-y divide-gray-50 max-h-56 overflow-y-auto">
                {linkResults.map((c) => (
                  <li key={c.id}>
                    <button
                      disabled={linking}
                      onClick={() => doLink(linkingChat.conversationId, c.id)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors flex items-center gap-3 disabled:opacity-50"
                    >
                      {linking ? (
                        <Loader2 size={12} className="animate-spin text-blue-600 shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {initials(c.firstName, c.lastName)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{c.firstName} {c.lastName}</p>
                        {c.company && <p className="text-xs text-gray-400 truncate">{c.company}</p>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {linkSearch.trim() && linkResults.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3 mb-3">No contacts found</p>
            )}
            <div className="flex justify-end">
              <button onClick={closeLinkModal} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact detail slide-in panel */}
      {activeContactId && (
        <ContactDetail
          contactId={activeContactId}
          onClose={() => setActiveContactId(null)}
        />
      )}
    </div>
  )
}
