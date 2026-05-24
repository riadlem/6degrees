"use client"

import { createContext, useContext, useEffect, useState } from "react"

type Ctx = { blurred: boolean; toggle: () => void }

const PrivacyContext = createContext<Ctx>({ blurred: false, toggle: () => {} })

const STORAGE_KEY = "6d_privacy_blur"

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [blurred, setBlurred] = useState(false)

  // Hydrate from localStorage after mount (avoid SSR mismatch)
  useEffect(() => {
    try {
      setBlurred(localStorage.getItem(STORAGE_KEY) === "1")
    } catch {}
  }, [])

  function toggle() {
    setBlurred((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0") } catch {}
      return next
    })
  }

  return (
    <PrivacyContext.Provider value={{ blurred, toggle }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  return useContext(PrivacyContext)
}
