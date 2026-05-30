"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { STALE } from "@/lib/query-client"
import {
  X, Building2, MapPin, Calendar, Globe, Users, Sparkles,
  StickyNote, Send, Trash2, ExternalLink, Edit2, Check, Tag, Plus, GraduationCap, Briefcase, Mail, Phone, ArrowUpRight, ArrowDownLeft, Link2Off, Bookmark, Link2, Search, Loader2, Camera, Lock, Unlock
} from "lucide-react"
import { cn, initials, formatDate, photoSrc } from "@/lib/utils"
import { labelColors, LABEL_COLOR_KEYS } from "@/lib/label-colors"
import LabelBadge from "./LabelBadge"
import { usePrivacy } from "@/contexts/PrivacyContext"
import { classifyEmail, EMAIL_KIND_BG, EMAIL_KIND_TITLE } from "@/lib/email-classify"
import Link from "next/link"
import CompanyLogo, { companyNameToDomain } from "./CompanyLogo"

// Convert a country name to its flag emoji using regional indicator letters.
function countryFlag(country: string | null): string {
  if (!country) return ""
  const map: Record<string, string> = {
    "france": "🇫🇷", "united kingdom": "🇬🇧", "uk": "🇬🇧",
    "united states": "🇺🇸", "usa": "🇺🇸", "us": "🇺🇸",
    "germany": "🇩🇪", "deutschland": "🇩🇪",
    "spain": "🇪🇸", "espagne": "🇪🇸",
    "italy": "🇮🇹", "italie": "🇮🇹",
    "portugal": "🇵🇹",
    "netherlands": "🇳🇱", "pays-bas": "🇳🇱",
    "belgium": "🇧🇪", "belgique": "🇧🇪",
    "switzerland": "🇨🇭", "suisse": "🇨🇭",
    "sweden": "🇸🇪", "suède": "🇸🇪",
    "norway": "🇳🇴", "norvège": "🇳🇴",
    "denmark": "🇩🇰", "danemark": "🇩🇰",
    "finland": "🇫🇮", "finlande": "🇫🇮",
    "ireland": "🇮🇪", "irlande": "🇮🇪",
    "austria": "🇦🇹", "autriche": "🇦🇹",
    "czech republic": "🇨🇿", "czechia": "🇨🇿",
    "poland": "🇵🇱", "pologne": "🇵🇱",
    "hungary": "🇭🇺", "hongrie": "🇭🇺",
    "romania": "🇷🇴", "roumanie": "🇷🇴",
    "bulgaria": "🇧🇬",
    "croatia": "🇭🇷", "croatie": "🇭🇷",
    "greece": "🇬🇷", "grèce": "🇬🇷",
    "turkey": "🇹🇷", "turquie": "🇹🇷",
    "ukraine": "🇺🇦",
    "russia": "🇷🇺", "russie": "🇷🇺",
    "canada": "🇨🇦",
    "australia": "🇦🇺", "australie": "🇦🇺",
    "new zealand": "🇳🇿",
    "singapore": "🇸🇬",
    "hong kong": "🇭🇰",
    "japan": "🇯🇵", "japon": "🇯🇵",
    "china": "🇨🇳", "chine": "🇨🇳",
    "india": "🇮🇳", "inde": "🇮🇳",
    "south korea": "🇰🇷",
    "taiwan": "🇹🇼",
    "indonesia": "🇮🇩",
    "malaysia": "🇲🇾",
    "thailand": "🇹🇭", "thaïlande": "🇹🇭",
    "vietnam": "🇻🇳",
    "philippines": "🇵🇭",
    "united arab emirates": "🇦🇪", "uae": "🇦🇪",
    "saudi arabia": "🇸🇦", "arabie saoudite": "🇸🇦",
    "qatar": "🇶🇦",
    "israel": "🇮🇱", "israël": "🇮🇱",
    "brazil": "🇧🇷", "brésil": "🇧🇷",
    "mexico": "🇲🇽", "mexique": "🇲🇽",
    "argentina": "🇦🇷",
    "colombia": "🇨🇴",
    "chile": "🇨🇱",
    "south africa": "🇿🇦", "afrique du sud": "🇿🇦",
    "nigeria": "🇳🇬",
    "kenya": "🇰🇪",
    "egypt": "🇪🇬", "égypte": "🇪🇬",
    "morocco": "🇲🇦", "maroc": "🇲🇦",
    "luxembourg": "🇱🇺",
    "malta": "🇲🇹", "malte": "🇲🇹",
    "iceland": "🇮🇸", "islande": "🇮🇸",
    "serbia": "🇷🇸", "serbie": "🇷🇸",
    "slovakia": "🇸🇰",
    "slovenia": "🇸🇮",
    "estonia": "🇪🇪",
    "latvia": "🇱🇻",
    "lithuania": "🇱🇹",
  }
  return map[country.toLowerCase()] ?? ""
}

type Note = { id: string; content: string; createdAt: string }
type ListMembership = { listId: string; list: { id: string; name: string } }
type ContactLabelEntry = { label: { id: string; name: string; color: string } }
type LabelOption = { id: string; name: string; color: string }

type ExperienceEntry = { title?: string; company?: string; location?: string; start?: string; end?: string }
type EducationEntry = { school?: string; degree?: string; field?: string; start?: string; end?: string }
type SharedConnection = { name: string; profileUrl?: string }

type EmailEntry = {
  id: string
  subject: string | null
  fromEmail: string
  sentAt: string
  isOutbound: boolean
  threadId: string
}

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
  headline: string | null
  profileUrl: string | null
  linkedinDegree: string | null
  photoUrl: string | null
  commonConnections: number | null
  connectedOn: string | null
  coworkEnrichedAt: string | null
  extensionSyncedAt: string | null
  experience: ExperienceEntry[] | null
  education: EducationEntry[] | null
  sharedConnections: SharedConnection[] | null
  lastInteractionAt: string | null
  outreachStatus: string | null
  emailAddress: string | null
  emailAddresses: { email: string; isPrimary: boolean }[]
  phoneNumber: string | null
  phones: string[]
  lockedFields: string[]
  whatsappLastAt: string | null
  whatsappMessageCount: number
  whatsappChatName: string | null
  linkedinDmLastAt: string | null
  linkedinDmMessageCount: number
  linkedinDmConversationId: string | null
  linkedinDmChatName: string | null
  notes: Note[]
  listMembers: ListMembership[]
  labels: ContactLabelEntry[]
}

interface Props {
  contactId: string | null
  onClose: () => void
  onDeleted?: (id: string) => void
}

export default function ContactDetail({ contactId, onClose, onDeleted }: Props) {
  const { blurred } = usePrivacy()
  const { data: session } = useSession()
  const userId = session?.user?.id
  const queryClient = useQueryClient()

  // Fetch contact data — cached by React Query for instant re-opens
  const { data: contact, isLoading: loading } = useQuery<Contact>({
    queryKey: ["contact", userId, contactId],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${contactId}`)
      if (!res.ok) throw new Error("Failed to fetch contact")
      return res.json()
    },
    enabled: !!contactId && !!userId,
    staleTime: STALE.contacts,
  })

  // Fetch all labels — shared cache across ContactDetail instances
  const { data: allLabels = [] } = useQuery<LabelOption[]>({
    queryKey: ["labels", userId],
    queryFn: () => fetch("/api/labels").then((r) => r.json()),
    enabled: !!contactId && !!userId,
    staleTime: STALE.labels,
  })

  /** Invalidate the contact cache so the UI refreshes with latest server data. */
  function refetchContact() {
    queryClient.invalidateQueries({ queryKey: ["contact", userId, contactId] })
  }

  const [noteText, setNoteText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editingName, setEditingName] = useState(false)
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [addingLabel, setAddingLabel]     = useState(false)
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [newLabelName, setNewLabelName]   = useState("")
  const [newLabelColor, setNewLabelColor] = useState("blue")
  const [emails, setEmails] = useState<EmailEntry[]>([])
  const [emailsExpanded, setEmailsExpanded] = useState(false)
  const [emailNextCursor, setEmailNextCursor] = useState<string | null>(null)
  const [linkingEmail, setLinkingEmail] = useState(false)
  const [linkEmailLoading, setLinkEmailLoading] = useState(false)
  const [emailSearchQ, setEmailSearchQ] = useState("")
  const [emailSearchResults, setEmailSearchResults] = useState<{ fromEmail: string; fromName: string | null; messageCount: number; alreadyLinked?: boolean; linkedContactId?: string | null; linkedContactName?: string | null }[]>([])
  const [emailSearchLoading, setEmailSearchLoading] = useState(false)
  const [photoUrlInput, setPhotoUrlInput] = useState("")
  const [photoUrlOpen, setPhotoUrlOpen] = useState(false)
  const [photoUrlLoading, setPhotoUrlLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingPhone, setEditingPhone] = useState<string | null>(null) // which phone is being edited ("primary" | index as string)
  const [editPhoneValue, setEditPhoneValue] = useState("")
  const [addingPhone, setAddingPhone] = useState(false)
  const [newPhoneValue, setNewPhoneValue] = useState("")

  async function deleteContact() {
    if (!contactId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" })
      if (res.ok) {
        queryClient.removeQueries({ queryKey: ["contact", userId, contactId] })
        queryClient.invalidateQueries({ queryKey: ["contacts", userId] })
        onDeleted?.(contactId)
        onClose()
      }
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  // Reset per-contact UI state and load emails when contactId changes
  useEffect(() => {
    if (contactId) {
      setEmails([])
      setEmailsExpanded(false)
      setEmailNextCursor(null)
      setLinkingEmail(false)
      setEmailSearchQ("")
      setEmailSearchResults([])
      fetch(`/api/contacts/${contactId}/emails?limit=20`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (d) {
            setEmails(d.messages ?? [])
            setEmailNextCursor(d.nextCursor)
          }
        })
    }
  }, [contactId])

  useEffect(() => {
    if (!linkingEmail || !emailSearchQ.trim()) {
      setEmailSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setEmailSearchLoading(true)
      try {
        const res = await fetch(`/api/gmail/senders?q=${encodeURIComponent(emailSearchQ)}`)
        if (res.ok) {
          const d = await res.json()
          setEmailSearchResults(d.senders?.slice(0, 6) ?? [])
        }
      } finally {
        setEmailSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [emailSearchQ, linkingEmail])

  async function loadMoreEmails() {
    if (!contactId || !emailNextCursor) return
    const res = await fetch(`/api/contacts/${contactId}/emails?limit=20&cursor=${emailNextCursor}`)
    if (!res.ok) return
    const d = await res.json()
    setEmails((prev) => [...prev, ...(d.messages ?? [])])
    setEmailNextCursor(d.nextCursor)
    setEmailsExpanded(true)
  }

  async function addLabel(labelId: string) {
    if (!contact) return
    await fetch(`/api/labels/${labelId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: [contact.id] }),
    })
    setAddingLabel(false)
    refetchContact()
  }

  async function removeLabel(labelId: string) {
    if (!contact) return
    await fetch(`/api/labels/${labelId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: [contact.id] }),
    })
    refetchContact()
  }

  async function createAndAddLabel() {
    if (!newLabelName.trim() || !contact) return
    const res = await fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor }),
    })
    if (!res.ok) return
    const label = await res.json() as LabelOption
    // Immediately apply the new label to this contact
    await fetch(`/api/labels/${label.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: [contact.id] }),
    })
    // Invalidate labels cache so ManageLabelsModal + other contacts see the new label
    queryClient.invalidateQueries({ queryKey: ["labels", userId] })
    setNewLabelName("")
    setNewLabelColor("blue")
    setCreatingLabel(false)
    setAddingLabel(false)
    refetchContact()
  }

  async function addNote() {
    if (!noteText.trim() || !contact) return
    setSubmitting(true)
    await fetch(`/api/contacts/${contact.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteText }),
    })
    setNoteText("")
    setSubmitting(false)
    refetchContact()
  }

  async function deleteNote(noteId: string) {
    if (!contact) return
    await fetch(`/api/contacts/${contact.id}/notes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId }),
    })
    refetchContact()
  }

  async function enrich() {
    if (!contact) return
    setEnriching(true)
    await fetch(`/api/contacts/${contact.id}`, { method: "POST" })
    setEnriching(false)
    refetchContact()
  }

  async function saveField(field: string) {
    if (!contact) return
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: editValue }),
    })
    setEditingField(null)
    refetchContact()
  }

  async function toggleLock(field: string) {
    if (!contact) return
    const isLocked = contact.lockedFields.includes(field)
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isLocked ? { unlockField: field } : { lockField: field }),
    })
    refetchContact()
  }

  async function unlinkEmail(email: string) {
    if (!contact) return
    // Optimistically remove from cache
    queryClient.setQueryData<Contact>(["contact", userId, contactId], (prev) =>
      prev ? { ...prev, emailAddresses: prev.emailAddresses.filter((ea) => ea.email !== email) } : prev
    )
    try {
      const res = await fetch(`/api/contacts/${contact.id}/emails`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? `Failed to unlink email (${res.status})`)
        refetchContact() // restore on failure
      }
    } catch {
      alert("Network error — could not unlink email.")
      refetchContact()
    }
  }

  async function toggleReconnect() {
    if (!contact) return
    const newStatus = contact.outreachStatus === "not_contacted" ? null : "not_contacted"
    const res = await fetch(`/api/reconnect/${contact.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      queryClient.setQueryData<Contact>(["contact", userId, contactId], (prev) =>
        prev ? { ...prev, outreachStatus: newStatus } : prev
      )
    }
  }

  async function linkEmail(email: string) {
    if (!contact) return
    setLinkEmailLoading(true)
    try {
      await fetch("/api/gmail/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, contactId: contact.id }),
      })
      setLinkingEmail(false)
      setEmailSearchQ("")
      setEmailSearchResults([])
      refetchContact()
      fetch(`/api/contacts/${contactId}/emails?limit=20`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) { setEmails(d.messages ?? []); setEmailNextCursor(d.nextCursor) } })
    } finally {
      setLinkEmailLoading(false)
    }
  }

  async function updatePhotoUrl() {
    if (!contact || !photoUrlInput.trim()) return
    setPhotoUrlLoading(true)
    try {
      const res = await fetch(`/api/contacts/${contact.id}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: photoUrlInput.trim() }),
      })
      if (res.ok) {
        setPhotoUrlOpen(false)
        setPhotoUrlInput("")
        refetchContact()
      }
    } finally {
      setPhotoUrlLoading(false)
    }
  }

  async function saveName() {
    if (!contact) return
    const firstName = editFirstName.trim()
    const lastName = editLastName.trim()
    if (!firstName) return
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName }),
    })
    setEditingName(false)
    refetchContact()
  }

  async function savePhone(which: "primary" | number) {
    if (!contact) return
    const val = editPhoneValue.trim()
    if (which === "primary") {
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: val || null }),
      })
    } else {
      const updated = [...(contact.phones ?? [])]
      if (val) updated[which as number] = val
      else updated.splice(which as number, 1)
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: updated }),
      })
    }
    setEditingPhone(null)
    refetchContact()
  }

  async function addPhone() {
    if (!contact) return
    const val = newPhoneValue.trim()
    if (!val) return
    // If no primary phone yet, set it as primary; otherwise add to array
    if (!contact.phoneNumber) {
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: val }),
      })
    } else {
      const updated = [...(contact.phones ?? []), val]
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: updated }),
      })
    }
    setNewPhoneValue("")
    setAddingPhone(false)
    refetchContact()
  }

  async function removePhone(which: "primary" | number) {
    if (!contact) return
    if (which === "primary") {
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: null }),
      })
    } else {
      const updated = [...(contact.phones ?? [])]
      updated.splice(which as number, 1)
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: updated }),
      })
    }
    refetchContact()
  }

  if (!contactId) return null

  const fullName = contact ? `${contact.firstName} ${contact.lastName}` : ""
  const inits = contact ? initials(contact.firstName, contact.lastName) : ""

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Contact details</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : contact ? (
          <div className="flex-1 overflow-y-auto">
            {/* Profile */}
            <div className="px-5 py-5 border-b border-gray-100 relative">
              <div className="flex items-start gap-4">
                <div className="relative group/photo shrink-0">
                  {contact.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoSrc(contact.photoUrl)!}
                      alt={fullName}
                      className="w-16 h-16 rounded-2xl object-cover border border-gray-100"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xl font-bold">
                      {inits}
                    </div>
                  )}
                  <button
                    onClick={() => { setPhotoUrlOpen(true); setPhotoUrlInput("") }}
                    title="Update photo from URL"
                    className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <Camera size={16} className="text-white" />
                  </button>
                </div>
                {photoUrlOpen && (
                  <div className="absolute left-0 right-0 top-16 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2 mx-5">
                    <p className="text-xs font-medium text-gray-700">Paste photo URL (LinkedIn, Google, etc.)</p>
                    <input
                      autoFocus
                      type="url"
                      placeholder="https://…"
                      value={photoUrlInput}
                      onChange={(e) => setPhotoUrlInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") updatePhotoUrl(); if (e.key === "Escape") setPhotoUrlOpen(false) }}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        disabled={photoUrlLoading || !photoUrlInput.trim()}
                        onClick={updatePhotoUrl}
                        className="flex items-center gap-1.5 text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {photoUrlLoading ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                        {photoUrlLoading ? "Saving…" : "Save"}
                      </button>
                      {contact.photoUrl && (
                        <button
                          disabled={photoUrlLoading}
                          onClick={async () => {
                            setPhotoUrlLoading(true)
                            try {
                              const res = await fetch(`/api/contacts/${contact.id}/photo`, {
                                method: "DELETE",
                              })
                              if (res.ok) {
                                queryClient.setQueryData<Contact>(["contact", userId, contactId], (c) => c ? { ...c, photoUrl: null } : c)
                                setPhotoUrlOpen(false)
                              }
                            } finally { setPhotoUrlLoading(false) }
                          }}
                          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 size={10} />
                          Remove
                        </button>
                      )}
                      <button
                        onClick={() => setPhotoUrlOpen(false)}
                        className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <input
                        autoFocus
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false) }}
                        placeholder="First name"
                        className="text-sm font-semibold border border-blue-300 rounded px-2 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      />
                      <input
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false) }}
                        placeholder="Last name"
                        className="text-sm font-semibold border border-blue-300 rounded px-2 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      />
                      <button onClick={saveName} className="text-green-500 hover:text-green-600"><Check size={14} /></button>
                      <button onClick={() => setEditingName(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 group/name mb-0.5">
                      <h3 className="text-lg font-bold text-gray-900">{fullName}</h3>
                      <button
                        onClick={() => { setEditFirstName(contact.firstName); setEditLastName(contact.lastName); setEditingName(true) }}
                        className="text-gray-300 hover:text-gray-500 md:opacity-0 md:group-hover/name:opacity-100 transition-opacity shrink-0"
                        title="Edit name"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  )}
                  {contact.position && (
                    <p className="text-sm text-gray-600 mt-0.5">{contact.position}</p>
                  )}
                  {contact.headline && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{contact.headline}</p>
                  )}
                  {contact.company && (
                    <Link
                      href={`/companies/${encodeURIComponent(contact.company)}`}
                      className="flex items-center gap-1.5 mt-1.5 group/company w-fit hover:text-blue-600 transition-colors"
                    >
                      <CompanyLogo domain={companyNameToDomain(contact.company)} name={contact.company} size={14} radius="rounded-sm" className="shrink-0" />
                      <span className="text-sm text-gray-700 group-hover/company:text-blue-600">{contact.company}</span>
                    </Link>
                  )}
                  {(contact.connectedOn || (contact.commonConnections != null && contact.commonConnections > 0)) && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {contact.connectedOn && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <Calendar size={11} className="shrink-0" />
                          Connected {formatDate(contact.connectedOn)}
                        </span>
                      )}
                      {contact.commonConnections != null && contact.commonConnections > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                          <Users size={10} className="shrink-0" />
                          {contact.commonConnections} mutual
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-4 flex-wrap">
                {contact.profileUrl && (() => {
                  // Mirror linkedinLevel() logic: degree "1" or connectedOn → connected
                  const deg = contact.linkedinDegree
                  const isConnected = deg === "1" || (!deg && !!contact.connectedOn)
                  const degSuffix: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd" }
                  const degLabel = deg ? degSuffix[deg] : null
                  const colorCls = isConnected
                    ? "text-blue-600 border-blue-200 hover:bg-blue-50"
                    : "text-gray-500 border-gray-200 hover:bg-gray-50"
                  const titleText = isConnected
                    ? "1st-degree LinkedIn connection"
                    : (deg === "2" || deg === "3")
                      ? "Profile saved – not connected on LinkedIn"
                      : "View on LinkedIn"
                  return (
                    <a
                      href={contact.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors ${colorCls}`}
                      title={titleText}
                    >
                      <ExternalLink size={12} />
                      LinkedIn{degLabel && <span className="opacity-50 text-[10px]">{degLabel}</span>}
                    </a>
                  )
                })()}
                <button
                  onClick={enrich}
                  disabled={enriching}
                  className={cn(
                    "flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors",
                    contact.coworkEnrichedAt
                      ? "text-gray-500 border-gray-200 hover:bg-gray-50"
                      : "text-purple-600 border-purple-200 hover:bg-purple-50"
                  )}
                >
                  <Sparkles size={12} className={enriching ? "animate-pulse" : ""} />
                  {enriching ? "Enriching…" : contact.coworkEnrichedAt ? "Re-enrich" : "Enrich with Cowork"}
                </button>
                {(contact.outreachStatus === null || contact.outreachStatus === "not_contacted") && (
                  <button
                    onClick={toggleReconnect}
                    className={cn(
                      "flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors",
                      contact.outreachStatus === "not_contacted"
                        ? "text-green-600 border-green-200 bg-green-50 hover:bg-green-100"
                        : "text-gray-500 border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <Bookmark size={12} fill={contact.outreachStatus === "not_contacted" ? "currentColor" : "none"} />
                    {contact.outreachStatus === "not_contacted" ? "In Reconnect" : "Add to Reconnect"}
                  </button>
                )}
                {/* Delete contact — requires explicit confirmation */}
                {deleteConfirm ? (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-red-600 font-medium">Delete contact?</span>
                    <button
                      onClick={deleteContact}
                      disabled={deleting}
                      className="flex items-center gap-1 text-xs text-white bg-red-500 hover:bg-red-600 border border-red-500 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                    >
                      {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg px-3 py-1.5 transition-colors ml-auto"
                    title="Delete contact"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="px-5 py-4 border-b border-gray-100 space-y-3">
              {[
                { field: "company",  icon: Building2, value: contact.company,  label: "Company" },
                { field: "industry", icon: Globe,     value: contact.industry, label: "Industry" },
              ].map(({ field, icon: Icon, value, label }) => {
                const isLocked = contact.lockedFields.includes(field)
                return (
                <div key={field} className="flex items-center gap-3">
                  <Icon size={14} className="text-gray-400 shrink-0" />
                  {editingField === field ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveField(field)}
                        className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button onClick={() => saveField(field)} className="text-blue-600 hover:text-blue-700">
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditingField(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 group/field">
                      {field === "company" && value ? (
                        <Link
                          href={`/companies/${encodeURIComponent(value)}`}
                          className="flex items-center gap-1.5 flex-1 min-w-0 hover:text-blue-600 transition-colors"
                        >
                          <CompanyLogo domain={companyNameToDomain(value)} name={value} size={14} radius="rounded-sm" className="shrink-0" />
                          <span className="text-sm text-gray-700 hover:text-blue-600 truncate">{value}</span>
                        </Link>
                      ) : (
                        <span className={cn("text-sm flex-1", value ? "text-gray-700" : "text-gray-300 italic")}>
                          {value ?? `Add ${label.toLowerCase()}`}
                        </span>
                      )}
                      <button
                        onClick={() => { setEditingField(field); setEditValue(value ?? "") }}
                        className="text-gray-300 hover:text-gray-600 md:opacity-0 md:group-hover/field:opacity-100 transition-opacity shrink-0"
                        title={`Edit ${label.toLowerCase()}`}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => toggleLock(field)}
                        className={cn(
                          "md:opacity-0 md:group-hover/field:opacity-100 transition-opacity",
                          isLocked ? "text-amber-500 opacity-100" : "text-gray-300 hover:text-amber-500"
                        )}
                        title={isLocked ? `Unlock ${label.toLowerCase()} (syncs may update it)` : `Lock ${label.toLowerCase()} (prevent sync overwrites)`}
                      >
                        {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                      </button>
                    </div>
                  )}
                </div>
                )
              })}

              {/* City row */}
              {(contact.city || contact.location) && (
                <div className="flex items-center gap-3 group/field">
                  <MapPin size={14} className="text-gray-400 shrink-0" />
                  {editingField === "city" ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveField("city")}
                        className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button onClick={() => saveField("city")} className="text-blue-600 hover:text-blue-700"><Check size={14} /></button>
                      <button onClick={() => setEditingField(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-gray-700 flex-1">{contact.city ?? contact.location}</span>
                      <button
                        onClick={() => { setEditingField("city"); setEditValue(contact.city ?? "") }}
                        className="text-gray-300 hover:text-gray-600 md:opacity-0 md:group-hover/field:opacity-100 transition-opacity"
                      ><Edit2 size={12} /></button>
                    </div>
                  )}
                </div>
              )}

              {/* Country row */}
              {contact.country && (
                <div className="flex items-center gap-3 group/field">
                  <span className="text-base leading-none w-[14px] text-center shrink-0 select-none" aria-hidden>
                    {countryFlag(contact.country) || "🌍"}
                  </span>
                  {editingField === "country" ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveField("country")}
                        className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button onClick={() => saveField("country")} className="text-blue-600 hover:text-blue-700"><Check size={14} /></button>
                      <button onClick={() => setEditingField(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-gray-700 flex-1">{contact.country}</span>
                      <button
                        onClick={() => { setEditingField("country"); setEditValue(contact.country ?? "") }}
                        className="text-gray-300 hover:text-gray-600 md:opacity-0 md:group-hover/field:opacity-100 transition-opacity"
                      ><Edit2 size={12} /></button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-start gap-3">
                <Mail size={14} className="text-gray-400 shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  {contact.emailAddresses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {contact.emailAddresses.map((ea) => {
                        const kind = classifyEmail(ea.email, contact.company)
                        return (
                          <span key={ea.email} className={cn(
                            "group/email flex items-center gap-1 text-xs rounded-full px-2.5 py-0.5 border",
                            kind ? EMAIL_KIND_BG[kind] : "bg-gray-50 border-gray-200 text-gray-700"
                          )}
                          title={kind ? EMAIL_KIND_TITLE[kind] : undefined}>
                            <span className={cn(blurred && "blur-sm select-none")}>{ea.email}</span>
                            <button
                              title="Unlink this email address"
                              onClick={() => unlinkEmail(ea.email)}
                              className="text-gray-400 hover:text-red-500 md:opacity-0 md:group-hover/email:opacity-100 transition-opacity ml-0.5"
                            >
                              <Link2Off size={10} />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {linkingEmail ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search by email or name…"
                            value={emailSearchQ}
                            onChange={(e) => setEmailSearchQ(e.target.value)}
                            className="w-full pl-6 pr-2 py-1.5 text-xs border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <button
                          onClick={() => { setLinkingEmail(false); setEmailSearchQ(""); setEmailSearchResults([]) }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      {emailSearchLoading && <p className="text-xs text-gray-400">Searching…</p>}
                      {emailSearchResults.length > 0 && (
                        <div className="space-y-0.5">
                          {emailSearchResults.map((r) => (
                            <button
                              key={r.fromEmail}
                              disabled={linkEmailLoading}
                              onClick={() => linkEmail(r.fromEmail)}
                              className="w-full text-left flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg hover:bg-blue-50 border border-gray-100 bg-white disabled:opacity-50"
                            >
                              {linkEmailLoading ? <Loader2 size={10} className="animate-spin text-blue-500 shrink-0" /> : null}
                              <span className={cn("font-medium text-gray-800 truncate", blurred && !r.fromName && "blur-sm select-none")}>{r.fromName ?? r.fromEmail}</span>
                              {r.fromName && <span className={cn("text-gray-400 truncate", blurred && "blur-sm select-none")}>{r.fromEmail}</span>}
                              {r.alreadyLinked && r.linkedContactName && r.linkedContactId !== contact?.id && (
                                <span className="text-orange-400 text-[10px] shrink-0 ml-auto">→ {r.linkedContactName}</span>
                              )}
                              {r.alreadyLinked && (!r.linkedContactName || r.linkedContactId === contact?.id) && (
                                <span className="text-green-500 text-[10px] shrink-0 ml-auto">✓ linked</span>
                              )}
                              {!r.alreadyLinked && <span className="text-gray-300 ml-auto shrink-0">{r.messageCount}msg</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      {emailSearchQ.trim() && !emailSearchLoading && emailSearchResults.length === 0 && (
                        <p className="text-xs text-gray-400">No senders found matching &ldquo;{emailSearchQ}&rdquo;</p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setLinkingEmail(true)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <Link2 size={11} /> Link email address
                    </button>
                  )}
                </div>
              </div>

              {/* Phones section */}
              {(() => {
                const allPhones = [
                  ...(contact.phoneNumber ? [{ key: "primary", value: contact.phoneNumber }] : []),
                  ...(contact.phones ?? []).map((p, i) => ({ key: String(i), value: p })),
                ]
                const hasAny = allPhones.length > 0
                return (
                  <div className="flex items-start gap-3">
                    <Phone size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      {allPhones.map(({ key, value }) => (
                        <div key={key} className="group/phone flex items-center gap-2">
                          {editingPhone === key ? (
                            <>
                              <input
                                autoFocus
                                value={editPhoneValue}
                                onChange={(e) => setEditPhoneValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") savePhone(key === "primary" ? "primary" : Number(key))
                                  if (e.key === "Escape") setEditingPhone(null)
                                }}
                                className="flex-1 text-sm border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <button onClick={() => savePhone(key === "primary" ? "primary" : Number(key))} className="text-blue-600 hover:text-blue-700"><Check size={13} /></button>
                              <button onClick={() => setEditingPhone(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                            </>
                          ) : (
                            <>
                              <a href={`tel:${value}`} className="text-sm text-gray-700 hover:text-blue-600 transition-colors flex-1">{value}</a>
                              <a href={`https://wa.me/${value.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" title="Open in WhatsApp" className="opacity-0 group-hover/phone:opacity-100 transition-opacity text-green-500 hover:text-green-600">
                                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              </a>
                              <button onClick={() => { setEditingPhone(key); setEditPhoneValue(value) }} className="opacity-0 group-hover/phone:opacity-100 transition-opacity text-gray-300 hover:text-gray-600"><Edit2 size={12} /></button>
                              <button onClick={() => removePhone(key === "primary" ? "primary" : Number(key))} className="opacity-0 group-hover/phone:opacity-100 transition-opacity text-gray-300 hover:text-red-500"><X size={12} /></button>
                            </>
                          )}
                        </div>
                      ))}
                      {addingPhone ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="tel"
                            placeholder="+33 6 12 34 56 78"
                            value={newPhoneValue}
                            onChange={(e) => setNewPhoneValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") addPhone(); if (e.key === "Escape") setAddingPhone(false) }}
                            className="flex-1 text-sm border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button onClick={addPhone} className="text-blue-600 hover:text-blue-700"><Check size={13} /></button>
                          <button onClick={() => setAddingPhone(false)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setAddingPhone(true)} className={cn("flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors", !hasAny && "mt-0")}>
                          <Plus size={11} /> {hasAny ? "Add phone" : "Add phone number"}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}

              {contact.whatsappLastAt && (
                <div className="flex items-center gap-3 group/wa">
                  {/* WhatsApp logo */}
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <span className="text-sm text-gray-600 flex-1">
                    Last WhatsApp {formatDate(contact.whatsappLastAt)}
                    {contact.whatsappMessageCount > 0 && (
                      <span className="text-gray-400 ml-1">· {contact.whatsappMessageCount} message{contact.whatsappMessageCount !== 1 ? "s" : ""}</span>
                    )}
                    {contact.whatsappChatName && (
                      <span className="text-gray-300 ml-1">({contact.whatsappChatName})</span>
                    )}
                  </span>
                  {contact.whatsappChatName && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Unlink WhatsApp chat "${contact.whatsappChatName}" from this contact?`)) return
                        await fetch("/api/whatsapp/match", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ chatName: contact.whatsappChatName }),
                        })
                        refetchContact()
                      }}
                      title="Unlink WhatsApp chat from this contact"
                      className="opacity-0 group-hover/wa:opacity-100 transition-opacity text-gray-300 hover:text-red-400 shrink-0"
                    >
                      <Link2Off size={12} />
                    </button>
                  )}
                </div>
              )}

              {contact.linkedinDmLastAt && (
                <div className="flex items-center gap-3 group/lidm">
                  {/* LinkedIn icon */}
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="#0A66C2">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  <span className="text-sm text-gray-600 flex-1">
                    Last LinkedIn DM {formatDate(contact.linkedinDmLastAt)}
                    {contact.linkedinDmMessageCount > 0 && (
                      <span className="text-gray-400 ml-1">· {contact.linkedinDmMessageCount} message{contact.linkedinDmMessageCount !== 1 ? "s" : ""}</span>
                    )}
                    {contact.linkedinDmChatName && (
                      <span className="text-gray-300 ml-1">({contact.linkedinDmChatName})</span>
                    )}
                  </span>
                  {contact.linkedinDmConversationId && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Unlink LinkedIn DM conversation from this contact?`)) return
                        await fetch("/api/linkedin-dm/match", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ conversationId: contact.linkedinDmConversationId }),
                        })
                        refetchContact()
                      }}
                      title="Unlink LinkedIn DM conversation from this contact"
                      className="opacity-0 group-hover/lidm:opacity-100 transition-opacity text-gray-300 hover:text-red-400 shrink-0"
                    >
                      <Link2Off size={12} />
                    </button>
                  )}
                </div>
              )}

              {contact.connectedOn && (
                <div className="flex items-center gap-3">
                  <Calendar size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-600">
                    Connected {formatDate(contact.connectedOn)}
                  </span>
                </div>
              )}

              {contact.commonConnections != null && (
                <div className="flex items-center gap-3">
                  <Users size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-600">
                    {contact.commonConnections} mutual connection{contact.commonConnections !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Experience */}
            {contact.experience && contact.experience.length > 0 && (
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase size={13} className="text-gray-400" />
                  <p className="text-xs font-medium text-gray-500">Experience</p>
                </div>
                <div className="space-y-3">
                  {contact.experience.map((e, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Briefcase size={12} className="text-gray-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{e.title}</p>
                        {e.company && <p className="text-xs text-gray-500">{e.company}</p>}
                        {(e.start || e.end) && (
                          <p className="text-xs text-gray-400">
                            {e.start}{e.end ? ` – ${e.end}` : ""}
                          </p>
                        )}
                        {e.location && <p className="text-xs text-gray-400">{e.location}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {contact.education && contact.education.length > 0 && (
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <GraduationCap size={13} className="text-gray-400" />
                  <p className="text-xs font-medium text-gray-500">Education</p>
                </div>
                <div className="space-y-3">
                  {contact.education.map((e, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                        <GraduationCap size={12} className="text-gray-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{e.school}</p>
                        {e.degree && <p className="text-xs text-gray-500">{e.degree}{e.field ? ` · ${e.field}` : ""}</p>}
                        {(e.start || e.end) && (
                          <p className="text-xs text-gray-400">
                            {e.start}{e.end ? ` – ${e.end}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shared connections */}
            {contact.sharedConnections && (contact.sharedConnections as SharedConnection[]).length > 0 && (
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={13} className="text-gray-400" />
                  <p className="text-xs font-medium text-gray-500">
                    Mutual connections ({(contact.sharedConnections as SharedConnection[]).length})
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(contact.sharedConnections as SharedConnection[]).slice(0, 12).map((sc, i) =>
                    sc.profileUrl ? (
                      <a
                        key={i}
                        href={sc.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full px-2.5 py-1 transition-colors"
                      >
                        {sc.name}
                      </a>
                    ) : (
                      <span key={i} className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1">
                        {sc.name}
                      </span>
                    )
                  )}
                  {(contact.sharedConnections as SharedConnection[]).length > 12 && (
                    <span className="text-xs text-gray-400 self-center">
                      +{(contact.sharedConnections as SharedConnection[]).length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Email history */}
            {emails.length > 0 && (
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Mail size={13} className="text-gray-400" />
                    <p className="text-xs font-medium text-gray-500">
                      Email history
                      {contact.lastInteractionAt && (
                        <span className="text-gray-400 font-normal ml-1">
                          · last {formatDate(contact.lastInteractionAt)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {emails.map((email) => (
                    <div key={email.id} className="flex items-start gap-2">
                      {email.isOutbound ? (
                        <ArrowUpRight size={12} className="text-blue-400 shrink-0 mt-0.5" />
                      ) : (
                        <ArrowDownLeft size={12} className="text-green-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-xs text-gray-700 truncate", blurred && "blur-sm select-none")}>
                          {email.subject ?? "(no subject)"}
                        </p>
                        <p className={cn("text-xs text-gray-400", blurred && "blur-sm select-none")}>{formatDate(email.sentAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {emailNextCursor && !emailsExpanded && (
                  <button
                    onClick={loadMoreEmails}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-700"
                  >
                    Show more emails
                  </button>
                )}
              </div>
            )}

            {/* Lists membership */}
            {contact.listMembers.length > 0 && (
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">In lists</p>
                <div className="flex flex-wrap gap-1.5">
                  {contact.listMembers.map((m) => (
                    <a
                      key={m.listId}
                      href={`/lists/${m.listId}`}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full px-2.5 py-1 transition-colors"
                    >
                      {m.list.name}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Labels */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Tag size={13} className="text-gray-400" />
                <p className="text-xs font-medium text-gray-500">Labels</p>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {contact.labels.map(({ label }) => (
                  <LabelBadge key={label.id} label={label} onRemove={() => removeLabel(label.id)} />
                ))}

                {addingLabel ? (
                  <div className="relative">
                    <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[180px]">
                      {/* Existing labels */}
                      <div className="max-h-40 overflow-y-auto p-1">
                        {allLabels.filter((l) => !contact.labels.some((cl) => cl.label.id === l.id)).length === 0 && !creatingLabel ? (
                          <p className="text-xs text-gray-400 px-2 py-1.5">All labels applied</p>
                        ) : (
                          allLabels
                            .filter((l) => !contact.labels.some((cl) => cl.label.id === l.id))
                            .map((l) => (
                              <button
                                key={l.id}
                                onClick={() => addLabel(l.id)}
                                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm"
                              >
                                <LabelBadge label={l} />
                              </button>
                            ))
                        )}
                      </div>

                      {/* Inline new-label form */}
                      {creatingLabel ? (
                        <div className="border-t border-gray-100 p-2 space-y-1.5">
                          <input
                            autoFocus
                            value={newLabelName}
                            onChange={(e) => setNewLabelName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") createAndAddLabel()
                              if (e.key === "Escape") { setCreatingLabel(false); setNewLabelName("") }
                            }}
                            placeholder="Label name…"
                            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <div className="flex items-center gap-1 flex-wrap">
                            {LABEL_COLOR_KEYS.map((key) => {
                              const c = labelColors(key)
                              return (
                                <button
                                  key={key}
                                  onClick={() => setNewLabelColor(key)}
                                  className={cn("w-4 h-4 rounded-full", c.dot, newLabelColor === key && "ring-2 ring-offset-1 ring-gray-400")}
                                />
                              )
                            })}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={createAndAddLabel}
                              disabled={!newLabelName.trim()}
                              className="text-xs text-blue-600 font-medium hover:text-blue-700 disabled:opacity-40"
                            >
                              Create
                            </button>
                            <button
                              onClick={() => { setCreatingLabel(false); setNewLabelName("") }}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="border-t border-gray-100 p-1">
                          <button
                            onClick={() => setCreatingLabel(true)}
                            className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 text-xs text-gray-500"
                          >
                            <Plus size={11} />
                            New label…
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { setAddingLabel(false); setCreatingLabel(false); setNewLabelName("") }}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200"
                    >
                      <X size={10} /> Close
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingLabel(true)}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-gray-300 hover:border-gray-400 transition-colors"
                  >
                    <Plus size={10} /> Add label
                  </button>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <StickyNote size={14} className="text-gray-400" />
                <p className="text-xs font-medium text-gray-500">Notes</p>
              </div>

              <div className="space-y-2 mb-3">
                {contact.notes.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No notes yet</p>
                )}
                {contact.notes.map((note) => (
                  <div key={note.id} className="group bg-amber-50 rounded-lg p-3 border border-amber-100">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-amber-500">{formatDate(note.createdAt)}</span>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add note input */}
              <div className="flex items-end gap-2">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote()
                  }}
                  placeholder="Add a note… (⌘+Enter to save)"
                  rows={3}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <button
                  onClick={addNote}
                  disabled={!noteText.trim() || submitting}
                  className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
