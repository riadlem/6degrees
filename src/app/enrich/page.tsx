"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Sparkles } from "lucide-react"
import EnrichContent from "@/components/EnrichContent"

export default function EnrichPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} className="text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Enrich</h1>
        </div>
        <p className="text-sm text-gray-500">Contacts that need LinkedIn data enrichment.</p>
      </div>
      <EnrichContent />
    </div>
  )
}
