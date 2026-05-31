/**
 * Simple sliding-window in-memory rate limiter.
 *
 * Works within a single serverless instance — adequate for abuse deterrence
 * on low-traffic routes. For multi-instance or edge deployments, back this
 * with Redis/Upstash instead.
 */

type Entry = { timestamps: number[] }

const store = new Map<string, Entry>()

// Prune stale keys every 5 minutes to prevent unbounded memory growth.
setInterval(() => {
  const cutoff = Date.now() - 3_600_000
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
    if (entry.timestamps.length === 0) store.delete(key)
  }
}, 5 * 60_000).unref?.()

/**
 * Check whether a key has exceeded `limit` hits within the given `windowMs`.
 *
 * @returns `true` if the request is allowed, `false` if rate-limited.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs
  const entry = store.get(key) ?? { timestamps: [] }
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

  if (entry.timestamps.length >= limit) {
    store.set(key, entry)
    return false
  }

  entry.timestamps.push(now)
  store.set(key, entry)
  return true
}

/** Extract a best-effort client IP from Next.js request headers. */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  )
}
