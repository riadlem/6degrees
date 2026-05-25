import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/**
 * Strip leading and trailing emoji characters (including skin-tone modifiers,
 * variation selectors, and ZWJ joiners) from a name string.
 * e.g. "🌟 John Smith 🎉" → "John Smith"
 */
export function stripEdgeEmoji(s: string): string {
  if (!s) return s
  // Strip leading emoji block (emoji + any attached modifiers/joiners) + optional spaces
  let result = s.replace(
    /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE0F}\u{FE0E}\u{200D}\u{1F3FB}-\u{1F3FF}]+\s*/gu,
    ""
  )
  // Strip trailing emoji block
  result = result.replace(
    /\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{FE0F}\u{FE0E}\u{200D}\u{1F3FB}-\u{1F3FF}]+$/gu,
    ""
  )
  return result.trim()
}
