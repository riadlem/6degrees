"use client"

import { StickyNote, Plus, Mail, Sparkles, Users } from "lucide-react"
import { cn, initials, formatDate, photoSrc } from "@/lib/utils"
import LabelBadge from "./LabelBadge"
import { type ContactSummary, linkedinDegree } from "./ContactCard"
import { STATUS_BADGE } from "@/lib/reconnect-status"
import { usePrivacy } from "@/contexts/PrivacyContext"
import { classifyEmail, EMAIL_KIND_COLOR, EMAIL_KIND_TITLE } from "@/lib/email-classify"
import CompanyLogo, { companyNameToDomain } from "./CompanyLogo"

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
  const { blurred } = usePrivacy()
  const emailKind = classifyEmail(contact.emailAddress, contact.company)
  const degree = linkedinDegree(contact)

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
        selected ? "bg-blue-50" : "odd:bg-white even:bg-gray-50/60 hover:bg-gray-100"
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
      <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden">
        {contact.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc(contact.photoUrl)!} alt={fullName} className={cn("w-10 h-10 rounded-full object-cover", blurred && "blur")} />
        ) : (
          // Initials fallback — never blurred
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-semibold">
            {inits}
          </div>
        )}
      </div>

      {/* Name + optional email */}
      <div className="w-40 shrink-0">
        <div className="flex items-center gap-1.5">
          <p className={cn("text-sm font-semibold text-gray-900 truncate", blurred && "blur-sm select-none")}>{fullName}</p>
          {degree === "1" && (
            <span title="LinkedIn connection" className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none">1</span>
          )}
          {degree === "2" && (
            <span title="Followed on LinkedIn (not connected)" className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-[9px] font-bold leading-none">2</span>
          )}
          {contact.profileUrl && (
            <a
              href={contact.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open LinkedIn profile"
              className="shrink-0 text-[#0A66C2] hover:text-[#004182] transition-colors opacity-0 group-hover:opacity-100"
            >
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
          )}
        </div>
        {emailKind && (
          <div className={cn("text-[10px] flex items-center gap-0.5", EMAIL_KIND_COLOR[emailKind])}
               title={EMAIL_KIND_TITLE[emailKind]}>
            <Mail size={8} className="shrink-0" />
            {/* Mismatch: icon only (stale indicator). Personal/match: show address text (blurred if privacy on) */}
            {emailKind !== "mismatch" && (
              <span className={cn("truncate", blurred && "blur-sm select-none")}>
                {contact.emailAddress}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Position */}
      <div className="flex-1 min-w-0 hidden sm:block">
        <p className="text-sm text-gray-500 truncate">{contact.position ?? ""}</p>
      </div>

      {/* Company */}
      <div className="w-44 shrink-0 hidden md:flex items-center gap-1.5">
        {contact.company && (
          <CompanyLogo
            domain={companyNameToDomain(contact.company)}
            name={contact.company}
            size={16}
            radius="rounded-sm"
          />
        )}
        <p className="text-sm text-gray-600 truncate">{contact.company ?? ""}</p>
      </div>

      {/* Location */}
      <div className="w-32 shrink-0 hidden lg:block">
        <p className="text-xs text-gray-400 truncate">{contact.location ?? ""}</p>
      </div>

      {/* Shared connections — always visible fixed column */}
      <div className="w-24 shrink-0 flex items-center justify-end">
        {contact.commonConnections != null && contact.commonConnections > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-100 rounded-full px-2.5 py-1 shadow-sm">
            <Users size={11} />
            {contact.commonConnections}
          </span>
        )}
      </div>

      {/* Status + labels + notes (no lists here) */}
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
        {contact.coworkEnrichedAt && (
          <span title={`Cowork enriched ${formatDate(contact.coworkEnrichedAt)}`} className="text-xs text-purple-500 bg-purple-50 rounded-full px-1.5 py-0.5 shrink-0">
            <Sparkles size={10} className="inline" />
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

      {/* Lists — fixed column after connected date */}
      <div className="w-32 shrink-0 hidden md:block">
        {contact.listMembers.length > 0 && (
          <span className="text-xs text-violet-600 bg-violet-50 rounded-full px-2 py-0.5 truncate max-w-full inline-block">
            {contact.listMembers.length === 1
              ? contact.listMembers[0].list.name
              : `${contact.listMembers.length} lists`}
          </span>
        )}
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
