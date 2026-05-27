"use client"

import { useQuery } from "@tanstack/react-query"
import { STALE } from "@/lib/query-client"
import type { IndexEntry } from "@/lib/contact-search"

/**
 * useContactsIndex — loads the lightweight contacts index for offline autocomplete.
 *
 * The result is persisted to IndexedDB (key: "contacts-index") so subsequent
 * page loads return data instantly without a network round-trip.
 * Stale time matches the main contacts query (7 days).
 */
export function useContactsIndex(): IndexEntry[] {
  const { data = [] } = useQuery<IndexEntry[]>({
    queryKey: ["contacts-index"],
    queryFn: () =>
      fetch("/api/contacts/index").then((r) => {
        if (!r.ok) throw new Error("Failed to fetch contacts index")
        return r.json()
      }),
    staleTime: STALE.contacts,
  })
  return data
}
