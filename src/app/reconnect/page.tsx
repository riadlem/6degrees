"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { RefreshCcw, Mail, Clock, ChevronRight, Sparkles, ExternalLink, Check, MoreHorizontal, Ban, AlarmClock, Timer } from "lucide-react"
import { cn, initials, formatDate } from "@/lib/utils"
import ContactDetail from "@/components/ContactDetail"
import OutreachDraftModal from "@/components/OutreachDraftModal"
import EnrichContent from "@/components/EnrichContent"

type ReconnectContact = {
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
  outreachUpdatedAt: string | null
  labels: { label: { id: string; name: string; color: string } }[]
}

const STATUS_TABS = [
  { value: "",               label: "All" },
  { value: "lkd_pending",    label: "Invite to LinkedIn" },
  { value: "not_contacted",  label: "Not contacted" },
  { value: "drafted",        label: "Drafted" },
  { value: "sent",           label: "Sent" },
  { value: "meeting_booked", label: "Meeting booked" },
  { value: "responded",      label: "Responded" },
  { value: "meeting_done",   label: "Meeting done" },
]

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  lkd_pending:   { label: "Invite to LinkedIn", className: "bg-sky-50 text-sky-700" },
  not_contacted: { label: "Not contacted",       className: "bg-gray-100 text-gray-600" },
  drafted:       { label: "Drafted",             className: "bg-blue-50 text-blue-700" },
  sent:          { label: "Sent",                className: "bg-amber-50 text-amber-700" },
  responded:     { label: "Responded",           className: "bg-green-50 text-green-700" },
  meeting_booked:{ label: "Meeting booked",      className: "bg-purple-50 text-purple-700" },
  meeting_done:  { label: "Meeting done",        className: "bg-emerald-50 text-emerald-700" },
  deprioritized: { label: "Deprioritized",       className: "bg-gray-100 text-gray-400" },
}

export default function ReconnectPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<"reconnect" | "enrich">("reconnect")
  const [contacts, setContacts] = useState<ReconnectContact[]>([])
  const [total, setTotal] = useState(0)
  const [blockedCount, setBlockedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeStatus, setActiveStatus] = useState("")
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [draftContact, setDraftContact] = useState<ReconnectContact | null>(null)
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeStatus) params.set("status", activeStatus)
      const res = await fetch(`/api/reconnect?${params}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.contacts)
        setTotal(data.total)
        setBlockedCount(data.blockedCount ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [activeStatus])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function updateStatus(contactId: string, newStatus: string) {
    await fetch(`/api/reconnect/${contactId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    setContacts((prev) =>
      prev.map((c) => c.id === contactId ? { ...c, outreachStatus: newStatus } : c),
    )
  }

  async function markInvitationSent(contactId: string) {
    await fetch(`/api/reconnect/${contactId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: null }),
    })
    setContacts((prev) => prev.filter((c) => c.id !== contactId))
    setTotal((t) => Math.max(0, t - 1))
  }

  async function snoozeContact(contactId: string, days: number) {
    await fetch(`/api/reconnect/${contactId}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    })
    setContacts((prev) => prev.filter((c) => c.id !== contactId))
    setTotal((t) => Math.max(0, t - 1))
    setMoreOpenId(null)
  }

  async function deprioritizeContact(contactId: string) {
    await updateStatus(contactId, "deprioritized")
    // Move to bottom — refetch so deprioritized sorting is applied
    fetchContacts()
    setMoreOpenId(null)
  }

  async function blockContact(contactId: string) {
    await updateStatus(contactId, "ignored")
    setContacts((prev) => prev.filter((c) => c.id !== contactId))
    setTotal((t) => Math.max(0, t - 1))
    setBlockedCount((n) => n + 1)
    setMoreOpenId(null)
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCcw size={20} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Reconnect</h1>
        </div>
        <p className="text-sm text-gray-500">
          People worth reaching out to, ranked by relationship strength and time since last contact.
        </p>
      </div>

      {/* Top-level tab switcher */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("reconnect")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "reconnect" ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700",
          )}
        >
          <RefreshCcw size={13} />
          Reach out
        </button>
        <button
          onClick={() => setActiveTab("enrich")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "enrich" ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700",
          )}
        >
          <Sparkles size={13} />
          Enrich
        </button>
        <div className="flex-1" />
      </div>

      {/* Enrich tab */}
      {activeTab === "enrich" && <EnrichContent />}

      {/* Reconnect tab */}
      {activeTab === "reconnect" && (<>

      {/* Status sub-tabs (scrollable on mobile) */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto scrollbar-none">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveStatus(tab.value)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0",
              activeStatus === tab.value
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1 shrink-0" />
        <span className="self-center text-xs text-gray-400 pr-1 shrink-0">{total} contacts</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <RefreshCcw size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-500">No contacts here yet</p>
          <p className="text-sm mt-1">
            {activeStatus
              ? "Try a different filter."
              : <>Sync your Gmail in <a href="/settings" className="text-blue-600 hover:underline">Settings</a> to surface contacts worth reaching out to.</>}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => {
            const inits = initials(contact.firstName, contact.lastName)
            const statusInfo = STATUS_LABELS[contact.outreachStatus ?? "not_contacted"] ?? STATUS_LABELS.not_contacted
            const score = contact.interactionScore ?? 0
            const scoreWidth = Math.min(100, score * 20)
            const isDeprioritized = contact.outreachStatus === "deprioritized"

            return (
              <div
                key={contact.id}
                className={cn(
                  "bg-white border rounded-xl px-4 py-3 flex items-center gap-4 hover:border-gray-300 transition-colors group",
                  isDeprioritized ? "border-gray-100 opacity-60" : "border-gray-200",
                )}
              >
                {/* Avatar */}
                <button
                  onClick={() => setSelectedContactId(contact.id)}
                  className="shrink-0"
                >
                  {contact.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={contact.photoUrl} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold">
                      {inits}
                    </div>
                  )}
                </button>

                {/* Info */}
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setSelectedContactId(contact.id)}
                >
                  <p className="font-medium text-gray-900 truncate">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {[contact.position, contact.company].filter(Boolean).join(" at ")}
                  </p>

                  {/* Score bar */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-24 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${scoreWidth}%` }}
                      />
                    </div>
                    {contact.lastInteractionAt && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} />
                        Last contact {formatDate(contact.lastInteractionAt)}
                      </span>
                    )}
                  </div>
                </button>

                {/* Status badge */}
                {!isDeprioritized && (
                  <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium shrink-0", statusInfo.className)}>
                    {statusInfo.label}
                  </span>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {contact.outreachStatus === "lkd_pending" ? (
                    <>
                      <a
                        href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${contact.firstName} ${contact.lastName}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 text-xs text-sky-600 border border-sky-200 rounded-lg px-2.5 py-1.5 hover:bg-sky-50 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ExternalLink size={11} />
                        Search LinkedIn
                      </a>
                      <button
                        onClick={(e) => { e.stopPropagation(); markInvitationSent(contact.id) }}
                        className="flex items-center gap-1.5 text-xs text-green-600 border border-green-200 rounded-lg px-2.5 py-1.5 hover:bg-green-50 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Check size={11} />
                        Invitation sent
                      </button>
                    </>
                  ) : (
                    <>
                      {contact.emailAddress && (
                        <button
                          onClick={() => setDraftContact(contact)}
                          className="flex items-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Mail size={11} />
                          Draft email
                        </button>
                      )}
                      <select
                        value={contact.outreachStatus ?? "not_contacted"}
                        onChange={(e) => updateStatus(contact.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-600 opacity-0 group-hover:opacity-100"
                      >
                        <option value="not_contacted">Not contacted</option>
                        <option value="drafted">Drafted</option>
                        <option value="sent">Sent</option>
                        <option value="responded">Responded</option>
                        <option value="meeting_booked">Meeting booked</option>
                        <option value="meeting_done">Meeting done</option>
                      </select>
                    </>
                  )}

                  {/* ··· more actions */}
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMoreOpenId(moreOpenId === contact.id ? null : contact.id) }}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <MoreHorizontal size={14} />
                    </button>

                    {moreOpenId === contact.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMoreOpenId(null)} />
                        <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                          <button
                            onClick={(e) => { e.stopPropagation(); snoozeContact(contact.id, 7) }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <AlarmClock size={13} className="text-gray-400" />
                            Remind in 7 days
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); snoozeContact(contact.id, 15) }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Timer size={13} className="text-gray-400" />
                            Remind in 15 days
                          </button>
                          <div className="h-px bg-gray-100 my-1" />
                          <button
                            onClick={(e) => { e.stopPropagation(); deprioritizeContact(contact.id) }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            <Clock size={13} className="text-gray-400" />
                            Ignore for 3 months
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); blockContact(contact.id) }}
                            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Ban size={13} />
                            Ignore forever
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <ChevronRight size={14} className="text-gray-300" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Blocked section */}
      {blockedCount > 0 && activeStatus === "" && (
        <div className="mt-8 flex items-center gap-2 text-xs text-gray-400">
          <Ban size={12} />
          <span>{blockedCount} contact{blockedCount !== 1 ? "s" : ""} blocked forever</span>
        </div>
      )}

      {/* Contact detail panel */}
      <ContactDetail
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
      />

      {/* Draft modal */}
      {draftContact && (
        <OutreachDraftModal
          contact={draftContact}
          onClose={() => setDraftContact(null)}
          onSaved={() => {
            fetchContacts()
            setDraftContact(null)
          }}
        />
      )}
      </>)}
    </div>
  )
}
