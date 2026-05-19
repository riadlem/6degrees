"use client"

import { StickyNote, Plus, Mail } from "lucide-react"
import { cn, initials, formatDate } from "@/lib/utils"
import LabelBadge from "./LabelBadge"
import { type ContactSummary } from "./ContactCard"
import { STATUS_BADGE } from "@/lib/reconnect-status"

interface Props {
  contact: ContactSummary
  selected?: boolean
  onSelect?: (id: string) => void
  onClick?: (contact: ContactSummary) => void
  onAddToList?: (contact: ContactSummary) => void
}

export default function ContactRow({ contact, selected, onSelect, onClick, onAddToList }: Props) {
  const fullName = `${contact.firstName} ${contact.lastName}`
  const inits = initials(contact.firstName, contact.lastName)

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
        selected ? "bg-blue-50" : "hover:bg-gray-50"
      )}
      onClick={() => onClick?.(contact)}
    >
      {/* Checkbox */}
      {onSelect && (
        <div
          className="shrink-0"
          onClick={(e) => { e.stopPropagation(); onSelect(contact.id) }}
        >
          <div className={cn(
            "w-4 h-4 rounded border-2 flex items-center justify-center",
            selected ? "bg-blue-600 border-blue-600" : "border-gray-300 group-hover:border-gray-400"
          )}>
            {selected && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Avatar */}
      <div className="shrink-0">
        {contact.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={contact.photoUrl} alt={fullName} className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-semibold shrink-0">
            {inits}
          </div>
        )}
      </div>

      {/* Name + optional email */}
      <div className="w-40 shrink-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
        {contact.emailAddress && (
          <p className="text-[10px] text-green-600 truncate flex items-center gap-0.5">
            <Mail size={8} className="shrink-0" />
            {contact.emailAddress}
          </p>
        )}
      </div>

      {/* Position */}
      <div className="flex-1 min-w-0 hidden sm:block">
        <p className="text-sm text-gray-500 truncate">{contact.position ?? ""}</p>
      </div>

      {/* Company */}
      <div className="w-44 shrink-0 hidden md:block">
        <p className="text-sm text-gray-600 truncate">{contact.company ?? ""}</p>
      </div>

      {/* Location */}
      <div className="w-32 shrink-0 hidden lg:block">
        <p className="text-xs text-gray-400 truncate">{contact.location ?? ""}</p>
      </div>

      {/* Status + labels + lists + notes */}
      <div className="flex items-center gap-1 shrink-0">
        {contact.outreachStatus && STATUS_BADGE[contact.outreachStatus] && (
          <span className={cn("text-xs rounded-full px-2 py-0.5 border font-medium shrink-0", STATUS_BADGE[contact.outreachStatus].className)}>
            {STATUS_BADGE[contact.outreachStatus].label}
          </span>
        )}
        {contact.labels.slice(0, 2).map(({ label }) => (
          <LabelBadge key={label.id} label={label} />
        ))}
        {contact.labels.length > 2 && (
          <span className="text-xs text-gray-400">+{contact.labels.length - 2}</span>
        )}
        {contact.listMembers.length > 0 && (
          <span className="text-xs text-violet-600 bg-violet-50 rounded-full px-2 py-0.5 shrink-0 truncate max-w-[100px]">
            {contact.listMembers.length === 1
              ? contact.listMembers[0].list.name
              : `${contact.listMembers.length} lists`}
          </span>
        )}
        {contact.notes.length > 0 && (
          <span className="text-xs text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5 shrink-0">
            <StickyNote size={10} className="inline" />
          </span>
        )}
      </div>

      {/* Connected date */}
      <div className="w-20 text-right shrink-0 hidden md:block">
        <p className="text-xs text-gray-400">{contact.connectedOn ? formatDate(contact.connectedOn) : ""}</p>
      </div>

      {/* Add to list */}
      {onAddToList && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToList(contact) }}
          className="opacity-0 group-hover:opacity-100 shrink-0 text-blue-600 hover:text-blue-700 transition-opacity"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  )
}
