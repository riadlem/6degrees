"use client"

import { createContext, useContext, useEffect, useState } from "react"

export type Brand = "6degrees" | "aequus"

type Ctx = { brand: Brand; setBrand: (b: Brand) => void }

const BrandContext = createContext<Ctx>({ brand: "6degrees", setBrand: () => {} })

const STORAGE_KEY = "6d_brand"

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrandState] = useState<Brand>("6degrees")

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "aequus") setBrandState("aequus")
    } catch {}
  }, [])

  function setBrand(b: Brand) {
    setBrandState(b)
    try { localStorage.setItem(STORAGE_KEY, b) } catch {}
  }

  return (
    <BrandContext.Provider value={{ brand, setBrand }}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand() {
  return useContext(BrandContext)
}
