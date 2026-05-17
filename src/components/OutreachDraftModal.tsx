"use client"

import { useState, useRef } from "react"
import { X, Sparkles, Loader2, Save } from "lucide-react"
import { cn } from "@/lib/utils"

type Contact = {
  id: string
  firstName: string
  lastName: string
  position: string | null
  company: string | null
}

interface Props {
  contact: Contact
  onClose: () => void
  onSaved: () => void
}

const INTENTS = [
  { value: "catch_up",      label: "Catch up" },
  { value: "coffee_chat",   label: "Coffee chat" },
  { value: "collaboration", label: "Collaborate" },
  { value: "referral",      label: "Introduction" },
]

const TONES = [
  { value: "warm",         label: "Warm" },
  { value: "professional", label: "Professional" },
  { value: "casual",       label: "Casual" },
]

export default function OutreachDraftModal({ contact, onClose, onSaved }: Props) {
  const [intent, setIntent] = useState("catch_up")
  const [tone, setTone] = useState("warm")
  const [userNote, setUserNote] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function generate() {
    if (abortRef.current) abortRef.current.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setGenerating(true)
    setBody("")

    try {
      const res = await fetch("/api/reconnect/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, intent, tone, userNote }),
        signal: abort.signal,
      })

      if (!res.ok || !res.body) throw new Error("Generation failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.text) setBody((prev) => prev + event.text)
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setBody("Draft generation failed. Please try again.")
      }
    } finally {
      setGenerating(false)
    }
  }

  async function save() {
    if (!body.trim()) return
    setSaving(true)
    try {
      await fetch("/api/reconnect/draft/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, subject: subject || null, body }),
      })
      setSaved(true)
      setTimeout(() => {
        onSaved()
        onClose()
      }, 800)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Draft reconnection email</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              To {contact.firstName} {contact.lastName}
              {contact.position && contact.company ? ` · ${contact.position} at ${contact.company}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Controls */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Intent</label>
              <div className="flex gap-1.5 flex-wrap">
                {INTENTS.map((i) => (
                  <button
                    key={i.value}
                    onClick={() => setIntent(i.value)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border transition-colors",
                      intent === i.value
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Tone</label>
              <div className="flex gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border transition-colors",
                      tone === t.value
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Context <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              placeholder="e.g. we worked on a product launch together in 2019"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 text-sm bg-purple-600 text-white rounded-lg px-4 py-2 hover:bg-purple-700 disabled:opacity-60 transition-colors"
          >
            {generating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {generating ? "Generating…" : body ? "Regenerate" : "Generate draft"}
          </button>

          {/* Draft output */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Long time no talk!"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Your draft will appear here…"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!body.trim() || saving || saved}
            className={cn(
              "flex items-center gap-2 text-sm rounded-lg px-4 py-2 transition-colors",
              saved
                ? "bg-green-600 text-white"
                : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50",
            )}
          >
            <Save size={14} />
            {saved ? "Saved!" : saving ? "Saving…" : "Save draft"}
          </button>
        </div>
      </div>
    </div>
  )
}
