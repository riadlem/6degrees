"use client"

import { useState } from "react"
import { X, Copy, Check, Link2, Globe, GlobeLock, ExternalLink } from "lucide-react"

interface Props {
  eventSlug: string
  shareEnabled: boolean
  shareToken: string | null
  onClose: () => void
  onToggle: (enabled: boolean, token: string | null) => void
}

export default function EventShareModal({
  eventSlug,
  shareEnabled,
  shareToken,
  onClose,
  onToggle,
}: Props) {
  const [enabled, setEnabled] = useState(shareEnabled)
  const [token, setToken] = useState(shareToken)
  const [copied, setCopied] = useState(false)
  const [toggling, setToggling] = useState(false)

  const shareUrl = token
    ? `${window.location.origin}/events/share/${token}`
    : null

  async function toggleShare() {
    setToggling(true)
    if (!enabled) {
      const res = await fetch("/api/events/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventSlug }),
      })
      const data = await res.json()
      setToken(data.shareToken)
      setEnabled(true)
      onToggle(true, data.shareToken)
    } else {
      await fetch("/api/events/share", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventSlug }),
      })
      setEnabled(false)
      onToggle(false, null)
    }
    setToggling(false)
  }

  async function copyUrl() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Share speakers</h2>
            <p className="text-xs text-gray-500 mt-0.5">Money 20/20 Europe 2026</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Toggle */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {enabled ? (
                <Globe size={18} className="text-green-600 mt-0.5 shrink-0" />
              ) : (
                <GlobeLock size={18} className="text-gray-400 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">Public link</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {enabled
                    ? "Anyone with the link can view your speaker list and priorities"
                    : "Only you can see this list"}
                </p>
              </div>
            </div>
            <button
              onClick={toggleShare}
              disabled={toggling}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? "bg-green-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* URL */}
          {enabled && shareUrl && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Link2 size={13} className="text-gray-400 shrink-0" />
                <p className="text-xs text-gray-600 flex-1 truncate font-mono">{shareUrl}</p>
                <button
                  onClick={copyUrl}
                  className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <ExternalLink size={11} />
                Preview shared view
              </a>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Recipients can view your priority ratings and import the speaker list to their own 6Degrees account.
          </p>
        </div>
      </div>
    </div>
  )
}
