"use client"

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react"
import { SyncProvider } from "@/contexts/SyncContext"

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <SyncProvider>{children}</SyncProvider>
    </NextAuthSessionProvider>
  )
}
