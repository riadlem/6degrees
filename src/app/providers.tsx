"use client"

import { useState } from "react"
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { SyncProvider } from "@/contexts/SyncContext"
import { PrivacyProvider } from "@/contexts/PrivacyContext"
import { makeQueryClient } from "@/lib/query-client"

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // useState ensures each server render gets its own QueryClient (no cache cross-contamination).
  // On the client this mounts once and the same instance survives the full browser session.
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <NextAuthSessionProvider>
        <SyncProvider>
          <PrivacyProvider>{children}</PrivacyProvider>
        </SyncProvider>
      </NextAuthSessionProvider>
      {/* Dev-only inspector panel — tree-shaken in production */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
