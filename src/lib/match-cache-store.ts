/**
 * Server-side in-process singleton for the Gmail match cache.
 *
 * `buildMatchCache` fetches all contacts + emails from the DB and
 * constructs four Maps used for O(1) email→contact lookups during sync.
 * Building it from scratch takes ~200–800 ms on large accounts and is
 * currently re-done on every sync invocation.
 *
 * This module caches the built cache per userId in `globalThis` (the same
 * pattern used by `src/lib/prisma.ts`) so that warm serverless instances
 * and long-running dev servers skip the rebuild.
 *
 * Degradation on cold starts / Vercel: `getCachedMatchCache` returns null
 * and the caller falls back to `buildMatchCache` — identical to today's
 * behaviour. No correctness risk.
 *
 * TTL: 30 minutes.  Explicit invalidation is called whenever contacts are
 * created, updated (name/email change), or deleted, and after LinkedIn sync
 * / import (which adds new contacts that need to be matchable).
 */

import type { MatchCache } from "@/lib/gmail-match"

const MATCH_CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

type CacheEntry = {
  cache: MatchCache
  builtAt: number
  userId: string
}

// Attach to globalThis so the Map survives Next.js hot-module reloads in dev
// and is shared across route handler invocations in the same Node.js process.
const g = globalThis as typeof globalThis & {
  _matchCacheStore?: Map<string, CacheEntry>
}
if (!g._matchCacheStore) {
  g._matchCacheStore = new Map<string, CacheEntry>()
}
const store: Map<string, CacheEntry> = g._matchCacheStore

/** Return the cached MatchCache for this user, or null if missing / stale. */
export function getCachedMatchCache(userId: string): MatchCache | null {
  const entry = store.get(userId)
  if (!entry) return null
  if (Date.now() - entry.builtAt > MATCH_CACHE_TTL_MS) {
    store.delete(userId)
    return null
  }
  return entry.cache
}

/** Store (or replace) the MatchCache for this user, resetting the TTL. */
export function setCachedMatchCache(userId: string, cache: MatchCache): void {
  store.set(userId, { cache, builtAt: Date.now(), userId })
}

/** Evict the cached MatchCache for this user so the next sync rebuilds it fresh. */
export function invalidateMatchCache(userId: string): void {
  store.delete(userId)
}

/** Evict all cached MatchCaches (e.g. on bulk operations). */
export function invalidateAllMatchCaches(): void {
  store.clear()
}
