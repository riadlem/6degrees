"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, Share2, Trash2, UserMinus, Building2, MapPin, Users, StickyNote, Zap,
  ArrowUpDown, ArrowUp, ArrowDown
} from "lucide-react"
import { cn, initials, formatDate, photoSrc } from "@/lib/utils"
import ShareModal from "@/components/ShareModal"
import ContactDetail from "@/components/ContactDetail"
import { usePrivacy } from "@/contexts/PrivacyContext"
import { linkedinLevel, type ContactSummary } from "@/components/ContactCard"

type Contact = {
  id: string
  firstName: string
  lastName: string
  position: string | null
  company: string | null
  location: string | null
  industry: string | null
  photoUrl: string | null
  profileUrl: string | null
  outreachStatus: string | null
  commonConnections: number | null
  connectedOn: string | null
  notes: { id: string }[]
  labels: { label: { id: string; name: string; color: string } }[]
}

type Member = { id: string; addedAt: string; contact: Contact }

type ListData = {
  id: string
  name: string
  description: string | null
  filterCompany: string | null
  shareEnabled: boolean
  shareToken: string | null
  members: Member[]
  _count: { members: number }
}

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
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<"name" | "company" | "location" | "connections" | "added">("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  function cycleSort(col: "name" | "company" | "location" | "connections" | "added") {
    if (sortCol === col) {
      setSortDir((d) => d === "asc" ? "desc" : "asc")
    } else {
      setSortCol(col)
      setSortDir("asc")
    }
  }

  function copyContactId(contactId: string) {
    navigator.clipboard.writeText(contactId).catch(() => {})
    setCopiedId(contactId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  const searchParams = useSearchParams()

  // Restore open contact from URL on mount
  useEffect(() => {
    const contactId = searchParams.get("contact")
    if (contactId) setActiveContactId(contactId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back/forward button
  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search)
      setActiveContactId(params.get("contact"))
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  function openContact(id: string) {
    setActiveContactId(id)
    const url = new URL(window.location.href)
    url.searchParams.set("contact", id)
    window.history.pushState({ contactId: id }, "", url.toString())
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
    setNameValue(data.name)
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    if (status === "authenticated") fetchList()
  }, [status, fetchList])

  async function saveName() {
    if (!nameValue.trim() || !list) return
    await fetch(`/api/lists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    })
    setList((prev) => prev ? { ...prev, name: nameValue.trim() } : prev)
    setEditingName(false)
  }

  async function removeContact(contactId: string) {
    setRemovingId(contactId)
    await fetch(`/api/lists/${id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    })
    setList((prev) =>
      prev ? { ...prev, members: prev.members.filter((m) => m.contact.id !== contactId), _count: { members: prev._count.members - 1 } } : prev
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
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!list) return null

  const LI_ICON_PATH = "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"

  const sortedMembers = [...(list?.members ?? [])].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1
    switch (sortCol) {
      case "name":
        return dir * (`${a.contact.firstName} ${a.contact.lastName}`).localeCompare(`${b.contact.firstName} ${b.contact.lastName}`)
      case "company":
        return dir * (a.contact.company ?? "").localeCompare(b.contact.company ?? "")
      case "location":
        return dir * (a.contact.location ?? "").localeCompare(b.contact.location ?? "")
      case "connections":
        return dir * ((a.contact.commonConnections ?? 0) - (b.contact.commonConnections ?? 0))
      case "added":
        return dir * (a.addedAt).localeCompare(b.addedAt)
      default:
        return 0
    }
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Back */}
      <Link
        href="/lists"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
      >
        <ArrowLeft size={14} />
        All lists
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false) }}
                className="text-2xl font-bold text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent w-full"
              />
              <button onClick={saveName} className="text-sm text-blue-600 font-medium shrink-0">Save</button>
              <button onClick={() => setEditingName(false)} className="text-sm text-gray-400 shrink-0">Cancel</button>
            </div>
          ) : (
            <h1
              className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              {list.name}
            </h1>
          )}
          {list.filterCompany && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
                <Zap size={9} />
                Dynamic · {list.filterCompany}
              </span>
            </div>
          )}
          {list.description && (
            <p className="text-sm text-gray-500 mt-1">{list.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {list._count.members} contact{list._count.members !== 1 ? "s" : ""}
            {" · "}{session?.user?.name}&apos;s network
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

      {/* Contact table */}
      {list.members.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
          <Users size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No contacts in this list</p>
          <p className="text-sm text-gray-400 mt-1">
            {list.filterCompany
              ? <>No contacts found at <strong>{list.filterCompany}</strong>. Import or sync contacts to populate this list.</>
              : <>Go to{" "}<Link href="/contacts" className="text-blue-500 hover:underline">Contacts</Link>{" "}and add some here.</>
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[auto_auto_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50/70 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <div className="w-10" />
            <div className="w-5" /> {/* LinkedIn level */}
            {(["name", "company", "location"] as const).map((col) => (
              <button
                key={col}
                onClick={() => cycleSort(col)}
                className="flex items-center gap-1 hover:text-gray-600 transition-colors text-left"
              >
                {col === "name" ? "Name" : col === "company" ? "Company" : "Location"}
                {sortCol === col ? (
                  sortDir === "asc" ? <ArrowUp size={11} className="text-blue-500" /> : <ArrowDown size={11} className="text-blue-500" />
                ) : (
                  <ArrowUpDown size={10} className="opacity-30" />
                )}
              </button>
            ))}
            <div className="w-20" />
          </div>

          {sortedMembers.map(({ id: memberId, contact }) => {
            const fullName = `${contact.firstName} ${contact.lastName}`
            const inits = initials(contact.firstName, contact.lastName)
            const liLevel = linkedinLevel(contact as unknown as ContactSummary)
            const liColor = liLevel === "connected" ? "#0A66C2" : liLevel === "pending" ? "#7C3AED" : liLevel === "followed" ? "#D97706" : null
            const liTitle = liLevel === "connected" ? "1st-degree LinkedIn connection" : liLevel === "pending" ? "Pending LinkedIn connection request" : "Followed on LinkedIn (not connected)"
            return (
              <div
                key={memberId}
                className="grid grid-cols-[auto_auto_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors items-center group cursor-pointer"
                onClick={() => openContact(contact.id)}
              >
                {/* Avatar */}
                <div className="w-10">
                  {contact.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoSrc(contact.photoUrl)!} alt={fullName} className={cn("w-9 h-9 rounded-full object-cover border border-gray-100", blurred && "blur")} />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold">
                      {inits}
                    </div>
                  )}
                </div>

                {/* LinkedIn connection level */}
                <div className="w-5 flex items-center justify-center">
                  {liColor && contact.profileUrl ? (
                    <a
                      href={contact.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={liTitle}
                    >
                      <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: liColor }} className="block shrink-0">
                        <path d={LI_ICON_PATH} />
                      </svg>
                    </a>
                  ) : liColor ? (
                    <span title={liTitle}>
                      <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: liColor }} className="block shrink-0">
                        <path d={LI_ICON_PATH} />
                      </svg>
                    </span>
                  ) : null}
                </div>

                {/* Name + title + ID */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className={cn("text-sm font-medium text-gray-900 truncate", blurred && "blur-sm select-none")}>{fullName}</p>
                  </div>
                  {contact.position && (
                    <p className="text-xs text-gray-500 truncate">{contact.position}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {contact.commonConnections != null && contact.commonConnections > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-blue-500">
                        <Users size={10} />{contact.commonConnections}
                      </span>
                    )}
                    {contact.notes.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-500">
                        <StickyNote size={10} />{contact.notes.length}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); copyContactId(contact.id) }}
                      title={`Copy contact ID: ${contact.id}`}
                      className="inline-flex items-center gap-0.5 text-[10px] font-mono text-gray-300 hover:text-gray-500 transition-colors"
                    >
                      {copiedId === contact.id
                        ? <span className="text-green-500">✓ copied</span>
                        : <span>{contact.id.slice(0, 8)}…</span>
                      }
                    </button>
                  </div>
                </div>

                {/* Company */}
                <div className="min-w-0">
                  {contact.company ? (
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Building2 size={12} className="text-gray-400 shrink-0" />
                      <span className="truncate">{contact.company}</span>
                    </div>
                  ) : <span className="text-gray-300 text-sm">—</span>}
                  {contact.industry && (
                    <span className="text-xs text-gray-400 truncate block mt-0.5">{contact.industry}</span>
                  )}
                </div>

                {/* Location */}
                <div className="min-w-0">
                  {contact.location ? (
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <MapPin size={12} className="text-gray-400 shrink-0" />
                      <span className="truncate">{contact.location}</span>
                    </div>
                  ) : <span className="text-gray-300 text-sm">—</span>}
                  <span className="text-xs text-gray-400">{formatDate(contact.connectedOn)}</span>
                </div>

                {/* Remove — hidden for dynamic company lists */}
                <div className="w-20 flex justify-end">
                  {!list.filterCompany && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeContact(contact.id) }}
                      disabled={removingId === contact.id}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50"
                    >
                      <UserMinus size={12} />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Contact detail panel */}
      <ContactDetail
        contactId={activeContactId}
        onClose={closeContact}
      />

      {/* Share modal */}
      {shareOpen && (
        <ShareModal
          listId={list.id}
          listName={list.name}
          shareEnabled={list.shareEnabled}
          shareToken={list.shareToken}
          onClose={() => setShareOpen(false)}
          onToggle={(enabled, _url) =>
            setList((prev) => prev ? { ...prev, shareEnabled: enabled } : prev)
          }
        />
      )}
    </div>
  )
}

export default function ListDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <ListDetailContent />
    </Suspense>
  )
}
