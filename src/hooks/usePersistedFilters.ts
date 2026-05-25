"use client"

import { useState, useEffect } from "react"
import type { FilterState } from "@/components/ContactFilters"

const STORAGE_KEY = "6d_contacts_filters"
const STORAGE_VERSION = 1

const DEFAULT_FILTERS: FilterState = {
  q: "",
  companies: [],
  industry: "",
  location: "",
  position: "",
  label: "",
  sort: "name",
  preferredCompanies: false,
  sector: "",
  companyType: "",
  gmailMatched: "",
  country: "",
}

type PersistedFilters = FilterState & { _v: number }

function loadFilters(): FilterState {
  if (typeof window === "undefined") return DEFAULT_FILTERS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_FILTERS
    const parsed: PersistedFilters = JSON.parse(raw)
    if (parsed._v !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      return DEFAULT_FILTERS
    }
    // Always reset search text — better UX to start fresh on reload.
    return { ...DEFAULT_FILTERS, ...parsed, q: "" }
  } catch {
    return DEFAULT_FILTERS
  }
}

function saveFilters(filters: FilterState): void {
  if (typeof window === "undefined") return
  try {
    // Don't persist q (search text) — it should always start empty.
    const toSave: PersistedFilters = { ...filters, q: "", _v: STORAGE_VERSION }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {
    // localStorage might be blocked in private mode — ignore.
  }
}

/**
 * useState for FilterState that:
 * 1. Starts with DEFAULT_FILTERS (avoids SSR mismatch).
 * 2. Hydrates from localStorage after mount.
 * 3. Saves to localStorage on every change (excluding search text `q`).
 */
export function usePersistedFilters(): [FilterState, (partial: Partial<FilterState>) => void, () => void] {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)

  // Hydrate from localStorage after first client render.
  useEffect(() => {
    const saved = loadFilters()
    setFilters(saved)
  }, [])

  function updateFilters(partial: Partial<FilterState>) {
    setFilters((prev) => {
      const next = { ...prev, ...partial }
      saveFilters(next)
      return next
    })
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS)
    saveFilters(DEFAULT_FILTERS)
  }

  return [filters, updateFilters, resetFilters]
}
