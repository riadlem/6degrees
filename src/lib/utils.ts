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
