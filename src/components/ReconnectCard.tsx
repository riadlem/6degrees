"use client"

import { Mail, Clock, ExternalLink, Check, MoreHorizontal, Ban, AlarmClock, Timer } from "lucide-react"
import { cn, initials, formatDate, photoSrc } from "@/lib/utils"

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

export const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  lkd_pending:    { label: "Invite to LinkedIn", className: "bg-sky-50 text-sky-700" },
  not_contacted:  { label: "Not contacted",       className: "bg-gray-100 text-gray-600" },
  drafted:        { label: "Drafted",             className: "bg-blue-50 text-blue-700" },
  sent:           { label: "Sent",                className: "bg-amber-50 text-amber-700" },
  responded:      { label: "Responded",           className: "bg-green-50 text-green-700" },
  meeting_booked: { label: "Meeting booked",      className: "bg-purple-50 text-purple-700" },
  meeting_done:   { label: "Meeting done",        className: "bg-emerald-50 text-emerald-700" },
  deprioritized:  { label: "Deprioritized",       className: "bg-gray-100 text-gray-400" },
}

type Props = {
  contact: ReconnectContact
  isLapsed: boolean
  scoreWidth: number
  blurred: boolean
  moreOpen: boolean
  onOpen: () => void
  onMoreToggle: () => void
  onCloseMore: () => void
  onSnooze: (days: number) => void
  onDeprioritize: () => void
  onBlock: () => void
  onDraft: () => void
  onUpdateStatus: (status: string) => void
  onMarkInvitationSent: () => void
}

export default function ReconnectCard({
  contact,
  isLapsed,
  scoreWidth,
  blurred,
  moreOpen,
  onOpen,
  onMoreToggle,
  onCloseMore,
  onSnooze,
  onDeprioritize,
  onBlock,
  onDraft,
  onUpdateStatus,
  onMarkInvitationSent,
}: Props) {
  const inits = initials(contact.firstName, contact.lastName)
  const statusInfo = STATUS_LABELS[contact.outreachStatus ?? "not_contacted"] ?? STATUS_LABELS.not_contacted
  const isDeprioritized = contact.outreachStatus === "deprioritized"

  return (
    <div
      className={cn(
        "bg-white border rounded-xl px-4 py-3 flex items-center gap-4 hover:border-gray-300 transition-colors group",
        isDeprioritized ? "border-gray-100 opacity-60" : "border-gray-200",
      )}
    >
      {/* Avatar */}
      <button onClick={onOpen} className="shrink-0">
        {contact.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc(contact.photoUrl)!} alt="" className={cn("w-10 h-10 rounded-xl object-cover", blurred && "blur")} />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold">
            {inits}
          </div>
        )}
      </button>

      {/* Info */}
      <button className="flex-1 min-w-0 text-left" onClick={onOpen}>
        <p className={cn("font-medium text-gray-900 truncate", blurred && "blur-sm select-none")}>
          {contact.firstName} {contact.lastName}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {[contact.position, contact.company].filter(Boolean).join(" at ")}
        </p>

        {/* Score bar + last contact */}
        <div className="flex items-center gap-2 mt-1.5">
          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full", isLapsed ? "bg-amber-400" : "bg-blue-400")}
              style={{ width: `${scoreWidth}%` }}
            />
          </div>
          {contact.lastInteractionAt && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock size={10} />
              Last contact {formatDate(contact.lastInteractionAt)}
            </span>
          )}
          {/* Label color dots */}
          {contact.labels && contact.labels.length > 0 && (
            <span className="flex items-center gap-0.5">
              {contact.labels.slice(0, 4).map(({ label }) => (
                <span
                  key={label.id}
                  title={label.name}
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: label.color }}
                />
              ))}
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
              className="hidden sm:flex items-center gap-1.5 text-xs text-sky-600 border border-sky-200 rounded-lg px-2.5 py-1.5 hover:bg-sky-50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
            >
              <ExternalLink size={11} />
              Search LinkedIn
            </a>
            <button
              onClick={(e) => { e.stopPropagation(); onMarkInvitationSent() }}
              className="hidden sm:flex items-center gap-1.5 text-xs text-green-600 border border-green-200 rounded-lg px-2.5 py-1.5 hover:bg-green-50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Check size={11} />
              Invitation sent
            </button>
          </>
        ) : (
          <>
            {contact.emailAddress && (
              <button
                onClick={(e) => { e.stopPropagation(); onDraft() }}
                className="hidden sm:flex items-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Mail size={11} />
                Draft email
              </button>
            )}
            <select
              value={contact.outreachStatus ?? "not_contacted"}
              onChange={(e) => { e.stopPropagation(); onUpdateStatus(e.target.value) }}
              onClick={(e) => e.stopPropagation()}
              className="hidden sm:block text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-600 sm:opacity-0 sm:group-hover:opacity-100"
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

        {/* ··· more actions — always visible on mobile, hover-only on desktop */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); onMoreToggle() }}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
          >
            <MoreHorizontal size={14} />
          </button>

          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={onCloseMore} />
              <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                <button
                  onClick={(e) => { e.stopPropagation(); onSnooze(7) }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <AlarmClock size={13} className="text-gray-400" />
                  Remind in 7 days
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onSnooze(15) }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Timer size={13} className="text-gray-400" />
                  Remind in 15 days
                </button>
                <div className="h-px bg-gray-100 my-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); onDeprioritize() }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <Clock size={13} className="text-gray-400" />
                  Ignore for 3 months
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onBlock() }}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Ban size={13} />
                  Ignore forever
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
