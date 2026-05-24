"use client"

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { SyncProvider } from "@/contexts/SyncContext"
import { PrivacyProvider } from "@/contexts/PrivacyContext"

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <SyncProvider>
        <PrivacyProvider>{children}</PrivacyProvider>
      </SyncProvider>
    </NextAuthSessionProvider>
  )
}
