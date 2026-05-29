"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Search, ArrowUp, ArrowDown, Loader2, Settings, ExternalLink } from "lucide-react"
import { cn, initials, photoSrc } from "@/lib/utils"
import { usePrivacy } from "@/contexts/PrivacyContext"
import MessagesTabBar from "@/components/MessagesTabBar"
import ContactDetail from "@/components/ContactDetail"
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

function MailIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  )
}

type UnifiedChat = {
  id: string
  source: "wa" | "linkedin" | "email"
  chatName: string
  contactId: string | null
  lastAt: string | null
  lastIsOutbound: boolean | null
  subject?: string | null
  profileUrl: string | null
  contact: {
    id: string
    firstName: string
    lastName: string
    company: string | null
    photoUrl: string | null
    profileUrl: string | null
  } | null
}

function SourceBadge({ source }: { source: UnifiedChat["source"] }) {
  if (source === "wa") {
    return (
      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-green-500 text-white">
        <WAIcon size={11} />
      </div>
    )
  }
  if (source === "linkedin") {
    return (
      <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 bg-blue-600 text-white">
        <LiIcon size={11} />
      </div>
    )
  }
  return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-indigo-500 text-white">
      <MailIcon size={10} />
    </div>
  )
}

// Returns a WhatsApp deep-link if chatName looks like a phone number, else null.
function waDeepLink(chatName: string): string | null {
  const digits = chatName.replace(/[\s\-().+]/g, "")
  if (/^\d{7,15}$/.test(digits)) return `https://wa.me/${digits}`
  return null
}

export default function MessagesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { blurred } = usePrivacy()

  const [chats, setChats] = useState<UnifiedChat[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [activeContactId, setActiveContactId] = useState<string | null>(null)

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

      {/* Channel import CTAs */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Link href="/settings#whatsapp" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-700 transition-colors">
          <WAIcon size={13} />
          <span>WhatsApp import</span>
        </Link>
        <span className="text-gray-200">·</span>
        <Link href="/settings#linkedin-dm" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700 transition-colors">
          <LiIcon size={13} />
          <span>LinkedIn DM import</span>
        </Link>
        <span className="text-gray-200">·</span>
        <Link href="/settings#gmail" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-700 transition-colors">
          <MailIcon size={13} />
          <span>Gmail connect</span>
        </Link>
        <div className="flex-1" />
        <Link href="/settings" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <Settings size={13} />
          <span>Import / reset</span>
        </Link>
      </div>

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
        <div className="text-center py-16 text-gray-400 text-sm space-y-3">
          {q ? (
            <p>No conversations match your search.</p>
          ) : (
            <>
              <p className="font-medium text-gray-500">No messages yet</p>
              <p>Import your conversations to get started:</p>
              <div className="flex flex-col items-center gap-2 mt-2">
                <Link href="/settings#whatsapp" className="flex items-center gap-2 text-green-600 hover:text-green-700 font-medium"><WAIcon size={14} /> Import WhatsApp chats</Link>
                <Link href="/settings#linkedin-dm" className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"><LiIcon size={14} /> Import LinkedIn DMs</Link>
                <Link href="/settings#gmail" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium"><MailIcon size={14} /> Connect Gmail</Link>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
          {filtered.map((chat) => {
            const displayName = chat.contact
              ? `${chat.contact.firstName} ${chat.contact.lastName}`
              : chat.chatName
            const company = chat.contact?.company ?? null
            const photo = chat.contact?.photoUrl ?? null
            const nameParts = displayName.split(/\s+/)
            const ini = initials(nameParts[0] ?? "", nameParts[1] ?? "")
            const secondaryLine = chat.source === "email"
              ? (chat.subject ?? company)
              : company

            // LinkedIn profile URL: prefer conversation-level, fall back to contact's stored URL,
            // and for LinkedIn-source chats always show at least a name-search link
            const liProfileUrl = chat.profileUrl
              ?? chat.contact?.profileUrl
              ?? (chat.source === "linkedin"
                  ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(displayName)}`
                  : null)
            // WhatsApp deep-link (only for WA source with a phone-number chatName)
            const waLink = chat.source === "wa" ? waDeepLink(chat.chatName) : null

            return (
              <div key={chat.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <SourceBadge source={chat.source} />

                {/* Avatar — click to open contact panel */}
                <div
                  className={cn(
                    "w-9 h-9 rounded-full overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center",
                    chat.contact && "cursor-pointer"
                  )}
                  onClick={() => chat.contact && setActiveContactId(chat.contact.id)}
                >
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

                {/* Name + secondary line — click name to open contact panel */}
                <div
                  className={cn("flex-1 min-w-0", chat.contact && "cursor-pointer")}
                  onClick={() => chat.contact && setActiveContactId(chat.contact.id)}
                >
                  <p className={cn("text-sm font-medium text-gray-900 truncate", blurred && "blur-sm")}>
                    {displayName}
                  </p>
                  {secondaryLine && (
                    <p className={cn("text-xs text-gray-400 truncate", blurred && "blur-sm")}>
                      {secondaryLine}
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

                {/* Action icons — visible on hover */}
                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* LinkedIn profile link */}
                  {liProfileUrl && (
                    <a
                      href={liProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View LinkedIn profile"
                      className="text-blue-400 hover:text-blue-600 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <LiIcon size={13} />
                    </a>
                  )}
                  {/* WhatsApp conversation link */}
                  {chat.source === "wa" && (
                    waLink ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in WhatsApp"
                        className="text-green-500 hover:text-green-700 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <WAIcon size={13} />
                      </a>
                    ) : (
                      <Link
                        href="/whatsapp"
                        title="Go to WhatsApp"
                        className="text-green-500 hover:text-green-700 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <WAIcon size={13} />
                      </Link>
                    )
                  )}
                  {/* Open contact page */}
                  {chat.contact && (
                    <Link
                      href={`/contacts?contact=${chat.contact.id}`}
                      title="Open contact"
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={12} />
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
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
