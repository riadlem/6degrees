"use client"

import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, List, LogOut, ChevronDown, Settings, Puzzle, Building2, LayoutDashboard, RefreshCcw, Eye, EyeOff, CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useSyncContext } from "@/contexts/SyncContext"
import { usePrivacy } from "@/contexts/PrivacyContext"

// WhatsApp icon inline (avoids an extra icon package dependency)
function WANavIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  )
}

// LinkedIn "in" square icon inline
function LiNavIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

const navLinks = [
  { href: "/dashboard",   label: "Dashboard",  icon: LayoutDashboard },
  { href: "/contacts",    label: "Contacts",   icon: Users },
  { href: "/companies",   label: "Companies",  icon: Building2 },
  { href: "/lists",       label: "Lists",      icon: List },
  { href: "/reconnect",   label: "Reconnect",  icon: RefreshCcw },
  { href: "/events",      label: "Events",     icon: CalendarDays },
  { href: "/messages",    label: "Messages",   icon: null, waIcon: true },
]

// Subset shown on mobile bottom tab bar (most-used pages)
const mobileNavLinks = [
  { href: "/contacts",    label: "Contacts",   icon: Users },
  { href: "/companies",   label: "Companies",  icon: Building2 },
  { href: "/lists",       label: "Lists",      icon: List },
  { href: "/reconnect",   label: "Reconnect",  icon: RefreshCcw },
  { href: "/messages",    label: "Messages",   icon: null, waIcon: true },
]

function formatParis(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const g = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "00"
  return `${g("day")}${g("month")}:${g("hour")}${g("minute")}`
}

export default function Navbar() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const { syncState } = useSyncContext()
  const { blurred, toggle: toggleBlur } = usePrivacy()

  if (!session) return null

  const avatarUrl = session.user?.image
  const name = session.user?.name ?? "User"
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const syncPct =
    syncState.phase === "syncing"
      ? Math.round((syncState.synced / syncState.total) * 100)
      : null

  const syncLabel =
    syncState.phase === "connecting" ? "Connecting…" :
    syncState.phase === "fetching" ? (syncState.total ? `Syncing ${syncState.total} contacts…` : "Fetching…") :
    syncState.phase === "syncing" ? `Syncing ${syncState.synced} / ${syncState.total}` :
    null

  const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE
  const syncTimestamp = buildDate ? formatParis(new Date(buildDate)) : null

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 h-14">
      <div className="max-w-7xl mx-auto px-4 h-full flex items-center gap-6">
        {/* Logo */}
        <Link href="/contacts" className="flex items-center gap-2 shrink-0">
          <span className="text-xl font-bold text-blue-600">6°</span>
          <span className="font-semibold text-gray-900 hidden sm:block">Degrees</span>
        </Link>

        {/* Nav links — desktop only */}
        <div className="hidden sm:flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon, waIcon }) => {
            const isMessages = href === "/messages"
            const active = isMessages
              ? pathname.startsWith("/messages") || pathname.startsWith("/whatsapp") || pathname.startsWith("/linkedin-dm") || pathname.startsWith("/email")
              : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? isMessages ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                {waIcon ? <WANavIcon size={15} /> : Icon ? <Icon size={15} /> : null}
                {label}
              </Link>
            )
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Sync indicator — desktop only while running */}
        {syncLabel && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-pulse" />
            {syncLabel}
            {syncPct != null && <span className="font-semibold">{syncPct}%</span>}
          </div>
        )}

        {/* Network + last-sync pill — visible on all screen sizes */}
        {!syncLabel && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            {/* Network name — desktop only */}
            <span className="hidden sm:inline font-medium text-gray-700">{name.split(" ")[0]}&apos;s network</span>
            {/* Timestamp — always shown when available; on mobile it's the only text */}
            {syncTimestamp
              ? <span className="font-mono text-[10px] text-gray-400 tracking-tight">{syncTimestamp}</span>
              : <span className="sm:hidden font-medium text-gray-600">{name.split(" ")[0]}</span>
            }
          </div>
        )}

        {/* Privacy blur toggle */}
        <button
          onClick={toggleBlur}
          title={blurred ? "Privacy mode ON — names, photos and emails are blurred. Click to show." : "Privacy mode OFF — click to blur names, photos and emails."}
          className={cn(
            "flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0",
            blurred
              ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
              : "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          )}
        >
          {blurred ? <EyeOff size={14} /> : <Eye size={14} />}
          <span className="hidden sm:inline">{blurred ? "Blurred" : "Privacy"}</span>
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-full hover:bg-gray-50 pr-2 pl-0.5 py-0.5 transition-colors"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                {initials}
              </span>
            )}
            <ChevronDown size={14} className="text-gray-500" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                  <p className="text-xs text-gray-500 truncate">{session.user?.email}</p>
                </div>
                <Link
                  href="/extension"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Puzzle size={14} />
                  Chrome Extension
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings size={14} />
                  Settings
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sync progress strip at bottom of navbar */}
      {(syncState.phase === "fetching" || syncState.phase === "syncing" || syncState.phase === "connecting") && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-100">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: syncPct != null ? `${syncPct}%` : "15%" }}
          />
        </div>
      )}
    </nav>

    {/* Bottom tab bar — mobile only (5 key pages) */}
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex h-16 safe-area-inset-bottom">
      {mobileNavLinks.map(({ href, label, icon: Icon, waIcon }) => {
        const isMessages = href === "/whatsapp"
        const active = isMessages
          ? pathname.startsWith("/whatsapp") || pathname.startsWith("/linkedin-dm")
          : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-w-0 transition-colors",
              active
                ? isMessages ? "text-green-600" : "text-blue-600"
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            {waIcon
              ? <WANavIcon size={20} />
              : Icon ? <Icon size={20} strokeWidth={active ? 2.5 : 1.8} /> : null
            }
            <span className="text-[10px] font-medium leading-none truncate w-full text-center px-0.5">
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
    </>
  )
}
