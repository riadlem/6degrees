"use client"

import { createContext, useContext, useState, useCallback, useEffect } from "react"

export type GmailSyncState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "fetching"; total?: number; message?: string }
  | { phase: "syncing"; synced: number; failed: number; processed: number; total: number; current?: string }
  | { phase: "done"; synced: number; failed: number }
  | { phase: "error"; message: string }

type GmailSyncContextValue = {
  gmailSyncState: GmailSyncState
  sync: (incremental?: boolean) => void
  lastSyncedAt: Date | null
}

const GmailSyncContext = createContext<GmailSyncContextValue | null>(null)

export function useGmailSyncContext() {
  const ctx = useContext(GmailSyncContext)
  if (!ctx) throw new Error("useGmailSyncContext must be inside GmailSyncProvider")
  return ctx
}

export function GmailSyncProvider({ children }: { children: React.ReactNode }) {
  const [gmailSyncState, setGmailSyncState] = useState<GmailSyncState>({ phase: "idle" })
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Seed the last-synced timestamp from the server on mount
  useEffect(() => {
    fetch("/api/gmail/sync")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.syncedAt) setLastSyncedAt(new Date(d.syncedAt)) })
      .catch(() => {})
  }, [])

  const sync = useCallback(async (incremental = false) => {
    setGmailSyncState({ phase: "connecting" })

    try {
      const params = incremental ? "?incremental=true" : ""
      const res = await fetch(`/api/gmail/sync${params}`, { method: "POST" })
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}))
        setGmailSyncState({ phase: "error", message: json.error ?? "Sync failed" })
        setTimeout(() => setGmailSyncState({ phase: "idle" }), 6000)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let gotTerminal = false

      const readChunk = () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
          const t = setTimeout(
            () => reject(new Error("Stream stalled — server stopped responding.")),
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
              setGmailSyncState({ phase: "fetching", total: event.total, message: event.message })
            } else if (event.type === "progress") {
              setGmailSyncState({ phase: "syncing", synced: event.synced, failed: event.failed, processed: event.processed ?? event.synced, total: event.total, current: event.current })
            } else if (event.type === "done") {
              gotTerminal = true
              setLastSyncedAt(new Date())
              setGmailSyncState({ phase: "done", synced: event.synced, failed: event.failed })
              setTimeout(() => setGmailSyncState({ phase: "idle" }), 6000)
            } else if (event.type === "error") {
              gotTerminal = true
              setGmailSyncState({ phase: "error", message: event.message })
              setTimeout(() => setGmailSyncState({ phase: "idle" }), 6000)
            }
          } catch { /* malformed SSE line */ }
        }
      }

      if (!gotTerminal) {
        setGmailSyncState({ phase: "error", message: "Connection lost — server timed out." })
        setTimeout(() => setGmailSyncState({ phase: "idle" }), 8000)
      }
    } catch (err) {
      setGmailSyncState({ phase: "error", message: err instanceof Error ? err.message : "Unknown error" })
      setTimeout(() => setGmailSyncState({ phase: "idle" }), 8000)
    }
  }, [])

  return (
    <GmailSyncContext.Provider value={{ gmailSyncState, sync, lastSyncedAt }}>
      {children}
    </GmailSyncContext.Provider>
  )
}

  const sync = useCallback(async (incremental = false) => {
    setGmailSyncState({ phase: "connecting" })

    try {
      const params = incremental ? "?incremental=true" : ""
      const res = await fetch(`/api/gmail/sync${params}`, { method: "POST" })
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}))
        setGmailSyncState({ phase: "error", message: json.error ?? "Sync failed" })
        setTimeout(() => setGmailSyncState({ phase: "idle" }), 6000)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let gotTerminal = false

      const readChunk = () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
          const t = setTimeout(
            () => reject(new Error("Stream stalled — server stopped responding.")),
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
              setGmailSyncState({ phase: "fetching", total: event.total, message: event.message })
            } else if (event.type === "progress") {
              setGmailSyncState({ phase: "syncing", synced: event.synced, failed: event.failed, processed: event.processed ?? event.synced, total: event.total, current: event.current })
            } else if (event.type === "done") {
              gotTerminal = true
              setGmailSyncState({ phase: "done", synced: event.synced, failed: event.failed })
              setTimeout(() => setGmailSyncState({ phase: "idle" }), 6000)
            } else if (event.type === "error") {
              gotTerminal = true
              setGmailSyncState({ phase: "error", message: event.message })
              setTimeout(() => setGmailSyncState({ phase: "idle" }), 6000)
            }
          } catch { /* malformed SSE line */ }
        }
      }

      if (!gotTerminal) {
        setGmailSyncState({ phase: "error", message: "Connection lost — server timed out." })
        setTimeout(() => setGmailSyncState({ phase: "idle" }), 8000)
      }
    } catch (err) {
      setGmailSyncState({ phase: "error", message: err instanceof Error ? err.message : "Unknown error" })
      setTimeout(() => setGmailSyncState({ phase: "idle" }), 8000)
    }
  }, [])

  return (
    <GmailSyncContext.Provider value={{ gmailSyncState, sync }}>
      {children}
    </GmailSyncContext.Provider>
  )
}
