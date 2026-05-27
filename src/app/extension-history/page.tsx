"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Navbar from "@/components/Navbar"
import { ExternalLink, Chrome } from "lucide-react"

type ExtContact = {
  id: string
  firstName: string
  lastName: string
  company: string | null
  position: string | null
  city: string | null
  country: string | null
  location: string | null
  photoUrl: string | null
  profileUrl: string | null
  extensionSyncedAt: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function locationStr(c: ExtContact): string {
  const parts = [c.city, c.country].filter(Boolean)
  if (parts.length) return parts.join(", ")
  return c.location ?? ""
}

function Avatar({ contact }: { contact: ExtContact }) {
  const initials = ((contact.firstName?.[0] ?? "") + (contact.lastName?.[0] ?? "")).toUpperCase() || "?"
  if (contact.photoUrl) {
    return (
      <img
        src={contact.photoUrl}
        alt={`${contact.firstName} ${contact.lastName}`}
        className="w-9 h-9 rounded-full object-cover shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
      />
    )
  }
  return (
    <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-semibold shrink-0">
      {initials}
    </div>
  )
}

export default function ExtensionHistoryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [contacts, setContacts] = useState<ExtContact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

  const PAGE_SIZE = 50

  const load = useCallback(async (p: number, replace = false) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/extension/history?page=${p}`)
      if (!res.ok) return
      const data = await res.json()
      setContacts(prev => replace ? data.contacts : [...prev, ...data.contacts])
      setTotal(data.total)
      setPage(p)
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/"); return }
    if (status === "authenticated") load(0, true)
  }, [status, load, router])

  const hasMore = contacts.length < total

  if (status === "loading" || (initialLoad && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
            <Chrome size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Extension History</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {total.toLocaleString()} profile{total !== 1 ? "s" : ""} saved via the Chrome extension
            </p>
          </div>
        </div>

        {/* Table */}
        {contacts.length === 0 && !loading ? (
          <div className="text-center py-16 text-sm text-gray-400">
            No profiles saved yet. Install the Chrome extension and visit LinkedIn profiles to get started.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[40px_2fr_2fr_2fr_2fr_1.5fr] gap-x-4 px-4 py-2 border-b border-gray-100 bg-gray-50">
              <div />
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Name</div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Company</div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Role</div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Location</div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide text-right">Saved</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[40px_2fr_2fr_2fr_2fr_1.5fr] gap-x-4 items-center px-4 py-3 hover:bg-gray-50 cursor-pointer group"
                  onClick={() => router.push(`/contacts/${c.id}`)}
                >
                  {/* Avatar */}
                  <Avatar contact={c} />

                  {/* Name */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {c.firstName} {c.lastName}
                    </span>
                    {c.profileUrl && (
                      <a
                        href={c.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-blue-500 shrink-0"
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>

                  {/* Company */}
                  <div className="text-sm text-gray-700 truncate">{c.company ?? <span className="text-gray-300">—</span>}</div>

                  {/* Role */}
                  <div className="text-sm text-gray-600 truncate">{c.position ?? <span className="text-gray-300">—</span>}</div>

                  {/* Location */}
                  <div className="text-sm text-gray-500 truncate">{locationStr(c) || <span className="text-gray-300">—</span>}</div>

                  {/* Saved at */}
                  <div className="text-xs text-gray-400 text-right whitespace-nowrap">{formatDate(c.extensionSyncedAt)}</div>
                </div>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="px-4 py-3 border-t border-gray-100 text-center">
                <button
                  onClick={() => load(page + 1)}
                  disabled={loading}
                  className="text-sm text-violet-600 hover:text-violet-700 font-medium disabled:opacity-40"
                >
                  {loading ? "Loading…" : `Load more (${total - contacts.length} remaining)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
