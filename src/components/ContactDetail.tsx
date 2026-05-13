"use client"

import { useState, useEffect, useCallback } from "react"
import {
  X, Building2, MapPin, Calendar, Globe, Users, Sparkles,
  StickyNote, Send, Trash2, ExternalLink, Edit2, Check, Tag, Plus, GraduationCap, Briefcase
} from "lucide-react"
import { cn, initials, formatDate } from "@/lib/utils"
import LabelBadge from "./LabelBadge"

type Note = { id: string; content: string; createdAt: string }
type ListMembership = { listId: string; list: { id: string; name: string } }
type ContactLabelEntry = { label: { id: string; name: string; color: string } }
type LabelOption = { id: string; name: string; color: string }

type ExperienceEntry = { title?: string; company?: string; location?: string; start?: string; end?: string }
type EducationEntry = { school?: string; degree?: string; field?: string; start?: string; end?: string }
type SharedConnection = { name: string; profileUrl?: string }

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
  photoUrl: string | null
  commonConnections: number | null
  connectedOn: string | null
  coworkEnrichedAt: string | null
  extensionSyncedAt: string | null
  experience: ExperienceEntry[] | null
  education: EducationEntry[] | null
  sharedConnections: SharedConnection[] | null
  notes: Note[]
  listMembers: ListMembership[]
  labels: ContactLabelEntry[]
}

interface Props {
  contactId: string | null
  onClose: () => void
}

export default function ContactDetail({ contactId, onClose }: Props) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [allLabels, setAllLabels] = useState<LabelOption[]>([])
  const [addingLabel, setAddingLabel] = useState(false)

  const fetchContact = useCallback(async () => {
    if (!contactId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts/${contactId}`)
      if (res.ok) setContact(await res.json())
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => {
    fetchContact()
  }, [fetchContact])

  useEffect(() => {
    if (contactId) {
      fetch("/api/labels").then((r) => r.json()).then(setAllLabels)
    }
  }, [contactId])

  async function addLabel(labelId: string) {
    if (!contact) return
    await fetch(`/api/labels/${labelId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: [contact.id] }),
    })
    setAddingLabel(false)
    fetchContact()
  }

  async function removeLabel(labelId: string) {
    if (!contact) return
    await fetch(`/api/labels/${labelId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: [contact.id] }),
    })
    fetchContact()
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
    fetchContact()
  }

  async function deleteNote(noteId: string) {
    if (!contact) return
    await fetch(`/api/contacts/${contact.id}/notes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId }),
    })
    fetchContact()
  }

  async function enrich() {
    if (!contact) return
    setEnriching(true)
    await fetch(`/api/contacts/${contact.id}`, { method: "POST" })
    setEnriching(false)
    fetchContact()
  }

  async function saveField(field: string) {
    if (!contact) return
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: editValue }),
    })
    setEditingField(null)
    fetchContact()
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
            <div className="px-5 py-5 border-b border-gray-100">
              <div className="flex items-start gap-4">
                {contact.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={contact.photoUrl}
                    alt={fullName}
                    className="w-16 h-16 rounded-2xl object-cover border border-gray-100"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xl font-bold">
                    {inits}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-gray-900">{fullName}</h3>
                  {contact.position && (
                    <p className="text-sm text-gray-600 mt-0.5">{contact.position}</p>
                  )}
                  {contact.headline && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{contact.headline}</p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-4">
                {contact.profileUrl && (
                  <a
                    href={contact.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
                  >
                    <ExternalLink size={12} />
                    LinkedIn
                  </a>
                )}
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
              </div>
            </div>

            {/* Details */}
            <div className="px-5 py-4 border-b border-gray-100 space-y-3">
              {[
                { field: "company", icon: Building2, value: contact.company, label: "Company" },
                { field: "location", icon: MapPin, value: contact.location, label: "Location" },
                { field: "industry", icon: Globe, value: contact.industry, label: "Industry" },
              ].map(({ field, icon: Icon, value, label }) => (
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
                      <span className={cn("text-sm flex-1", value ? "text-gray-700" : "text-gray-300 italic")}>
                        {value ?? `Add ${label.toLowerCase()}`}
                      </span>
                      <button
                        onClick={() => { setEditingField(field); setEditValue(value ?? "") }}
                        className="opacity-0 group-hover/field:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}

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
                    <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-lg p-1 min-w-[160px] max-h-48 overflow-y-auto">
                      {allLabels.filter((l) => !contact.labels.some((cl) => cl.label.id === l.id)).length === 0 ? (
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
                    <button
                      onClick={() => setAddingLabel(false)}
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
