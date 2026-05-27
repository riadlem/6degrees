import { QueryClient } from "@tanstack/react-query"

/**
 * Stale-time constants — contact/company data changes rarely (imports, manual
 * edits, extension saves).  We use long stale times so the UI loads instantly
 * from the IDB-persisted cache and only revalidates when truly needed.
 *
 * Invalidation is surgical (by queryKey) after each mutation, so stale data
 * is never shown for the affected resource — only un-mutated data stays cached.
 */
export const STALE = {
  /** Contacts list & detail — only change via sync / manual edit / extension save */
  contacts:  7 * 24 * 60 * 60 * 1000,   // 7 days
  /** Companies & labels — very stable */
  companies: 7 * 24 * 60 * 60 * 1000,   // 7 days
  labels:    7 * 24 * 60 * 60 * 1000,   // 7 days
  /** Dashboard / treemap stats — refresh once a day is plenty */
  dashboard: 24 * 60 * 60 * 1000,       // 24 hours
  /** Transient / frequently-updated UI data — keep short */
  short:      5 * 60 * 1000,            // 5 minutes
} as const

/**
 * IDB-persisted query keys — first element of the queryKey array for queries
 * whose results should survive page closes and reload from IndexedDB.
 */
/** Bump this when Contact/Company data shapes change incompatibly — forces IDB cache eviction. */
export const CACHE_BUSTER = "v4"

export const PERSIST_KEYS = new Set([
  "contacts",
  "contact",
  "companies",
  "labels",
  "dashboard",
  "treemap",
])

/**
 * Factory that creates a fresh QueryClient.  Called inside useState() in
 * Providers so each SSR render gets its own instance (no cache cross-talk).
 * On the client it mounts once and the same instance survives the session.
 *
 * Defaults apply to every query that doesn't set its own staleTime.
 * Long-lived queries (contacts, companies, etc.) override with STALE.contacts.
 * Data is persisted to IndexedDB via PersistQueryClientProvider in Providers.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Default: 5 min for anything not explicitly setting staleTime.
        // Long-lived data (contacts, companies) sets STALE.contacts = 7 days.
        staleTime:            5 * 60 * 1000,
        // Keep unused entries in memory for 24 h — IDB covers the rest
        gcTime:              24 * 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount:       false,
        retry:                1,
      },
    },
  })
}
