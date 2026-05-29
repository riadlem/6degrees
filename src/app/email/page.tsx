"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Search, ArrowUp, ArrowDown, Loader2, Mail } from "lucide-react"
import { cn, initials, photoSrc } from "@/lib/utils"
import { usePrivacy } from "@/contexts/PrivacyContext"
import MessagesTabBar from "@/components/MessagesTabBar"
import Link from "next/link"

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

type UnifiedChat = {
  id: string
  source: "wa" | "linkedin" | "email"
  chatName: string
  contactId: string | null
  lastAt: string | null
  lastIsOutbound: boolean | null
  subject?: string | null
  contact: {
    id: string
    firstName: string
    lastName: string
    company: string | null
    photoUrl: string | null
  } | null
}

export default function EmailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { blurred } = usePrivacy()

  const [chats, setChats] = useState<UnifiedChat[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth/signin"); return }
    if (status !== "authenticated") return
    fetch("/api/messages/unified?source=email")
      .then((r) => r.json())
      .then((d) => setChats((d.chats ?? []).filter((c: UnifiedChat) => c.source === "email")))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status, router])

  const filtered = q
    ? chats.filter((c) => {
        const name = c.contact
          ? `${c.contact.firstName} ${c.contact.lastName}`.toLowerCase()
          : c.chatName.toLowerCase()
        return (
          name.includes(q.toLowerCase()) ||
          c.chatName.toLowerCase().includes(q.toLowerCase()) ||
          (c.subject ?? "").toLowerCase().includes(q.toLowerCase())
        )
      })
    : chats

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <MessagesTabBar />

      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email exchanges…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
        </div>
        {!loading && chats.length > 0 && (
          <span className="text-xs text-gray-400 shrink-0">{filtered.length} contacts</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading…
        </div>
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Mail size={24} className="text-indigo-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900 mb-1">No email exchanges yet</p>
            <p className="text-xs text-gray-400 mb-4">Connect your Gmail account to see email interactions with your contacts.</p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:text-indigo-700"
            >
              Connect Gmail in Settings →
            </Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          No email exchanges match your search.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {filtered.map((chat) => {
            const displayName = chat.contact
              ? `${chat.contact.firstName} ${chat.contact.lastName}`
              : chat.chatName
            const photo = chat.contact?.photoUrl ?? null
            const nameParts = displayName.split(/\s+/)
            const ini = initials(nameParts[0] ?? "", nameParts[1] ?? "")

            return (
              <div key={chat.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                  {photo ? (
                    <img
                      src={photoSrc(photo) ?? photo}
                      alt={displayName}
                      className={cn("w-full h-full object-cover", blurred && "blur-sm")}
                    />
                  ) : (
                    <span className="text-xs font-semibold text-gray-500">{ini}</span>
                  )}
                </div>

                {/* Name + subject */}
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium text-gray-900 truncate", blurred && "blur-sm")}>
                    {displayName}
                  </p>
                  {chat.subject && (
                    <p className={cn("text-xs text-gray-400 truncate", blurred && "blur-sm")}>
                      {chat.subject}
                    </p>
                  )}
                </div>

                {/* Direction + time */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {chat.lastIsOutbound !== null && (
                    chat.lastIsOutbound
                      ? <ArrowUp size={12} className="text-blue-400" />
                      : <ArrowDown size={12} className="text-green-500" />
                  )}
                  {chat.lastAt && (
                    <span className="text-xs text-gray-400">{relTime(chat.lastAt)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
