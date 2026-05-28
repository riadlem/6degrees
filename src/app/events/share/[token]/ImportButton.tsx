"use client"

import { useSession } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Download, CheckCircle } from "lucide-react"

export default function ImportButton({ token }: { token: string }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)

  if (status === "loading") return null
  if (!session) {
    return (
      <a
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
      >
        Get 6Degrees — rate speakers and track connections
      </a>
    )
  }

  if (result) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
        <CheckCircle size={16} className="shrink-0" />
        Imported {result.imported} speaker{result.imported !== 1 ? "s" : ""}
        {result.skipped > 0 ? ` · ${result.skipped} already in your list` : ""}.
        Redirecting…
      </div>
    )
  }

  async function handleImport() {
    setImporting(true)
    try {
      const res = await fetch(`/api/events/share/${token}/import`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
        setTimeout(() => router.push("/events"), 2500)
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <button
      onClick={handleImport}
      disabled={importing}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
    >
      {importing ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      {importing ? "Importing…" : "Copy speakers to my account"}
    </button>
  )
}
