"use client"

import { createContext, useContext, useState, useCallback } from "react"

export type SyncState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "fetching"; total?: number; message?: string }
  | { phase: "syncing"; synced: number; failed: number; total: number; current?: string }
  | { phase: "done"; synced: number; failed: number }
  | { phase: "error"; message: string }

type Resumable = { cursor: number; total: number | null }

type SyncContextValue = {
  syncState: SyncState
  resumable: Resumable | null
  setResumable: (r: Resumable | null) => void
  sync: (restart?: boolean) => void
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function useSyncContext() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error("useSyncContext must be inside SyncProvider")
  return ctx
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncState, setSyncState] = useState<SyncState>({ phase: "idle" })
  const [resumable, setResumable] = useState<Resumable | null>(null)

  const sync = useCallback(async (restart = false) => {
    setResumable(null)
    setSyncState({ phase: "connecting" })

    try {
      const res = await fetch(`/api/linkedin/sync${restart ? "?restart=true" : ""}`, { method: "POST" })
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}))
        setSyncState({ phase: "error", message: json.error ?? "Sync failed" })
        setTimeout(() => setSyncState({ phase: "idle" }), 6000)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let gotTerminal = false

      // Race each chunk read against a 45-second stall timeout.
      // Server keepalives fire every 20 s, so 45 s means the connection is dead.
      const readChunk = () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
          const t = setTimeout(
            () => reject(new Error("Stream stalled — server stopped responding. Your progress is saved; use Resume to continue.")),
            45_000,
          )
          reader.read().then(
            (r) => { clearTimeout(t); resolve(r) },
            (e) => { clearTimeout(t); reject(e) },
          )
        })

      while (true) {
        const { done, value } = await readChunk()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === "status") {
              setSyncState({ phase: "fetching", total: event.total, message: event.message })
            } else if (event.type === "progress") {
              setSyncState({ phase: "syncing", synced: event.synced, failed: event.failed, total: event.total, current: event.current })
            } else if (event.type === "done") {
              gotTerminal = true
              setSyncState({ phase: "done", synced: event.synced, failed: event.failed })
              setTimeout(() => setSyncState({ phase: "idle" }), 6000)
            } else if (event.type === "error") {
              gotTerminal = true
              setSyncState({ phase: "error", message: event.message })
              setTimeout(() => setSyncState({ phase: "idle" }), 6000)
            }
          } catch { /* malformed SSE line */ }
        }
      }

      if (!gotTerminal) {
        setSyncState({
          phase: "error",
          message: "Connection lost — server timed out. Your progress is saved; use Resume to continue.",
        })
        fetch("/api/linkedin/sync")
          .then((r) => r.json())
          .then((d) => { if (d.hasResumable && d.cursor != null) setResumable({ cursor: d.cursor, total: d.total ?? null }) })
          .catch(() => {})
        setTimeout(() => setSyncState({ phase: "idle" }), 8000)
      }
    } catch (err) {
      setSyncState({ phase: "error", message: err instanceof Error ? err.message : "Unknown error" })
      setTimeout(() => setSyncState({ phase: "idle" }), 6000)
    }
  }, [])

  return (
    <SyncContext.Provider value={{ syncState, resumable, setResumable, sync }}>
      {children}
    </SyncContext.Provider>
  )
}
