"use client"

import { useState, useEffect } from "react"
import { X, Plus, Check, List } from "lucide-react"
import { cn } from "@/lib/utils"

type ContactList = {
  id: string
  name: string
  _count: { members: number }
}

type Contact = {
  id: string
  firstName: string
  lastName: string
  listMembers: { listId: string }[]
}

interface Props {
  contacts: Contact[]   // one or many
  onClose: () => void
  onDone: () => void
}

export default function AddToListModal({ contacts, onClose, onDone }: Props) {
  const [lists, setLists] = useState<ContactList[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/lists")
      .then((r) => r.json())
      .then(setLists)
  }, [])

  // Pre-select lists that already contain ALL the contacts
  const alreadyInList = (listId: string) =>
    contacts.every((c) => c.listMembers.some((m) => m.listId === listId))

  async function createList() {
    if (!newName.trim()) return
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const list = await res.json()
    setLists((prev) => [list, ...prev])
    setSelected((prev) => new Set([...prev, list.id]))
    setNewName("")
    setCreating(false)
  }

  async function save() {
    if (selected.size === 0) return
    setSaving(true)
    const contactIds = contacts.map((c) => c.id)
    await Promise.all(
      [...selected].map((listId) =>
        fetch(`/api/lists/${listId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds }),
        })
      )
    )
    setSaving(false)
    onDone()
  }

  const title =
    contacts.length === 1
      ? `${contacts[0].firstName} ${contacts[0].lastName}`
      : `${contacts.length} contacts`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Add to list</h2>
            <p className="text-xs text-gray-500 mt-0.5">{title}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-3 max-h-64 overflow-y-auto space-y-1">
          {lists.length === 0 && !creating && (
            <p className="text-sm text-gray-400 text-center py-4">No lists yet</p>
          )}
          {lists.map((list) => {
            const inList = alreadyInList(list.id)
            const checked = selected.has(list.id) || inList
            return (
              <button
                key={list.id}
                disabled={inList}
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(list.id)) next.delete(list.id)
                    else next.add(list.id)
                    return next
                  })
                }
                className={cn(
                  "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-colors",
                  inList ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50",
                  checked && !inList && "bg-blue-50"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                    checked ? "bg-blue-600 border-blue-600" : "border-gray-300"
                  )}
                >
                  {checked && <Check size={11} className="text-white" strokeWidth={3} />}
                </div>
                <span className="flex items-center gap-1.5 flex-1 min-w-0">
                  <List size={13} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-800 truncate">{list.name}</span>
                </span>
                <span className="text-xs text-gray-400 shrink-0">{list._count.members}</span>
              </button>
            )
          })}
        </div>

        {/* Create new list */}
        <div className="px-5 pb-2">
          {creating ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createList()}
                placeholder="List name…"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={createList}
                className="text-sm text-blue-600 font-medium hover:text-blue-700"
              >
                Create
              </button>
              <button onClick={() => setCreating(false)} className="text-sm text-gray-400 hover:text-gray-600">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium py-1"
            >
              <Plus size={14} />
              New list
            </button>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 text-sm text-gray-600 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={selected.size === 0 || saving}
            className="flex-1 text-sm bg-blue-600 text-white rounded-xl py-2.5 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? "Adding…" : `Add to ${selected.size} list${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  )
}
