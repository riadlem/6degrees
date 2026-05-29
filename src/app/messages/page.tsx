"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Search, ArrowUp, ArrowDown, Loader2 } from "lucide-react"
import { cn, initials, photoSrc } from "@/lib/utils"
import { usePrivacy } from "@/contexts/PrivacyContext"
import MessagesTabBar from "@/components/MessagesTabBar"

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

function WAIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  )
}

function LiIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

type UnifiedChat = {
  id: string
  source: "wa" | "linkedin"
  chatName: string
  contactId: string | null
  lastAt: string | null
  lastIsOutbound: boolean | null
  contact: {
    id: string
    firstName: string
    lastName: string
    company: string | null
    photoUrl: string | null
  } | null
}

export default function MessagesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { blurred } = usePrivacy()

  const [chats, setChats] = useState<UnifiedChat[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth/signin"); return }
    if (status !== "authenticated") return
    fetch("/api/messages/unified")
      .then((r) => r.json())
      .then((d) => setChats(d.chats ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status, router])

  const filtered = q
    ? chats.filter((c) => {
        const name = c.contact
          ? `${c.contact.firstName} ${c.contact.lastName}`.toLowerCase()
          : c.chatName.toLowerCase()
        return name.includes(q.toLowerCase()) || c.chatName.toLowerCase().includes(q.toLowerCase())
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
            placeholder="Search conversations…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        {!loading && (
          <span className="text-xs text-gray-400 shrink-0">{filtered.length} threads</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          {q ? "No conversations match your search." : "No messages yet. Import WhatsApp or sync LinkedIn DMs."}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {filtered.map((chat) => {
            const displayName = chat.contact
              ? `${chat.contact.firstName} ${chat.contact.lastName}`
              : chat.chatName
            const company = chat.contact?.company ?? null
            const photo = chat.contact?.photoUrl ?? null
            const nameParts = (chat.contact
              ? `${chat.contact.firstName} ${chat.contact.lastName}`
              : chat.chatName
            ).split(/\s+/)
            const ini = initials(nameParts[0] ?? "", nameParts[1] ?? "")

            return (
              <div key={chat.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                {/* Source badge */}
                <div
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                    chat.source === "wa" ? "bg-green-500 text-white" : "bg-blue-600 text-white"
                  )}
                >
                  {chat.source === "wa" ? <WAIcon size={11} /> : <LiIcon size={11} />}
                </div>

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

                {/* Name + company */}
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium text-gray-900 truncate", blurred && "blur-sm")}>
                    {displayName}
                  </p>
                  {company && (
                    <p className={cn("text-xs text-gray-400 truncate", blurred && "blur-sm")}>
                      {company}
                    </p>
                  )}
                </div>

                {/* Direction + time */}
                <div className="flex items-center gap-1.5 shrink-0 text-right">
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
