"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ExtensionHistoryRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/reconnect") }, [router])
  return null
}
