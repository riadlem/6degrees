"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCcw, Clock, Sparkles, MoreHorizontal, Ban, ClipboardList, Trash2, Chrome, AlignJustify, LayoutGrid, History, RotateCcw, ChevronDown, ExternalLink } from "lucide-react"
import { cn, initials, formatDate, photoSrc } from "@/lib/utils"
import dynamic from "next/dynamic"
// Lazy-load the contact drawer — it is large and only mounts on open.
const ContactDetail = dynamic(() => import("@/components/ContactDetail"), { ssr: false })
import OutreachDraftModal from "@/components/OutreachDraftModal"
import EnrichContent from "@/components/EnrichContent"
import { usePrivacy } from "@/contexts/PrivacyContext"
import ReconnectCard, { STATUS_LABELS } from "@/components/ReconnectCard"

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
  driftScore: number | null
  outreachStatus: string | null
  outreachUpdatedAt: string | null
  labels: { label: { id: string; name: string; color: string } }[]
}

const STATUS_TABS = [
  { value: "",               label: "All" },
  { value: "lapsed",         label: "Lapsed" },
  { value: "lkd_pending",    label: "Invite to LinkedIn" },
  { value: "not_contacted",  label: "Not contacted" },
  { value: "drafted",        label: "Drafted" },
  { value: "sent",           label: "Sent" },
  { value: "meeting_booked", label: "Meeting booked" },
  { value: "responded",      label: "Responded" },
  { value: "meeting_done",   label: "Meeting done" },
]


function ReconnectContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { blurred } = usePrivacy()
  const userId = session?.user?.id

  const [activeTab, setActiveTab] = useState<"reconnect" | "review" | "enrich" | "saved">("reconnect")
  const [blockedCount, setBlockedCount] = useState(0)
  const [activeStatus, setActiveStatus] = useState("")
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [draftContact, setDraftContact] = useState<ReconnectContact | null>(null)
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null)
  const [reachOutView, setReachOutView] = useState<"list" | "photos">("list")
  const [reviewView, setReviewView] = useState<"list" | "photos">("list")
  const [showIgnored, setShowIgnored] = useState(false)

  // Saved (extension history) tab state
  type ExtContact = { id: string; firstName: string; lastName: string; company: string | null; position: string | null; city: string | null; country: string | null; location: string | null; photoUrl: string | null; profileUrl: string | null; extensionSyncedAt: string }
  const [savedContacts, setSavedContacts] = useState<ExtContact[]>([])
  const [savedTotal, setSavedTotal] = useState(0)
  const [savedPage, setSavedPage] = useState(0)
  const [savedLoading, setSavedLoading] = useState(false)
  const [savedInitialLoad, setSavedInitialLoad] = useState(true)

  const loadSaved = useCallback(async (p: number, replace = false) => {
    setSavedLoading(true)
    try {
      const res = await fetch(`/api/extension/history?page=${p}`)
      if (!res.ok) return
      const data = await res.json()
      setSavedContacts(prev => replace ? data.contacts : [...prev, ...data.contacts])
      setSavedTotal(data.total)
      setSavedPage(p)
    } finally {
      setSavedLoading(false)
      setSavedInitialLoad(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "saved" && savedInitialLoad) loadSaved(0, true)
  }, [activeTab, savedInitialLoad, loadSaved])

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const searchParams = useSearchParams()

  // Restore open contact from URL on mount
  useEffect(() => {
    const contactId = searchParams.get("contact")
    if (contactId) setSelectedContactId(contactId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back/forward button
  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search)
      setSelectedContactId(params.get("contact"))
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  function openContact(id: string) {
    setSelectedContactId(id)
    const url = new URL(window.location.href)
    url.searchParams.set("contact", id)
    window.history.pushState({ contactId: id }, "", url.toString())
  }

  function closeContact() {
    setSelectedContactId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("contact")
    window.history.replaceState({}, "", url.toString())
  }

  type ReconnectData = { contacts: ReconnectContact[]; total: number; blockedCount: number }

  const { data: reconnectData, isLoading: loading } = useQuery<ReconnectData>({
    queryKey: ["reconnect", userId, activeStatus],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (activeStatus) params.set("status", activeStatus)
      const res = await fetch(`/api/reconnect?${params}`)
      return res.json()
    },
    enabled: status === "authenticated",
    staleTime: 30_000,
  })

  const contacts = reconnectData?.contacts ?? []
  const total = reconnectData?.total ?? 0

  useEffect(() => {
    if (reconnectData?.blockedCount !== undefined) setBlockedCount(reconnectData.blockedCount)
  }, [reconnectData?.blockedCount])

  const { data: reviewData, isLoading: reviewLoading } = useQuery<ReconnectData>({
    queryKey: ["reconnect", userId, "pending_review"],
    queryFn: () => fetch("/api/reconnect?status=pending_review").then((r) => r.json()),
    enabled: status === "authenticated",
    staleTime: 60_000,
  })

  const reviewContacts = reviewData?.contacts ?? []

  const { data: ignoredData, isLoading: ignoredLoading } = useQuery<ReconnectData>({
    queryKey: ["reconnect", userId, "ignored_list"],
    queryFn: () => fetch("/api/reconnect?status=ignored_list").then((r) => r.json()),
    enabled: status === "authenticated" && showIgnored,
    staleTime: 60_000,
  })

  const ignoredContacts = ignoredData?.contacts ?? []

  function invalidateReconnect() {
    queryClient.invalidateQueries({ queryKey: ["reconnect", userId] })
  }

  function patchContacts(updater: (prev: ReconnectContact[]) => ReconnectContact[]) {
    queryClient.setQueryData<ReconnectData>(["reconnect", userId, activeStatus], (prev) =>
      prev ? { ...prev, contacts: updater(prev.contacts), total: Math.max(0, prev.total - (prev.contacts.length - updater(prev.contacts).length)) } : prev
    )
  }

  function removeFromMain(contactId: string) {
    queryClient.setQueryData<ReconnectData>(["reconnect", userId, activeStatus], (prev) =>
      prev ? { ...prev, contacts: prev.contacts.filter((c) => c.id !== contactId), total: Math.max(0, prev.total - 1) } : prev
    )
  }

  function patchInMain(contactId: string, patch: Partial<ReconnectContact>) {
    queryClient.setQueryData<ReconnectData>(["reconnect", userId, activeStatus], (prev) =>
      prev ? { ...prev, contacts: prev.contacts.map((c) => c.id === contactId ? { ...c, ...patch } : c) } : prev
    )
  }

  function removeFromReview(contactId: string) {
    queryClient.setQueryData<ReconnectData>(["reconnect", userId, "pending_review"], (prev) =>
      prev ? { ...prev, contacts: prev.contacts.filter((c) => c.id !== contactId) } : prev
    )
  }

  function removeFromIgnored(contactId: string) {
    queryClient.setQueryData<ReconnectData>(["reconnect", userId, "ignored_list"], (prev) =>
      prev ? { ...prev, contacts: prev.contacts.filter((c) => c.id !== contactId) } : prev
    )
  }

  async function updateStatus(contactId: string, newStatus: string) {
    await fetch(`/api/reconnect/${contactId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    patchInMain(contactId, { outreachStatus: newStatus })
  }

  async function markInvitationSent(contactId: string) {
    await fetch(`/api/reconnect/${contactId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: null }),
    })
    removeFromMain(contactId)
  }

  async function snoozeContact(contactId: string, days: number) {
    await fetch(`/api/reconnect/${contactId}/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    })
    removeFromMain(contactId)
    setMoreOpenId(null)
  }

  async function deprioritizeContact(contactId: string) {
    await updateStatus(contactId, "deprioritized")
    // Refetch so deprioritized sorting is applied server-side
    invalidateReconnect()
    setMoreOpenId(null)
  }

  async function blockContact(contactId: string) {
    await updateStatus(contactId, "ignored")
    removeFromMain(contactId)
    setBlockedCount((n) => n + 1)
    setMoreOpenId(null)
    // If ignored panel is open, prepend the contact optimistically
    if (showIgnored) {
      const contact = contacts.find(c => c.id === contactId)
      if (contact) {
        queryClient.setQueryData<ReconnectData>(["reconnect", userId, "ignored_list"], (prev) =>
          prev
            ? { ...prev, contacts: [{ ...contact, outreachStatus: "ignored" }, ...prev.contacts] }
            : { contacts: [{ ...contact, outreachStatus: "ignored" }], total: 1, blockedCount: 0 }
        )
      }
    }
  }

  async function restoreContact(contactId: string) {
    await fetch(`/api/reconnect/${contactId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: null }),
    })
    removeFromIgnored(contactId)
    setBlockedCount((n) => Math.max(0, n - 1))
  }

  function toggleIgnored() {
    setShowIgnored((v) => !v)
  }

  // Review tab actions
  async function keepContact(contactId: string) {
    await fetch(`/api/reconnect/${contactId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: null }),
    })
    removeFromReview(contactId)
  }

  async function reachOutContact(contactId: string) {
    await fetch(`/api/reconnect/${contactId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "not_contacted" }),
    })
    removeFromReview(contactId)
  }

  async function discardContact(contactId: string) {
    await fetch(`/api/contacts/${contactId}`, { method: "DELETE" })
    removeFromReview(contactId)
  }

  async function discardAllReview() {
    await Promise.all(reviewContacts.map((c) => fetch(`/api/contacts/${c.id}`, { method: "DELETE" })))
    queryClient.setQueryData<ReconnectData>(["reconnect", userId, "pending_review"], (prev) =>
      prev ? { ...prev, contacts: [] } : prev
    )
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
          onClick={() => setActiveTab("review")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "review" ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700",
          )}
        >
          <ClipboardList size={13} />
          Review
          {reviewContacts.length > 0 && (
            <span className="ml-0.5 bg-violet-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
              {reviewContacts.length}
            </span>
          )}
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
        <button
          onClick={() => setActiveTab("saved")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "saved" ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700",
          )}
        >
          <Chrome size={13} />
          Saved
        </button>
        <div className="flex-1" />
      </div>

      {/* Enrich tab */}
      {activeTab === "enrich" && <EnrichContent />}

      {/* Saved tab */}
      {activeTab === "saved" && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            {savedTotal > 0 ? `${savedTotal.toLocaleString()} profile${savedTotal !== 1 ? "s" : ""} saved via the Chrome extension` : "Profiles saved via the Chrome extension"}
          </p>
          {savedInitialLoad && savedLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : savedContacts.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">
              No profiles saved yet. Install the Chrome extension and visit LinkedIn profiles to get started.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="hidden sm:grid grid-cols-[40px_2fr_2fr_2fr_1.5fr] gap-x-4 px-4 py-2 border-b border-gray-100 bg-gray-50">
                <div />
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Name</div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Company</div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Role</div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide text-right">Saved</div>
              </div>
              <div className="divide-y divide-gray-50">
                {savedContacts.map((c) => {
                  const ini = ((c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")).toUpperCase() || "?"
                  const loc = [c.city, c.country].filter(Boolean).join(", ") || c.location || ""
                  const savedAt = new Date(c.extensionSyncedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                  return (
                    <div
                      key={c.id}
                      className="flex sm:grid sm:grid-cols-[40px_2fr_2fr_2fr_1.5fr] gap-x-4 items-center px-4 py-3 hover:bg-gray-50 cursor-pointer group"
                      onClick={() => router.push(`/contacts?contact=${c.id}`)}
                    >
                      {c.photoUrl
                        ? <img src={c.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} loading="lazy" decoding="async" />
                        : <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-semibold shrink-0">{ini}</div>
                      }
                      <div className="flex items-center gap-1.5 min-w-0 ml-3 sm:ml-0">
                        <span className="text-sm font-medium text-gray-900 truncate">{c.firstName} {c.lastName}</span>
                        {c.profileUrl && (
                          <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-blue-500 shrink-0">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                      <div className="hidden sm:block text-sm text-gray-700 truncate">{c.company ?? <span className="text-gray-300">—</span>}</div>
                      <div className="hidden sm:block text-sm text-gray-600 truncate">{c.position ?? <span className="text-gray-300">—</span>}</div>
                      <div className="hidden sm:block text-xs text-gray-400 text-right whitespace-nowrap">{savedAt}</div>
                      <div className="sm:hidden ml-auto text-xs text-gray-400 whitespace-nowrap shrink-0">{savedAt}</div>
                    </div>
                  )
                })}
              </div>
              {savedContacts.length < savedTotal && (
                <div className="px-4 py-3 border-t border-gray-100 text-center">
                  <button onClick={() => loadSaved(savedPage + 1)} disabled={savedLoading} className="text-sm text-violet-600 hover:text-violet-700 font-medium disabled:opacity-40">
                    {savedLoading ? "Loading…" : `Load more (${savedTotal - savedContacts.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Review tab */}
      {activeTab === "review" && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-3">
            <p className="text-sm text-gray-500 flex-1">
              Profiles captured automatically — keep, prioritize for outreach, or discard.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setReviewView("list")}
                  title="List view"
                  className={cn("px-2.5 py-1.5 transition-colors", reviewView === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
                >
                  <AlignJustify size={13} />
                </button>
                <button
                  onClick={() => setReviewView("photos")}
                  title="Photo grid"
                  className={cn("px-2.5 py-1.5 transition-colors border-l border-gray-200", reviewView === "photos" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
                >
                  <LayoutGrid size={13} />
                </button>
              </div>
              {reviewContacts.length > 0 && (
                <button
                  onClick={discardAllReview}
                  className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={12} />
                  Discard all
                </button>
              )}
            </div>
          </div>

          {reviewLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : reviewContacts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-500">No profiles to review</p>
              <p className="text-sm mt-1">
                Enable &ldquo;Auto-queue visited profiles&rdquo; in the extension popup to start capturing.
              </p>
            </div>
          ) : reviewView === "photos" ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {reviewContacts.map((contact) => {
                const fullName = `${contact.firstName} ${contact.lastName}`
                const inits = initials(contact.firstName, contact.lastName)
                return (
                  <div key={contact.id} className="group relative flex flex-col rounded-xl overflow-hidden bg-white border border-gray-100 hover:border-violet-300 hover:shadow-md transition-all">
                    <button onClick={() => openContact(contact.id)} className="aspect-square w-full relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
                      {contact.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoSrc(contact.photoUrl)!} alt={fullName} className={cn("w-full h-full object-cover group-hover:scale-105 transition-transform duration-300", blurred && "blur")} loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-xl">{inits}</div>
                      )}
                    </button>
                    <button onClick={() => openContact(contact.id)} className="px-2 py-1.5 text-left">
                      <p className={cn("text-xs font-semibold text-gray-900 truncate leading-tight", blurred && "blur-sm select-none")}>{fullName}</p>
                      {contact.position && <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{contact.position}</p>}
                    </button>
                    <div className="flex gap-1 px-1.5 pb-1.5">
                      <button onClick={() => keepContact(contact.id)} className="flex-1 text-[10px] text-gray-600 border border-gray-200 rounded-md py-0.5 hover:bg-gray-50 transition-colors">Keep</button>
                      <button onClick={() => reachOutContact(contact.id)} className="flex-1 text-[10px] text-blue-600 border border-blue-200 rounded-md py-0.5 hover:bg-blue-50 transition-colors">Reach</button>
                      <button onClick={() => discardContact(contact.id)} className="flex-1 text-[10px] text-red-500 border border-red-200 rounded-md py-0.5 hover:bg-red-50 transition-colors">Discard</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {reviewContacts.map((contact) => {
                const inits = initials(contact.firstName, contact.lastName)
                const subLine = [contact.position, contact.company].filter(Boolean).join(" at ")
                return (
                  <div
                    key={contact.id}
                    className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-gray-300 transition-colors"
                  >
                    {/* Avatar */}
                    <button onClick={() => openContact(contact.id)} className="shrink-0">
                      {contact.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoSrc(contact.photoUrl)!} alt="" className={cn("w-10 h-10 rounded-xl object-cover", blurred && "blur")} loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-sm font-bold">
                          {inits}
                        </div>
                      )}
                    </button>

                    {/* Info */}
                    <button className="flex-1 min-w-0 text-left" onClick={() => openContact(contact.id)}>
                      <p className={cn("font-medium text-gray-900 truncate", blurred && "blur-sm select-none")}>
                        {contact.firstName} {contact.lastName}
                      </p>
                      {subLine && <p className="text-xs text-gray-500 truncate">{subLine}</p>}
                      {contact.outreachUpdatedAt && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Clock size={10} />
                          Visited {formatDate(contact.outreachUpdatedAt)}
                        </p>
                      )}
                    </button>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => keepContact(contact.id)}
                        className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
                      >
                        Keep
                      </button>
                      <button
                        onClick={() => reachOutContact(contact.id)}
                        className="text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition-colors"
                      >
                        Reach out
                      </button>
                      <button
                        onClick={() => discardContact(contact.id)}
                        className="text-xs text-red-500 border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50 transition-colors"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Contact detail panel */}
          <ContactDetail contactId={selectedContactId} onClose={closeContact} />
        </div>
      )}

      {/* Reconnect tab */}
      {activeTab === "reconnect" && (<>

      {/* Status sub-tabs (scrollable on mobile) */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto scrollbar-none">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveStatus(tab.value)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0",
              activeStatus === tab.value
                ? tab.value === "lapsed" ? "border-amber-500 text-amber-700" : "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            {tab.value === "lapsed" && <History size={12} />}
            {tab.label}
          </button>
        ))}
        <div className="flex-1 shrink-0" />
        <div className="flex items-center gap-2 shrink-0 pb-1">
          <span className="text-xs text-gray-400">{total} contacts</span>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setReachOutView("list")}
              title="List view"
              className={cn("px-2 py-1 transition-colors", reachOutView === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
            >
              <AlignJustify size={12} />
            </button>
            <button
              onClick={() => setReachOutView("photos")}
              title="Photo grid"
              className={cn("px-2 py-1 transition-colors border-l border-gray-200", reachOutView === "photos" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}
            >
              <LayoutGrid size={12} />
            </button>
          </div>
        </div>
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
            {activeStatus === "lapsed"
              ? "No lapsed relationships found. Contacts with strong past interaction and 60+ days of silence will appear here."
              : activeStatus
                ? "Try a different filter."
                : <>Sync your Gmail in <a href="/settings" className="text-blue-600 hover:underline">Settings</a> to surface contacts worth reaching out to.</>}
          </p>
        </div>
      ) : reachOutView === "photos" ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {contacts.map((contact) => {
            const fullName = `${contact.firstName} ${contact.lastName}`
            const inits = initials(contact.firstName, contact.lastName)
            const statusInfo = STATUS_LABELS[contact.outreachStatus ?? "not_contacted"] ?? STATUS_LABELS.not_contacted
            return (
              <button
                key={contact.id}
                onClick={() => openContact(contact.id)}
                className="group flex flex-col rounded-xl overflow-hidden bg-white border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all text-left"
              >
                <div className="aspect-square w-full relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
                  {contact.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoSrc(contact.photoUrl)!} alt={fullName} className={cn("w-full h-full object-cover group-hover:scale-105 transition-transform duration-300", blurred && "blur")} loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-xl">{inits}</div>
                  )}
                  <span className={cn("absolute bottom-1 left-1 right-1 text-center text-[9px] font-medium px-1 py-0.5 rounded-full truncate", statusInfo.className)}>
                    {statusInfo.label}
                  </span>
                </div>
                <div className="px-2 py-1.5">
                  <p className={cn("text-xs font-semibold text-gray-900 truncate leading-tight", blurred && "blur-sm select-none")}>{fullName}</p>
                  {contact.company && <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{contact.company}</p>}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {(() => {
            const isLapsed = activeStatus === "lapsed"
            const maxScore = Math.max(...contacts.map(c => isLapsed ? (c.driftScore ?? 0) : (c.interactionScore ?? 0)), 1)
            return contacts.map((contact) => {
              const score = isLapsed ? (contact.driftScore ?? 0) : (contact.interactionScore ?? 0)
              const scoreWidth = Math.min(100, (score / maxScore) * 100)
              return (
                <ReconnectCard
                  key={contact.id}
                  contact={contact}
                  isLapsed={isLapsed}
                  scoreWidth={scoreWidth}
                  blurred={blurred}
                  moreOpen={moreOpenId === contact.id}
                  onOpen={() => openContact(contact.id)}
                  onMoreToggle={() => setMoreOpenId(moreOpenId === contact.id ? null : contact.id)}
                  onCloseMore={() => setMoreOpenId(null)}
                  onSnooze={(days) => snoozeContact(contact.id, days)}
                  onDeprioritize={() => deprioritizeContact(contact.id)}
                  onBlock={() => blockContact(contact.id)}
                  onDraft={() => setDraftContact(contact)}
                  onUpdateStatus={(s) => updateStatus(contact.id, s)}
                  onMarkInvitationSent={() => markInvitationSent(contact.id)}
                />
              )
            })
          })()}
        </div>
      )}

      {/* Ignored contacts section */}
      {blockedCount > 0 && activeStatus === "" && (
        <div className="mt-8">
          <button
            onClick={toggleIgnored}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Ban size={12} />
            <span>{blockedCount} contact{blockedCount !== 1 ? "s" : ""} ignored forever</span>
            <ChevronDown size={12} className={cn("transition-transform", showIgnored && "rotate-180")} />
          </button>

          {showIgnored && (
            <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
              {ignoredLoading ? (
                <div className="py-4 flex items-center justify-center text-xs text-gray-400">Loading…</div>
              ) : ignoredContacts.length === 0 ? (
                <div className="py-4 text-center text-xs text-gray-400">No ignored contacts</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {ignoredContacts.map((c) => {
                    const inits = initials(c.firstName, c.lastName)
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-gray-50">
                        {c.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoSrc(c.photoUrl)!} alt="" className={cn("w-8 h-8 rounded-lg object-cover shrink-0", blurred && "blur")} loading="lazy" decoding="async" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gray-200 text-gray-500 flex items-center justify-center text-xs font-semibold shrink-0">
                            {inits}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium text-gray-700 truncate", blurred && "blur-sm select-none")}>
                            {c.firstName} {c.lastName}
                          </p>
                          {c.company && <p className="text-xs text-gray-400 truncate">{c.company}</p>}
                        </div>
                        <button
                          onClick={() => restoreContact(c.id)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg px-2.5 py-1 transition-colors shrink-0"
                        >
                          <RotateCcw size={10} />
                          Restore
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Contact detail panel */}
      <ContactDetail
        contactId={selectedContactId}
        onClose={closeContact}
      />

      {/* Draft modal */}
      {draftContact && (
        <OutreachDraftModal
          contact={draftContact}
          onClose={() => setDraftContact(null)}
          onSaved={() => {
            invalidateReconnect()
            setDraftContact(null)
          }}
        />
      )}
      </>)}
    </div>
  )
}

export default function ReconnectPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <ReconnectContent />
    </Suspense>
  )
}
