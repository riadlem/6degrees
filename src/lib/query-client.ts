import { QueryClient } from "@tanstack/react-query"

/**
 * Factory that creates a fresh QueryClient with sensible defaults for 6degrees.
 *
 * Called inside a useState() in the providers component so each server render
 * gets its own instance (prevents cache sharing between requests in SSR).
 * On the client the component only mounts once, so the same QueryClient
 * survives for the full browser session.
 *
 * Defaults:
 * - staleTime 2 min  — contacts don't change by the second; avoid redundant fetches on tab focus
 * - gcTime 10 min    — keep cached data in memory for 10 min after all subscribers unmount
 * - refetchOnWindowFocus false — avoids surprise network traffic when user switches apps on mobile
 * - retry 1          — one automatic retry on transient errors
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,       // 2 minutes
        gcTime: 10 * 60 * 1000,         // 10 minutes
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}
