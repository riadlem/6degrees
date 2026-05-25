"use client"

import { Users, Building2, MapPin, StickyNote, Plus, Mail, Sparkles } from "lucide-react"
import { cn, initials, formatDate } from "@/lib/utils"
import LabelBadge from "./LabelBadge"
import { STATUS_BADGE } from "@/lib/reconnect-status"
import { usePrivacy } from "@/contexts/PrivacyContext"
import { classifyEmail, EMAIL_KIND_COLOR, EMAIL_KIND_TITLE } from "@/lib/email-classify"
import CompanyLogo, { domainFromEmail } from "./CompanyLogo"

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

export default function ContactCard({ contact, selected, onSelect, onClick, onAddToList }: Props) {
  const fullName = `${contact.firstName} ${contact.lastName}`
  const inits = initials(contact.firstName, contact.lastName)
  const { blurred } = usePrivacy()
  const emailKind = classifyEmail(contact.emailAddress, contact.company)

  return (
    <div
      className={cn(
        "group relative bg-white rounded-2xl border transition-all cursor-pointer flex flex-col",
        selected
          ? "border-blue-500 ring-2 ring-blue-100"
          : "border-gray-200 hover:border-gray-300 hover:shadow-md"
      )}
      onClick={() => onClick?.(contact)}
    >
      {/* Checkbox */}
      {onSelect && (
        <div
          className="absolute top-3 left-3 z-10"
          onClick={(e) => { e.stopPropagation(); onSelect(contact.id) }}
        >
          <div className={cn(
            "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
            selected ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white group-hover:border-gray-400"
          )}>
            {selected && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Cowork badge */}
      {contact.coworkEnrichedAt && (
        <div className="absolute top-3 right-3 z-10" title={`Cowork enriched ${formatDate(contact.coworkEnrichedAt)}`}>
          <span className="text-purple-500 bg-purple-50 rounded-full p-1 flex items-center justify-center">
            <Sparkles size={10} />
          </span>
        </div>
      )}

      {/* Avatar — centered, 100 px */}
      <div className="flex flex-col items-center pt-6 pb-3 px-4">
        <div className="relative shrink-0">
          {contact.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contact.photoUrl}
              alt={fullName}
              className={cn("w-[100px] h-[100px] rounded-full object-cover border-2 border-gray-100 shadow-sm", blurred && "blur")}
            />
          ) : (
            // Initials fallback — never blurred (2 letters, not sensitive)
            <div className="w-[100px] h-[100px] rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl font-bold shadow-sm">
              {inits}
            </div>
          )}
          {emailKind && (
            <span
              className={cn(
                "absolute bottom-1 right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center border-2 border-white shadow-sm",
                EMAIL_KIND_COLOR[emailKind]
              )}
              title={EMAIL_KIND_TITLE[emailKind] + (blurred ? "" : `: ${contact.emailAddress}`)}
            >
              <Mail size={10} />
            </span>
          )}
        </div>

        {/* Name + position */}
        <div className="mt-3 text-center min-w-0 w-full">
          <p className={cn("font-semibold text-gray-900 text-sm leading-tight truncate", blurred && "blur-sm select-none")}>{fullName}</p>
          {contact.position && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">{contact.position}</p>
          )}
        </div>

        {/* Shared connections — prominent pill right below name */}
        {contact.commonConnections != null && contact.commonConnections > 0 && (
          <div className="mt-2 flex justify-center">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 bg-blue-100 rounded-full px-3 py-1 shadow-sm">
              <Users size={13} />
              {contact.commonConnections}
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="px-4 pb-3 space-y-1 text-center">
        {contact.company && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-600">
            <CompanyLogo
              domain={domainFromEmail(contact.emailAddress)}
              name={contact.company}
              size={14}
              radius="rounded-sm"
            />
            <span className="truncate font-medium">{contact.company}</span>
          </div>
        )}
        {contact.location && (
          <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
            <MapPin size={10} className="shrink-0" />
            <span className="truncate">{contact.location}</span>
          </div>
        )}
      </div>

      {/* Badges */}
      <div className="px-3 pb-3 flex flex-wrap items-center justify-center gap-1">
        {contact.outreachStatus && STATUS_BADGE[contact.outreachStatus] && (
          <span className={cn("inline-flex items-center text-xs rounded-full px-2 py-0.5 border font-medium", STATUS_BADGE[contact.outreachStatus].className)}>
            {STATUS_BADGE[contact.outreachStatus].label}
          </span>
        )}
        {contact.industry && (
          <span className="inline-flex items-center text-xs text-gray-500 bg-gray-50 rounded-full px-2 py-0.5 truncate max-w-[100px]">
            {contact.industry}
          </span>
        )}
        {contact.notes.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
            <StickyNote size={9} />
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

      {/* Labels + add to list */}
      {(contact.labels.length > 0 || onAddToList) && (
        <div className="px-3 pb-4 flex items-center justify-between gap-1 border-t border-gray-50 pt-2 mt-auto">
          <div className="flex flex-wrap gap-1">
            {contact.labels.slice(0, 2).map(({ label }) => (
              <LabelBadge key={label.id} label={label} />
            ))}
            {contact.labels.length > 2 && (
              <span className="text-xs text-gray-400 self-center">+{contact.labels.length - 2}</span>
            )}
          </div>
          {onAddToList && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddToList(contact) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0"
            >
              <Plus size={11} />
              List
            </button>
          )}
        </div>
      )}
    </div>
  )
}
