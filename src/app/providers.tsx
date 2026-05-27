"use client"

import { useState } from "react"
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { SyncProvider } from "@/contexts/SyncContext"
import { PrivacyProvider } from "@/contexts/PrivacyContext"
import { makeQueryClient } from "@/lib/query-client"
import { useLiveContactUpdates } from "@/hooks/useLiveContactUpdates"

/**
 * Mounts the SSE connection that keeps React Query caches in sync with
 * extension writes.  Rendered as a zero-output component so it can sit
 * inside all necessary providers (QueryClient + NextAuth session).
 */
function LiveContactUpdates() {
  useLiveContactUpdates()
  return null
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // useState ensures each server render gets its own QueryClient (no cache cross-contamination).
  // On the client this mounts once and the same instance survives the full browser session.
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <NextAuthSessionProvider>
        <SyncProvider>
          <PrivacyProvider>
            {/* Zero-render component — opens the /api/contacts/live SSE stream */}
            <LiveContactUpdates />
            {children}
          </PrivacyProvider>
        </SyncProvider>
      </NextAuthSessionProvider>
      {/* Dev-only inspector panel — tree-shaken in production */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
