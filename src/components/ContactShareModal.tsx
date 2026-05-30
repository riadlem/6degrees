"use client"

import { useState } from "react"
import { X, Link2, Copy, Check, Download, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  filterType: "ids" | "company" | "segment"
  filterValue: string
  contactCount: number
  onClose: () => void
}

type Level = 1 | 2 | 3

const LEVELS: { value: Level; label: string; badge: string; fields: string[] }[] = [
  {
    value: 1,
    label: "Basic",
    badge: "bg-gray-100 text-gray-600",
    fields: ["Photo", "Name", "Title", "Company", "Country", "LinkedIn"],
  },
  {
    value: 2,
    label: "Contact info",
    badge: "bg-blue-50 text-blue-700",
    fields: ["Everything in Basic", "+ Email", "+ Phone"],
  },
  {
    value: 3,
    label: "Full",
    badge: "bg-violet-50 text-violet-700",
    fields: ["Everything in Contact info", "+ Interaction score", "+ Last contact per channel"],
  },
]

export default function ContactShareModal({ filterType, filterValue, contactCount, onClose }: Props) {
  const [phase, setPhase] = useState<"configure" | "done">("configure")
  const [name, setName] = useState("")
  const [level, setLevel] = useState<Level>(1)
  const [creating, setCreating] = useState(false)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function createShare() {
    setCreating(true)
    try {
      const res = await fetch("/api/contacts/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, level, filterType, filterValue }),
      })
      if (res.ok) {
        const data = await res.json()
        setShareToken(data.token)
        setShareUrl(data.url)
        setPhase("done")
      }
    } finally {
      setCreating(false)
    }
  }

  async function copyUrl() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const filterLabel = filterType === "company" ? `All contacts at ${filterValue}` : `${contactCount} contact${contactCount !== 1 ? "s" : ""}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Share contacts</h2>
            <p className="text-xs text-gray-500 mt-0.5">{filterLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {phase === "configure" ? (
          <div className="px-5 py-4 space-y-4">
            {/* Name input */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Label (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. FinTech founders for Alice"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Level picker */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Privacy level</label>
              <div className="space-y-2">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLevel(l.value)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border-2 transition-all",
                      level === l.value ? "border-blue-500 bg-blue-50" : "border-gray-100 hover:border-gray-200 bg-white",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", l.badge)}>Level {l.value}</span>
                      <span className="text-sm font-medium text-gray-900">{l.label}</span>
                      {level === l.value && <Check size={14} className="text-blue-600 ml-auto" />}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {l.fields.map((f) => (
                        <span key={f} className="text-xs text-gray-500">{f}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Create button */}
            <button
              onClick={createShare}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl transition-colors"
            >
              {creating ? "Creating…" : <>Create share <ChevronRight size={14} /></>}
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Share link */}
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Link2 size={12} />Share link (webpage)
              </p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                <span className="flex-1 text-xs text-gray-600 truncate font-mono">{shareUrl}</span>
                <button
                  onClick={copyUrl}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0 transition-colors"
                >
                  {copied ? <><Check size={12} />Copied!</> : <><Copy size={12} />Copy</>}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Recipients can view contacts and switch between list, grid, and photos view.</p>
            </div>

            {/* Downloads */}
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Download size={12} />Download as
              </p>
              <div className="flex gap-2">
                <a
                  href={`/api/contacts/share/${shareToken}/pdf`}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-xl py-2 hover:bg-gray-50 transition-colors"
                >
                  <Download size={12} />PDF
                </a>
                <a
                  href={`/api/contacts/share/${shareToken}/vcf`}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-xl py-2 hover:bg-gray-50 transition-colors"
                >
                  <Download size={12} />VCF
                </a>
                <a
                  href={`/api/contacts/share/${shareToken}/csv`}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-xl py-2 hover:bg-gray-50 transition-colors"
                >
                  <Download size={12} />CSV
                </a>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Level {level}: {LEVELS.find(l => l.value === level)?.label} — fields included in export match the share level.</p>
            </div>

            <button
              onClick={onClose}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-1 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
