"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Database, Settings, Loader2, Palette } from "lucide-react"
import { useBrand } from "@/contexts/BrandContext"

type StatusData = {
  lastAuthError: { code: string; message: string; ts: string } | null
  env: {
    POSTGRES_PRISMA_URL: boolean
    POSTGRES_URL_NON_POOLING: boolean
    DATABASE_URL_preview: string | null
    NEXTAUTH_URL: string | null
    NEXTAUTH_SECRET: boolean
    LINKEDIN_CLIENT_ID: boolean
    LINKEDIN_CLIENT_SECRET: boolean
    ADMIN_KEY: boolean
  }
  db: {
    connected: boolean
    error: string | null
    tables: Record<string, { count: number } | { error: string }>
  }
}

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <CheckCircle size={16} className="text-green-500 shrink-0" />
  if (warn) return <AlertCircle size={16} className="text-amber-500 shrink-0" />
  return <XCircle size={16} className="text-red-500 shrink-0" />
}

function BrandingSection() {
  const { brand, setBrand } = useBrand()
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Palette size={15} className="text-gray-500" />
        <h2 className="font-semibold text-gray-900 text-sm">App Branding</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">Switch the app&apos;s visual identity. Changes are saved locally.</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setBrand("6degrees")}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${brand === "6degrees" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
        >
          <span className="text-2xl font-bold text-blue-600">6°</span>
          <span className="text-sm font-medium text-gray-900">6 Degrees</span>
          <span className="text-xs text-gray-500">Blue theme</span>
        </button>
        <button
          onClick={() => setBrand("aequus")}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${brand === "aequus" ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:border-gray-300"}`}
        >
          <span className="text-2xl font-bold text-teal-600">A°</span>
          <span className="text-sm font-medium text-gray-900">Aequus Money</span>
          <span className="text-xs text-gray-500">Teal theme</span>
        </button>
      </div>
    </section>
  )
}

function AdminContent() {
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(false)
  const [initResult, setInitResult] = useState<{ ok: boolean; message: string } | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/status")
      if (!res.ok) { setError("Failed to load status"); setLoading(false); return }
      setData(await res.json())
    } catch {
      setError("Failed to reach API")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function initDb() {
    setInitializing(true)
    setInitResult(null)
    const res = await fetch("/api/admin/init", { method: "POST" })
    const result = await res.json()
    setInitResult(result)
    setInitializing(false)
    if (result.ok) fetchStatus()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={24} className="animate-spin text-gray-400" />
    </div>
  )

  if (error) return (
    <div className="text-center py-12">
      <XCircle size={40} className="text-red-400 mx-auto mb-3" />
      <p className="text-gray-700 font-medium">{error}</p>
    </div>
  )

  if (!data) return null

  const allTablesOk = Object.values(data.db.tables).every(t => "count" in t)
  const missingTables = Object.entries(data.db.tables).filter(([, v]) => "error" in v).map(([k]) => k)

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Admin · Database Setup</h1>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Last auth error */}
      {data.lastAuthError && (
        <section className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <h2 className="font-semibold text-red-800 text-sm mb-2">Last Sign-in Error · {data.lastAuthError.ts}</h2>
          <p className="text-xs font-mono text-red-700 font-bold mb-1">{data.lastAuthError.code}</p>
          <p className="text-xs font-mono text-red-600 break-all whitespace-pre-wrap">{data.lastAuthError.message}</p>
        </section>
      )}

      {/* Environment Variables */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={15} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900 text-sm">Environment Variables</h2>
        </div>
        <div className="space-y-2.5">
          {[
            { key: "POSTGRES_PRISMA_URL", ok: data.env.POSTGRES_PRISMA_URL, value: data.env.DATABASE_URL_preview },
            { key: "POSTGRES_URL_NON_POOLING", ok: data.env.POSTGRES_URL_NON_POOLING },
            { key: "NEXTAUTH_SECRET", ok: data.env.NEXTAUTH_SECRET },
            { key: "NEXTAUTH_URL", ok: !!data.env.NEXTAUTH_URL, value: data.env.NEXTAUTH_URL },
            { key: "LINKEDIN_CLIENT_ID", ok: data.env.LINKEDIN_CLIENT_ID },
            { key: "LINKEDIN_CLIENT_SECRET", ok: data.env.LINKEDIN_CLIENT_SECRET },
            { key: "ADMIN_KEY", ok: data.env.ADMIN_KEY, warn: true },
          ].map(({ key: k, ok, value, warn }) => (
            <div key={k} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2.5">
                <Dot ok={ok} warn={!ok && warn} />
                <code className="text-xs text-gray-700 font-mono">{k}</code>
                {!ok && !warn && <span className="text-xs text-red-500 ml-auto">missing</span>}
                {!ok && warn && <span className="text-xs text-amber-500 ml-auto">not set (optional)</span>}
              </div>
              {value && <p className="text-xs text-gray-400 font-mono pl-6 break-all">{value}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Database */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database size={15} className="text-gray-500" />
          <h2 className="font-semibold text-gray-900 text-sm">Database</h2>
          <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${data.db.connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {data.db.connected ? "Connected" : "Unreachable"}
          </span>
        </div>

        {data.db.error && (
          <div className="mb-4 bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700 font-mono break-all">
            {data.db.error}
          </div>
        )}

        {data.db.connected && (
          <div className="space-y-2">
            {Object.entries(data.db.tables).map(([table, val]) => (
              <div key={table} className="flex items-center gap-2.5">
                {"count" in val
                  ? <CheckCircle size={16} className="text-green-500 shrink-0" />
                  : <XCircle size={16} className="text-red-500 shrink-0" />
                }
                <code className="text-xs text-gray-700 font-mono">{table}</code>
                {"count" in val
                  ? <span className="text-xs text-gray-400 ml-auto">{val.count} row{val.count !== 1 ? "s" : ""}</span>
                  : <span className="text-xs text-red-500 ml-auto">missing</span>
                }
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Actions */}
      {data.db.connected && (
        <section className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-1">Sync Schema</h2>
          <p className="text-xs text-gray-500 mb-4">
            Runs <code className="bg-gray-100 px-1 rounded">CREATE TABLE IF NOT EXISTS</code> and <code className="bg-gray-100 px-1 rounded">ALTER TABLE … ADD COLUMN IF NOT EXISTS</code> for all tables and columns. Safe to run multiple times.
          </p>
          <button
            onClick={initDb}
            disabled={initializing}
            className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
          >
            {initializing && <Loader2 size={14} className="animate-spin" />}
            {initializing ? "Running…" : "Sync Schema"}
          </button>
          {initResult && (
            <div className={`mt-3 text-xs px-3 py-2 rounded-lg whitespace-pre-wrap break-all ${initResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700 font-mono"}`}>
              {initResult.message}
            </div>
          )}
        </section>
      )}

      {data.db.connected && allTablesOk && !initResult && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-2xl px-5 py-4">
          <CheckCircle size={16} />
          All tables present. Database is ready.
        </div>
      )}
    </>
  )
}

export default function AdminPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <BrandingSection />
      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      }>
        <AdminContent />
      </Suspense>
    </div>
  )
}
