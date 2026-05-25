"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  Search, ArrowUpDown, ChevronUp, ChevronDown, UserPlus,
  ExternalLink, Loader2, Settings, Users, Pencil, Unlink2
} from "lucide-react"
import { cn, initials, formatDate, photoSrc } from "@/lib/utils"
import { usePrivacy } from "@/contexts/PrivacyContext"
import Link from "next/link"

// WhatsApp green SVG logo
function WAIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  )
}

type WAChat = {
  chatName: string
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
  chat: WAChat
  blurred: boolean
  onLinkClick: (chat: WAChat) => void
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
            contact ? "bg-gradient-to-br from-green-500 to-green-700" : "bg-gradient-to-br from-gray-400 to-gray-600"
          )}>
            {inits}
          </div>
        )}
      </div>

      {/* Name + company — flex-1 on mobile, fixed on sm+ */}
      <div className="flex-1 min-w-0 sm:w-44 sm:flex-none">
        <p className={cn("text-sm font-semibold text-gray-900 truncate", blurred && "blur-sm select-none")}>
          {displayName}
        </p>
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
        <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 rounded-full px-2 py-0.5">
          <WAIcon size={9} />
          {chat.messageCount.toLocaleString()}
        </span>
      </div>

      {/* Response rate — md+ only */}
      <div className="w-28 shrink-0 hidden md:block">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full" style={{ width: `${responseRate}%` }} />
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
        active ? "text-green-700" : "text-gray-400 hover:text-gray-600"
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

export default function WhatsAppPage() {
  const { status } = useSession()
  const router = useRouter()
  const { blurred } = usePrivacy()

  const [chats, setChats] = useState<WAChat[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("lastAt")
  const [order, setOrder] = useState<Order>("desc")
  const [q, setQ] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ filter, sort, order, q })
    const res = await fetch(`/api/whatsapp/chats?${params}`)
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
  const [linkingChat, setLinkingChat] = useState<WAChat | null>(null)
  const [linkSearch, setLinkSearch] = useState("")
  const [linkResults, setLinkResults] = useState<{ id: string; firstName: string; lastName: string; company: string | null }[]>([])
  const [linking, setLinking] = useState(false)

  function openLinkModal(chat: WAChat) {
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

  async function doLink(chatName: string, contactId: string) {
    setLinking(true)
    try {
      const res = await fetch("/api/whatsapp/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatName, contactId }),
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

  async function doUnlink(chatName: string) {
    setLinking(true)
    try {
      const res = await fetch("/api/whatsapp/match", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatName }),
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
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-green-500 flex items-center justify-center shadow-sm">
            <WAIcon size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
            <p className="text-sm text-gray-500">Chat history imported from your phone</p>
          </div>
        </div>
        <Link
          href="/settings#whatsapp"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Settings size={14} />
          Import / reset
        </Link>
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
              <p className={cn("text-2xl font-bold", accent ? "text-green-600" : "text-gray-900")}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Groups note */}
      <div className="mb-4 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
        <Users size={12} className="shrink-0" />
        <span>
          <strong>Group chats</strong> are excluded from the SQLite import (only 1-to-1 conversations are imported).
          If you uploaded .txt exports of group chats, they appear here as unmatched chats.
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
          <div className="shrink-0 w-16 text-center">Messages</div>
          <div className="w-28 shrink-0 hidden md:block">Response rate</div>
          <div className="w-20 shrink-0 hidden lg:block">First</div>
          <div className="w-24 shrink-0 hidden sm:block">Last</div>
          <div className="shrink-0 w-12" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <div className="py-16 text-center">
            <WAIcon size={32} className="text-gray-200 mx-auto mb-3" />
            {stats?.totalChats === 0 ? (
              <>
                <p className="text-sm font-medium text-gray-500">No WhatsApp data yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  <Link href="/settings" className="text-green-600 hover:underline">Import your chats</Link> from Settings
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400">No chats match your filters</p>
            )}
          </div>
        ) : (
          chats.map((chat) => (
            <ChatRow
              key={chat.chatName}
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
                <div className="mt-2 flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-3 py-2">
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
                    onClick={() => doUnlink(linkingChat.chatName)}
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
                      onClick={() => doLink(linkingChat.chatName, c.id)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors flex items-center gap-3 disabled:opacity-50"
                    >
                      {linking ? (
                        <Loader2 size={12} className="animate-spin text-green-600 shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
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
