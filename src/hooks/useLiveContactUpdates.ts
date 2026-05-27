"use client"

/**
 * useLiveContactUpdates
 *
 * Opens a persistent SSE connection to /api/contacts/live and keeps React
 * Query's in-memory caches in sync with what the Chrome extension writes to
 * the database — no manual page refresh required.
 *
 * On a `contact_updated` event:
 *   1. Surgically patches every cached "contacts" infinite-query page so the
 *      photo / name / position updates appear immediately in the list view.
 *   2. Invalidates the individual contact detail query so the side-panel
 *      refetches the full, fresh record.
 *
 * On a `contact_created` event:
 *   Invalidates the contacts list so the new card can appear on the next
 *   background refetch.
 *
 * EventSource reconnects automatically after network blips; the server sends a
 * keepalive comment every 25 s so proxies don't time out the connection.
 */

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import type { InfiniteData } from "@tanstack/react-query"

// Minimal shape we care about when patching the list cache
type CachedContact = {
  id: string
  [key: string]: unknown
}

type CachedPage = {
  contacts: CachedContact[]
  [key: string]: unknown
}

type LiveEvent =
  | {
      type: "contact_updated"
      contactId: string
      photoUrl?: string | null
      firstName?: string
      lastName?: string
      headline?: string | null
      position?: string | null
      company?: string | null
      location?: string | null
      city?: string | null
      country?: string | null
      commonConnections?: number | null
    }
  | { type: "contact_created"; contactId: string }
  | { type: "connected" }

export function useLiveContactUpdates() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) return

    const es = new EventSource("/api/contacts/live")

    es.onmessage = (e: MessageEvent<string>) => {
      let event: LiveEvent
      try {
        event = JSON.parse(e.data) as LiveEvent
      } catch {
        return
      }

      if (event.type === "contact_updated") {
        // Pull out just the data fields (no "type", no "contactId")
        const { contactId, type: _type, ...patch } = event

        // ── 1. Patch every cached contacts page in-place ─────────────────────
        // Matches ["contacts", userId, <any filters>, <any segment>]
        queryClient.setQueriesData<InfiniteData<CachedPage>>(
          { queryKey: ["contacts", userId], exact: false },
          (old) => {
            if (!old?.pages) return old
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                contacts: page.contacts.map((c) =>
                  c.id === contactId ? { ...c, ...patch } : c,
                ),
              })),
            }
          },
        )

        // ── 2. Invalidate the open contact-detail panel ───────────────────────
        // Triggers a background refetch; the panel will show the fresh data
        // as soon as it arrives (no loading flash because stale data stays
        // visible until the new response lands).
        queryClient.invalidateQueries({
          queryKey: ["contact", userId, contactId],
        })
      } else if (event.type === "contact_created") {
        // A brand-new contact — let the list refetch so the card appears
        queryClient.invalidateQueries({ queryKey: ["contacts", userId] })
      }
      // "connected" events are informational — nothing to do
    }

    es.onerror = () => {
      // EventSource automatically reconnects after an error; no manual
      // retry logic needed.
    }

    return () => {
      es.close()
    }
  }, [userId, queryClient])
}
