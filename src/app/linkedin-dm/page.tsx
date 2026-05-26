"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronUp, ChevronDown, UserPlus,
  ExternalLink, Loader2, Settings, Users, Pencil, Unlink2
} from "lucide-react"
import { cn, initials, formatDate, photoSrc } from "@/lib/utils"
import { usePrivacy } from "@/contexts/PrivacyContext"
import Link from "next/link"

// LinkedIn blue SVG logo
function LiIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

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
  } | null
  messageCount: number
  outboundCount: number
  firstAt: string | null
  lastAt: string | null
}

type Stats = {
  totalChats: number
  totalMessages: number
  matched: number
  unmatched: number
}

type Filter = "all" | "matched" | "unmatched"
type Sort   = "lastAt" | "messageCount"
type Order  = "desc" | "asc"

function ChatRow({
  chat,
  blurred,
  onLinkClick,
}: {
  chat: LiDMChat
  blurred: boolean
  onLinkClick: (chat: LiDMChat) => void
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

  return (
    <div className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 transition-colors group border-b border-gray-50 last:border-0">
      {/* Avatar */}
      <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden">
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

      {/* Name + company — flex-1 on mobile, fixed on sm+ */}
      <div className="flex-1 min-w-0 sm:w-44 sm:flex-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className={cn("text-sm font-semibold text-gray-900 truncate", blurred && "blur-sm select-none")}>
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
        <div className="flex items-center gap-2 flex-wrap">
          {contact?.company && (
            <p className="text-xs text-gray-400 truncate">{contact.company}</p>
          )}
          {!contact && (
            <p className="text-xs text-amber-500 font-medium">Not matched</p>
          )}
          {/* Show last date inline on mobile */}
          {chat.lastAt && (
            <p className="text-xs text-gray-400 sm:hidden">{formatDate(chat.lastAt)}</p>
          )}
        </div>
      </div>

      {/* Message count */}
      <div className="shrink-0">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
          <LiIcon size={9} />
          {chat.messageCount.toLocaleString()}
        </span>
      </div>

      {/* Response rate — md+ only */}
      <div className="w-28 shrink-0 hidden md:block">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${responseRate}%` }} />
          </div>
          <span className="text-xs text-gray-400 w-8 text-right">{responseRate}%</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {inboundCount} recv · {chat.outboundCount} sent
        </p>
      </div>

      {/* First contact — lg+ only */}
      <div className="w-20 shrink-0 hidden lg:block">
        <p className="text-xs text-gray-400">{chat.firstAt ? formatDate(chat.firstAt) : "—"}</p>
        <p className="text-[10px] text-gray-300">first</p>
      </div>

      {/* Last message — hidden on mobile (shown inline above) */}
      <div className="w-24 shrink-0 hidden sm:block">
        <p className="text-xs font-medium text-gray-700">{chat.lastAt ? formatDate(chat.lastAt) : "—"}</p>
        <p className="text-[10px] text-gray-400">last</p>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-2">
        {contact ? (
          <>
            {/* View — always visible on mobile, hover-only on desktop */}
            <Link
              href={`/contacts?id=${contact.id}`}
              className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <ExternalLink size={12} />
              <span className="hidden sm:inline">View</span>
            </Link>
            {/* Change assignment */}
            <button
              onClick={() => onLinkClick(chat)}
              className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              title="Re-assign to different contact"
            >
              <Pencil size={11} />
            </button>
          </>
        ) : (
          <button
            onClick={() => onLinkClick(chat)}
            className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            <UserPlus size={12} />
            <span className="hidden sm:inline">Link</span>
          </button>
        )}
      </div>
    </div>
  )
}

function SortButton({
  label, active, order, onToggle,
}: {
  label: string; active: boolean; order: Order; onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1 text-xs font-medium transition-colors",
        active ? "text-blue-700" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {label}
      {active
        ? order === "desc" ? <ChevronDown size={13} /> : <ChevronUp size={13} />
        : <ArrowUpDown size={12} />
      }
    </button>
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
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {(["all", "matched", "unmatched"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize whitespace-nowrap",
                filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {f === "all" ? `All${stats ? ` (${stats.totalChats})` : ""}` :
               f === "matched" ? `Matched${stats ? ` (${stats.matched})` : ""}` :
               `Unmatched${stats ? ` (${stats.unmatched})` : ""}`}
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

        {/* Sort controls */}
        <div className="flex items-center gap-3">
          <SortButton
            label="Last msg"
            active={sort === "lastAt"}
            order={order}
            onToggle={() => toggleSort("lastAt")}
          />
          <SortButton
            label="Count"
            active={sort === "messageCount"}
            order={order}
            onToggle={() => toggleSort("messageCount")}
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {/* Column headers — hidden on mobile, shown sm+ */}
        <div className="hidden sm:flex items-center gap-3 px-3 py-2 border-b border-gray-100 bg-gray-50 text-xs text-gray-400 font-medium">
          <div className="w-9 shrink-0" />
          <div className="flex-1 min-w-0 sm:w-44 sm:flex-none">Name</div>
          <button
            onClick={() => toggleSort("messageCount")}
            className={cn("shrink-0 w-16 flex items-center justify-center gap-1 hover:text-gray-600 transition-colors", sort === "messageCount" && "text-gray-600")}
          >
            Messages
            {sort === "messageCount" ? (order === "desc" ? <ArrowDown size={10} className="text-blue-500" /> : <ArrowUp size={10} className="text-blue-500" />) : <ArrowUpDown size={9} className="opacity-30" />}
          </button>
          <div className="w-28 shrink-0 hidden md:block">Response rate</div>
          <div className="w-20 shrink-0 hidden lg:block">First</div>
          <button
            onClick={() => toggleSort("lastAt")}
            className={cn("shrink-0 w-24 flex items-center gap-1 hidden sm:flex hover:text-gray-600 transition-colors", sort === "lastAt" && "text-gray-600")}
          >
            Last
            {sort === "lastAt" ? (order === "desc" ? <ArrowDown size={10} className="text-blue-500" /> : <ArrowUp size={10} className="text-blue-500" />) : <ArrowUpDown size={9} className="opacity-30" />}
          </button>
          <div className="shrink-0 w-12" />
        </div>

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
            ) : (
              <p className="text-sm text-gray-400">No chats match your filters</p>
            )}
          </div>
        ) : (
          chats.map((chat) => (
            <ChatRow
              key={chat.conversationId}
              chat={chat}
              blurred={blurred}
              onLinkClick={openLinkModal}
            />
          ))
        )}
      </div>

      {/* Link / re-assign / unlink modal */}
      {linkingChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeLinkModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900">
                {linkingChat.contact ? "Re-assign chat" : "Link to contact"}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-medium text-gray-700">{linkingChat.chatName}</span>
              </p>
              {/* Current assignment pill */}
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
                    title="Remove this link"
                  >
                    {linking ? <Loader2 size={12} className="animate-spin" /> : <Unlink2 size={13} />}
                    Unlink
                  </button>
                </div>
              )}
            </div>

            {/* Search */}
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
              <button
                onClick={closeLinkModal}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
