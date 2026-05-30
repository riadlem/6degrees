import type { Metadata } from "next"
import "./globals.css"
import { SessionProvider } from "./providers"
import Navbar from "@/components/Navbar"
import { GmailSyncProvider } from "@/contexts/GmailSyncContext"
import { BrandProvider } from "@/contexts/BrandContext"

export const metadata: Metadata = {
  title: "6Degrees — LinkedIn Network Navigator",
  description: "Navigate and organise your LinkedIn network",
  manifest: "/manifest.json",
}

function BuildStamp() {
  const raw = process.env.NEXT_PUBLIC_BUILD_DATE ?? ""
  const hash = process.env.NEXT_PUBLIC_BUILD_HASH ?? ""
  if (!raw) return null
  const date = new Date(raw)
  const label = isNaN(date.getTime())
    ? raw
    : date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  return (
    <footer className="text-center text-[10px] text-gray-300 py-4 select-none">
      Updated {label}{hash ? ` · ${hash}` : ""}
    </footer>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 overflow-x-hidden">
        <SessionProvider>
          <BrandProvider>
            <GmailSyncProvider>
              <Navbar />
              <main className="pt-14 pb-16 sm:pb-0">{children}</main>
              <BuildStamp />
            </GmailSyncProvider>
          </BrandProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
