"use client"

import { useState } from "react"
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { SyncProvider } from "@/contexts/SyncContext"
import { PrivacyProvider } from "@/contexts/PrivacyContext"
import { makeQueryClient, PERSIST_KEYS, CACHE_BUSTER } from "@/lib/query-client"
import { idbPersister } from "@/lib/idb-persister"

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // useState ensures each server render gets its own QueryClient (no cross-request contamination).
  // On the client this mounts once; the same instance survives the full browser session.
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: idbPersister,
        // Cache version — bump CACHE_BUSTER in query-client.ts when data shapes change.
        // This causes the entire persisted cache to be discarded on the next load.
        buster: CACHE_BUSTER,
        // Only persist queries for stable, large datasets — not ephemeral UI state.
        // Queries whose first key element is in PERSIST_KEYS get written to IDB.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0]
            return typeof key === "string" && PERSIST_KEYS.has(key)
          },
        },
        // Maximum age of the persisted cache before it's treated as stale on restore.
        // Matches the longest staleTime we use (7 days for contacts/companies).
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }}
    >
      <NextAuthSessionProvider>
        <SyncProvider>
          <PrivacyProvider>{children}</PrivacyProvider>
        </SyncProvider>
      </NextAuthSessionProvider>
      {/* Dev-only inspector panel — tree-shaken in production */}
      <ReactQueryDevtools initialIsOpen={false} />
    </PersistQueryClientProvider>
  )
}
