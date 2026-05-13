"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, List, Trash2, Users, Share2 } from "lucide-react"
import { formatDate } from "@/lib/utils"

type ContactList = {
  id: string
  name: string
  description: string | null
  shareEnabled: boolean
  createdAt: string
  updatedAt: string
  _count: { members: number }
}

export default function ListsPage() {
  const { status } = useSession()
  const router = useRouter()
  const [lists, setLists] = useState<ContactList[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/lists")
      .then((r) => r.json())
      .then(setLists)
      .finally(() => setLoading(false))
  }, [status])

  async function createList() {
    if (!newName.trim()) return
    setSaving(true)
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
    })
    const list = await res.json()
    setLists((prev) => [list, ...prev])
    setNewName("")
    setNewDesc("")
    setCreating(false)
    setSaving(false)
  }

  async function deleteList(id: string, e: React.MouseEvent) {
    e.preventDefault()
    if (!confirm("Delete this list?")) return
    await fetch(`/api/lists/${id}`, { method: "DELETE" })
    setLists((prev) => prev.filter((l) => l.id !== id))
  }

  if (status === "loading" || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lists</h1>
          <p className="text-sm text-gray-500 mt-1">{lists.length} list{lists.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-colors"
        >
          <Plus size={15} />
          New list
        </button>
      </div>

      {/* Create list form */}
      {creating && (
        <div className="mb-5 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">New list</h3>
          <div className="space-y-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createList()}
              placeholder="List name"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex gap-2">
              <button
                onClick={createList}
                disabled={!newName.trim() || saving}
                className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-medium disabled:opacity-40 transition-colors"
              >
                {saving ? "Creating…" : "Create list"}
              </button>
              <button
                onClick={() => { setCreating(false); setNewName(""); setNewDesc("") }}
                className="text-sm text-gray-500 border border-gray-200 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lists grid */}
      {lists.length === 0 ? (
        <div className="text-center py-20">
          <List size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No lists yet</p>
          <p className="text-sm text-gray-400 mt-1">Create a list to organise your contacts</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <Link
              key={list.id}
              href={`/lists/${list.id}`}
              className="group bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-sm p-5 transition-all flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <List size={16} className="text-blue-600" />
                </div>
                <button
                  onClick={(e) => deleteList(list.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <h3 className="font-semibold text-gray-900 truncate">{list.name}</h3>
              {list.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{list.description}</p>
              )}

              <div className="mt-auto pt-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users size={12} className="text-gray-400" />
                  {list._count.members} contact{list._count.members !== 1 ? "s" : ""}
                </div>
                <div className="flex items-center gap-2">
                  {list.shareEnabled && (
                    <Share2 size={12} className="text-green-500" />
                  )}
                  <span className="text-xs text-gray-400">{formatDate(list.updatedAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
