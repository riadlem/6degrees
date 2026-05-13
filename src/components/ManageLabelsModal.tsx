"use client"

import { useState, useEffect } from "react"
import { X, Plus, Check, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { labelColors, LABEL_COLOR_KEYS } from "@/lib/label-colors"

type Label = { id: string; name: string; color: string; _count: { contacts: number } }
type Contact = { id: string; firstName: string; lastName: string; labels: { label: { id: string } }[] }

interface Props {
  contacts: Contact[]
  onClose: () => void
  onDone: () => void
}

export default function ManageLabelsModal({ contacts, onClose, onDone }: Props) {
  const [labels, setLabels] = useState<Label[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState("blue")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/labels").then((r) => r.json()).then((data: Label[]) => {
      setLabels(data)
      // Pre-select labels that ALL contacts already have
      const alreadyAll = data
        .filter((l) => contacts.every((c) => c.labels.some((cl) => cl.label.id === l.id)))
        .map((l) => l.id)
      setSelected(new Set(alreadyAll))
    })
  }, [contacts])

  const allHaveLabel = (labelId: string) =>
    contacts.every((c) => c.labels.some((cl) => cl.label.id === labelId))

  async function createLabel() {
    if (!newName.trim()) return
    const res = await fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    })
    if (!res.ok) return
    const label = await res.json() as Label
    setLabels((prev) => [...prev, label].sort((a, b) => a.name.localeCompare(b.name)))
    setSelected((prev) => new Set([...prev, label.id]))
    setNewName("")
    setNewColor("blue")
    setCreating(false)
  }

  async function save() {
    setSaving(true)
    const contactIds = contacts.map((c) => c.id)

    // For each label in the user's set: add if selected, remove if deselected
    await Promise.all(
      labels.map(async (label) => {
        if (selected.has(label.id) && !allHaveLabel(label.id)) {
          await fetch(`/api/labels/${label.id}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactIds }),
          })
        } else if (!selected.has(label.id) && allHaveLabel(label.id)) {
          await fetch(`/api/labels/${label.id}/members`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactIds }),
          })
        }
      })
    )

    setSaving(false)
    onDone()
  }

  const title =
    contacts.length === 1
      ? `${contacts[0].firstName} ${contacts[0].lastName}`
      : `${contacts.length} contacts`

  const changed =
    labels.some((l) => selected.has(l.id) !== allHaveLabel(l.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Manage labels</h2>
            <p className="text-xs text-gray-500 mt-0.5">{title}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-3 max-h-64 overflow-y-auto space-y-1">
          {labels.length === 0 && !creating && (
            <p className="text-sm text-gray-400 text-center py-4">No labels yet — create one below</p>
          )}
          {labels.map((label) => {
            const c = labelColors(label.color)
            const checked = selected.has(label.id)
            return (
              <button
                key={label.id}
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(label.id)) next.delete(label.id)
                    else next.add(label.id)
                    return next
                  })
                }
                className={cn(
                  "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-colors hover:bg-gray-50",
                  checked && "bg-gray-50"
                )}
              >
                <div className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0", checked ? "bg-blue-600 border-blue-600" : "border-gray-300")}>
                  {checked && <Check size={11} className="text-white" strokeWidth={3} />}
                </div>
                <span className={cn("inline-flex items-center gap-1.5 flex-1 min-w-0 text-sm font-medium", c.text)}>
                  <span className={cn("w-2 h-2 rounded-full shrink-0", c.dot)} />
                  {label.name}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{label._count.contacts}</span>
              </button>
            )
          })}
        </div>

        {/* Create new label */}
        <div className="px-5 pb-2">
          {creating ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createLabel()}
                placeholder="Label name…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {LABEL_COLOR_KEYS.map((key) => {
                  const c = labelColors(key)
                  return (
                    <button
                      key={key}
                      onClick={() => setNewColor(key)}
                      className={cn("w-5 h-5 rounded-full transition-all", c.dot, newColor === key && "ring-2 ring-offset-1 ring-gray-400")}
                    />
                  )
                })}
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={createLabel} className="text-sm text-blue-600 font-medium hover:text-blue-700">Create</button>
                  <button onClick={() => setCreating(false)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium py-1"
            >
              <Plus size={14} />
              New label
            </button>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 text-sm text-gray-600 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!changed || saving}
            className="flex-1 text-sm bg-blue-600 text-white rounded-xl py-2.5 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  )
}
