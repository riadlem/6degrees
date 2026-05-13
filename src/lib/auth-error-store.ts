// Module-level store for the last NextAuth error (single serverless instance only, good enough for debugging)
let lastError: { code: string; message: string; ts: string } | null = null

export function storeAuthError(code: string, metadata: unknown) {
  const msg =
    metadata instanceof Error
      ? metadata.message
      : typeof metadata === "object" && metadata !== null && "message" in metadata
      ? String((metadata as any).message)
      : JSON.stringify(metadata)
  lastError = { code, message: msg, ts: new Date().toISOString() }
}

export function getLastAuthError() {
  return lastError
}
