"use client"

import { Users, Building2, MapPin, Calendar, StickyNote, Plus, Mail } from "lucide-react"
import { cn, initials, formatDate } from "@/lib/utils"
import LabelBadge from "./LabelBadge"
import { STATUS_BADGE } from "@/lib/reconnect-status"

export type ContactSummary = {
  id: string
  firstName: string
  lastName: string
  position: string | null
  company: string | null
  location: string | null
  industry: string | null
  photoUrl: string | null
  emailAddress: string | null
  commonConnections: number | null
  connectedOn: string | null
  outreachStatus: string | null
  coworkEnrichedAt: string | null
  notes: { id: string }[]
  listMembers: { listId: string; list: { name: string } }[]
  labels: { label: { id: string; name: string; color: string } }[]
}

interface Props {
  contact: ContactSummary
  selected?: boolean
  onSelect?: (id: string) => void
  onClick?: (contact: ContactSummary) => void
  onAddToList?: (contact: ContactSummary) => void
}

export default function ContactCard({
  contact,
  selected,
  onSelect,
  onClick,
  onAddToList,
}: Props) {
  const fullName = `${contact.firstName} ${contact.lastName}`
  const inits = initials(contact.firstName, contact.lastName)

  return (
    <div
      className={cn(
        "group relative bg-white rounded-xl border transition-all cursor-pointer",
        selected
          ? "border-blue-500 ring-2 ring-blue-100"
          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
      )}
      onClick={() => onClick?.(contact)}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <div
          className="absolute top-3 left-3 z-10"
          onClick={(e) => {
            e.stopPropagation()
            onSelect(contact.id)
          }}
        >
          <div
            className={cn(
              "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
              selected
                ? "bg-blue-600 border-blue-600"
                : "border-gray-300 bg-white group-hover:border-gray-400"
            )}
          >
            {selected && (
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            )}
          </div>
        </div>
      )}

      <div className="p-4">
        {/* Avatar + name */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 relative">
            {contact.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.photoUrl}
                alt={fullName}
                className="w-11 h-11 rounded-full object-cover border border-gray-100"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-semibold">
                {inits}
              </div>
            )}
            {contact.emailAddress && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center border border-white" title={contact.emailAddress}>
                <Mail size={8} className="text-green-500" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 text-sm truncate">{fullName}</p>
            {contact.position && (
              <p className="text-xs text-gray-600 truncate mt-0.5">{contact.position}</p>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="mt-3 space-y-1.5">
          {contact.company && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Building2 size={11} className="shrink-0 text-gray-400" />
              <span className="truncate">{contact.company}</span>
            </div>
          )}
          {contact.location && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin size={11} className="shrink-0 text-gray-400" />
              <span className="truncate">{contact.location}</span>
            </div>
          )}
          {contact.connectedOn && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Calendar size={11} className="shrink-0 text-gray-400" />
              <span>{formatDate(contact.connectedOn)}</span>
            </div>
          )}
        </div>

        {/* Footer badges */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {contact.outreachStatus && STATUS_BADGE[contact.outreachStatus] && (
              <span className={cn("inline-flex items-center text-xs rounded-full px-2 py-0.5 border font-medium", STATUS_BADGE[contact.outreachStatus].className)}>
                {STATUS_BADGE[contact.outreachStatus].label}
              </span>
            )}
            {contact.commonConnections != null && contact.commonConnections > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
                <Users size={10} />
                {contact.commonConnections} mutual
              </span>
            )}
            {contact.industry && (
              <span className="inline-flex items-center text-xs text-gray-500 bg-gray-50 rounded-full px-2 py-0.5 truncate max-w-[100px]">
                {contact.industry}
              </span>
            )}
            {contact.notes.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                <StickyNote size={10} />
                {contact.notes.length}
              </span>
            )}
            {contact.listMembers.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs text-violet-600 bg-violet-50 rounded-full px-2 py-0.5 truncate max-w-[90px]">
                {contact.listMembers.length === 1
                  ? contact.listMembers[0].list.name
                  : `${contact.listMembers.length} lists`}
              </span>
            )}
          </div>

          {onAddToList && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddToList(contact)
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={12} />
              List
            </button>
          )}
        </div>

        {/* Label chips */}
        {contact.labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.labels.slice(0, 2).map(({ label }) => (
              <LabelBadge key={label.id} label={label} />
            ))}
            {contact.labels.length > 2 && (
              <span className="text-xs text-gray-400 self-center">+{contact.labels.length - 2}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
