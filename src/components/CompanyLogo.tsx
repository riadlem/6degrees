"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

function nameToInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Deterministic color per company name
const GRADIENTS = [
  ["#6366f1", "#4f46e5"], // indigo
  ["#8b5cf6", "#7c3aed"], // violet
  ["#0ea5e9", "#0284c7"], // sky
  ["#14b8a6", "#0d9488"], // teal
  ["#10b981", "#059669"], // emerald
  ["#f59e0b", "#d97706"], // amber
  ["#ef4444", "#dc2626"], // red
  ["#ec4899", "#db2777"], // pink
  ["#f97316", "#ea580c"], // orange
  ["#64748b", "#475569"], // slate
]

function nameToGradient(name: string): [string, string] {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff
  return (GRADIENTS[Math.abs(h) % GRADIENTS.length] ?? GRADIENTS[0]) as [string, string]
}

interface Props {
  /** Primary domain, e.g. "salesforce.com" */
  domain?: string | null
  /** Company name — used for initials fallback and colour */
  name: string
  /** Size in px (width = height), default 40 */
  size?: number
  /** Tailwind rounded-* class, default "rounded-xl" */
  radius?: string
  className?: string
}

export default function CompanyLogo({ domain, name, size = 40, radius = "rounded-xl", className }: Props) {
  const [failed, setFailed] = useState(false)
  const inits = nameToInitials(name)
  const [c1, c2] = nameToGradient(name)

  return (
    <div
      className={cn("shrink-0 overflow-hidden border border-gray-100", radius, className)}
      style={{ width: size, height: size }}
    >
      {domain && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt={name}
          width={size}
          height={size}
          className="w-full h-full object-contain bg-white p-[1px]"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-white font-bold select-none"
          style={{
            background: `linear-gradient(135deg, ${c1}, ${c2})`,
            fontSize: `${Math.round(size / 2.6)}px`,
          }}
        >
          {inits}
        </div>
      )}
    </div>
  )
}

/** Extract a company domain from a work email address, ignoring personal domains. */
const PERSONAL_DOMAINS = new Set([
  "gmail.com","yahoo.com","hotmail.com","outlook.com","icloud.com",
  "me.com","mac.com","live.com","msn.com","aol.com","protonmail.com",
  "googlemail.com","yahoo.fr","yahoo.co.uk","hotmail.fr","wanadoo.fr","orange.fr",
])

export function domainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.indexOf("@")
  if (at === -1) return null
  const d = email.slice(at + 1).toLowerCase()
  return PERSONAL_DOMAINS.has(d) ? null : d
}
