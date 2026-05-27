/**
 * IndexedDB persister for React Query.
 *
 * Uses `idb-keyval` (tiny, promise-based IDB wrapper) to persist the React
 * Query cache between page loads.  This means contacts, companies, labels,
 * and dashboard stats load INSTANTLY from IDB while a background revalidation
 * happens only when data is older than its staleTime.
 *
 * Cache version: bump CACHE_BUSTER when the shape of cached data changes
 * (e.g. after a schema migration that adds new fields) so old entries are
 * automatically discarded rather than causing type errors.
 */

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { get, set, del } from "idb-keyval"

const STORE_KEY = "6d-rq-cache-v1"

// Bump this string whenever cached data shapes change incompatibly.
export const CACHE_BUSTER = "v4"  // bump when Contact model adds/removes fields

/** IDB-backed async storage adapter for @tanstack/query-async-storage-persister */
const idbStorage = {
  getItem:    (key: string) => get<string>(key),
  setItem:    (key: string, value: string) => set(key, value),
  removeItem: (key: string) => del(key),
}

export const idbPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key:     STORE_KEY,
  // Throttle IDB writes — don't write on every query update, only when the
  // cache hasn't been flushed in the last 1 second.
  throttleTime: 1000,
})
