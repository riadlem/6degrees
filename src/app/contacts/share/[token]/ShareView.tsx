"use client"

import { useState } from "react"
import { AlignJustify, LayoutGrid, Image, Download, ExternalLink, Mail, Phone, Clock, Users } from "lucide-react"
import { cn, initials, photoSrc, formatDate } from "@/lib/utils"

type Contact = {
  id: string
  firstName: string
  lastName: string
  position: string | null
  company: string | null
  country: string | null
  profileUrl: string | null
  photoUrl: string | null
  commonConnections: number | null
  emailAddress?: string | null
  phoneNumber?: string | null
  interactionScore?: number | null
  lastInteractionAt?: string | null
  lastEmailAt?: string | null
  lastWaAt?: string | null
  lastLiAt?: string | null
}

type Props = {
  token: string
  name: string | null
  ownerName: string
  level: number
  contacts: Contact[]
}

const LEVEL_LABELS: Record<number, string> = {
  1: "Basic",
  2: "Includes contact info",
  3: "Full — includes interaction data",
}

function Avatar({ contact, size = "md" }: { contact: Contact; size?: "sm" | "md" | "lg" }) {
  const inits = initials(contact.firstName, contact.lastName)
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm"
  if (contact.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoSrc(contact.photoUrl)!}
        alt=""
        className={cn(sizeClass, "rounded-xl object-cover shrink-0")}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
      />
    )
  }
  return (
    <div className={cn(sizeClass, "rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold shrink-0")}>
      {inits}
    </div>
  )
}

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = Math.min(100, (score / Math.max(maxScore, 1)) * 100)
  return (
    <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function ShareView({ token, name, ownerName, level, contacts }: Props) {
  const [view, setView] = useState<"list" | "grid" | "photos">("list")

  const maxScore = Math.max(...contacts.map((c) => c.interactionScore ?? 0), 1)
  const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
  const apiBase = `${baseUrl}/api/contacts/share/${token}`

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{name ?? "Shared contacts"}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Shared by <span className="font-medium text-gray-700">{ownerName}</span>
            {" · "}{contacts.length} contact{contacts.length !== 1 ? "s" : ""}
          </p>
          <span className="inline-block mt-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
            {LEVEL_LABELS[level]}
          </span>
        </div>

        {/* View toggle + downloads */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setView("list")} title="List" className={cn("px-2.5 py-1.5 transition-colors", view === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}>
              <AlignJustify size={13} />
            </button>
            <button onClick={() => setView("grid")} title="Grid" className={cn("px-2.5 py-1.5 transition-colors border-l border-gray-200", view === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}>
              <LayoutGrid size={13} />
            </button>
            <button onClick={() => setView("photos")} title="Photos" className={cn("px-2.5 py-1.5 transition-colors border-l border-gray-200", view === "photos" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:bg-gray-50")}>
              <Image size={13} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <a href={`${apiBase}/pdf`} className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
              <Download size={11} />PDF
            </a>
            <a href={`${apiBase}/vcf`} className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
              <Download size={11} />VCF
            </a>
            <a href={`${apiBase}/csv`} className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
              <Download size={11} />CSV
            </a>
          </div>
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No contacts in this share.</div>
      ) : view === "photos" ? (
        /* Photos grid */
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {contacts.map((c) => {
            const inits = initials(c.firstName, c.lastName)
            return (
              <div key={c.id} className="group flex flex-col rounded-xl overflow-hidden bg-white border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all">
                <div className="aspect-square w-full relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoSrc(c.photoUrl)!} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-gray-400 text-xl">{inits}</div>
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{c.firstName} {c.lastName}</p>
                  {c.company && <p className="text-[10px] text-gray-400 truncate mt-0.5 leading-tight">{c.company}</p>}
                </div>
              </div>
            )
          })}
        </div>
      ) : view === "grid" ? (
        /* Card grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {contacts.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
              <div className="flex items-center gap-2.5 mb-2">
                <Avatar contact={c} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.firstName} {c.lastName}</p>
                  {c.position && <p className="text-xs text-gray-500 truncate">{c.position}</p>}
                </div>
              </div>
              {c.company && <p className="text-xs text-gray-600 truncate mb-0.5">{c.company}</p>}
              {c.country && <p className="text-xs text-gray-400">{c.country}</p>}
              {c.commonConnections != null && c.commonConnections > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  <Users size={10} className="text-blue-500" />
                  <span className="text-xs text-blue-600 font-medium">{c.commonConnections} mutual</span>
                </div>
              )}
              {level >= 2 && c.emailAddress && (
                <a href={`mailto:${c.emailAddress}`} className="flex items-center gap-1 mt-1.5 text-xs text-blue-600 hover:underline truncate">
                  <Mail size={10} />{c.emailAddress}
                </a>
              )}
              {level >= 2 && c.phoneNumber && (
                <a href={`tel:${c.phoneNumber}`} className="flex items-center gap-1 text-xs text-gray-600 truncate">
                  <Phone size={10} />{c.phoneNumber}
                </a>
              )}
              {c.profileUrl && (
                <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 mt-1 text-xs text-sky-600 hover:underline">
                  <ExternalLink size={10} />LinkedIn
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* List view */
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              <Avatar contact={c} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">{c.firstName} {c.lastName}</span>
                  {c.commonConnections != null && c.commonConnections > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                      <Users size={10} />{c.commonConnections} mutual
                    </span>
                  )}
                  {c.profileUrl && (
                    <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-sky-500 hover:text-sky-700">
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {[c.position, c.company].filter(Boolean).join(" at ")}
                  {c.country && <span className="text-gray-400"> · {c.country}</span>}
                </p>
                {level >= 2 && (c.emailAddress || c.phoneNumber) && (
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {c.emailAddress && (
                      <a href={`mailto:${c.emailAddress}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <Mail size={10} />{c.emailAddress}
                      </a>
                    )}
                    {c.phoneNumber && (
                      <a href={`tel:${c.phoneNumber}`} className="flex items-center gap-1 text-xs text-gray-600 hover:underline">
                        <Phone size={10} />{c.phoneNumber}
                      </a>
                    )}
                  </div>
                )}
                {level >= 3 && (
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {c.interactionScore != null && (
                      <ScoreBar score={c.interactionScore} maxScore={maxScore} />
                    )}
                    {c.lastInteractionAt && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock size={10} />Last: {formatDate(c.lastInteractionAt)}
                      </span>
                    )}
                    {c.lastWaAt && <span className="text-xs text-gray-400">WA {formatDate(c.lastWaAt)}</span>}
                    {c.lastLiAt && <span className="text-xs text-gray-400">LI {formatDate(c.lastLiAt)}</span>}
                    {c.lastEmailAt && <span className="text-xs text-gray-400">✉ {formatDate(c.lastEmailAt)}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-gray-300 mt-8">Shared via 6Degrees · 6degrees.app</p>
    </div>
  )
}
