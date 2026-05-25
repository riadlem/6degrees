// Shared status badge config — used in ContactCard, ContactRow, and company page.
// null and "not_contacted" are intentionally excluded: null means no status,
// "not_contacted" is handled separately as a bookmark pin.

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  not_contacted:  { label: "Pinned",          className: "bg-gray-100 text-gray-500 border-gray-200" },
  lkd_pending:    { label: "LinkedIn invite",  className: "bg-sky-50 text-sky-700 border-sky-200" },
  drafted:        { label: "Drafted",          className: "bg-blue-50 text-blue-700 border-blue-200" },
  sent:           { label: "Sent",             className: "bg-amber-50 text-amber-700 border-amber-200" },
  responded:      { label: "Responded",        className: "bg-green-50 text-green-700 border-green-200" },
  meeting_booked: { label: "Meeting booked",   className: "bg-purple-50 text-purple-700 border-purple-200" },
  meeting_done:   { label: "Meeting done",     className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  deprioritized:  { label: "Deprioritized",    className: "bg-gray-100 text-gray-400 border-gray-200" },
  ignored:        { label: "Ignored",          className: "bg-red-50 text-red-400 border-red-200" },
  pending_review: { label: "To review",        className: "bg-violet-50 text-violet-700 border-violet-200" },
}
