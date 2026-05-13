import type { Metadata } from "next"
import "./globals.css"
import { SessionProvider } from "./providers"
import Navbar from "@/components/Navbar"

export const metadata: Metadata = {
  title: "6Degrees — LinkedIn Network Navigator",
  description: "Navigate and organise your LinkedIn network",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <SessionProvider>
          <Navbar />
          <main className="pt-14">{children}</main>
        </SessionProvider>
      </body>
    </html>
  )
}
