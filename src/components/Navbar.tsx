"use client"

import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, List, LogOut, ChevronDown, Settings, Puzzle, Sparkles, Building2, LayoutDashboard, RefreshCcw, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useSyncContext } from "@/contexts/SyncContext"
import { usePrivacy } from "@/contexts/PrivacyContext"

const navLinks = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/contacts",   label: "Contacts",   icon: Users },
  { href: "/companies",  label: "Companies",  icon: Building2 },
  { href: "/lists",      label: "Lists",      icon: List },
  { href: "/reconnect",  label: "Reconnect",  icon: RefreshCcw },
  { href: "/enrich",     label: "Enrich",     icon: Sparkles },
]

// 5 items for the mobile bottom tab bar — Enrich moved inside Reconnect on mobile
const mobileNavLinks = navLinks.filter((l) => l.href !== "/enrich")

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
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                pathname.startsWith(href)
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
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

    {/* Bottom tab bar — mobile only */}
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex h-16 safe-area-inset-bottom">
      {mobileNavLinks.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-w-0 transition-colors",
              active ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
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
