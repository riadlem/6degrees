"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Plus, X, Loader2, Users, BookmarkPlus, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/countries"
import { useContactsIndex } from "@/hooks/useContactsIndex"
import type { SegmentRule } from "@/app/api/contacts/segment/route"

// ── Field definitions ────────────────────────────────────────────────────────

type FieldType = "boolean" | "number" | "text_eq" | "text_contains" | "aggregate" | "status" | "label" | "date"

type FieldDef = {
  id: string
  label: string
  type: FieldType
  group: string
}

const FIELDS: FieldDef[] = [
  // Company / network
  { id: "companyContactCount", label: "Contacts at same company",  type: "aggregate",     group: "Company" },
  { id: "company",             label: "Company name",              type: "text_eq",       group: "Company" },
  // Enrichment
  { id: "coworkEnriched",      label: "Cowork enriched",           type: "boolean",       group: "Enrichment" },
  { id: "hasEmail",            label: "Has email address",         type: "boolean",       group: "Enrichment" },
  { id: "hasPhoto",            label: "Has photo",                 type: "boolean",       group: "Enrichment" },
  { id: "hasLinkedIn",         label: "Has LinkedIn profile",      type: "boolean",       group: "Enrichment" },
  { id: "hasPhone",            label: "Has phone number",          type: "boolean",       group: "Enrichment" },
  // Profile
  { id: "industry",            label: "Industry",                  type: "text_contains", group: "Profile" },
  { id: "position",            label: "Position / title",          type: "text_contains", group: "Profile" },
  { id: "country",             label: "Country",                   type: "text_eq",       group: "Location" },
  { id: "city",                label: "City",                      type: "text_eq",       group: "Location" },
  // Network
  { id: "commonConnections",   label: "Mutual connections",        type: "number",        group: "Network" },
  { id: "interactionScore",    label: "Interaction score",         type: "number",        group: "Network" },
  { id: "connectedOn",         label: "Connected on",              type: "date",          group: "Network" },
  // CRM
  { id: "outreachStatus",      label: "Reconnect status",          type: "status",        group: "CRM" },
  { id: "labelId",             label: "Label",                     type: "label",         group: "CRM" },
]

const FIELD_MAP = Object.fromEntries(FIELDS.map((f) => [f.id, f]))

const OPERATORS: Record<FieldType, { value: string; label: string }[]> = {
  boolean:      [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
  number:       [{ value: "gt", label: ">" }, { value: "gte", label: "≥" }, { value: "lt", label: "<" }, { value: "lte", label: "≤" }, { value: "eq", label: "=" }],
  aggregate:    [{ value: "gt", label: ">" }, { value: "gte", label: "≥" }, { value: "lt", label: "<" }, { value: "lte", label: "≤" }, { value: "eq", label: "=" }],
  text_eq:      [{ value: "is", label: "is" }, { value: "is_not", label: "is not" }, { value: "contains", label: "contains" }, { value: "not_contains", label: "doesn't contain" }],
  text_contains:[{ value: "contains", label: "contains" }, { value: "not_contains", label: "doesn't contain" }],
  status:       [{ value: "any", label: "has any" }, { value: "none", label: "has none" }, { value: "is", label: "is" }, { value: "is_not", label: "is not" }],
  label:        [{ value: "has", label: "has" }, { value: "has_not", label: "doesn't have" }],
  date:         [{ value: "after", label: "after" }, { value: "before", label: "before" }],
}

const STATUS_OPTIONS = [
  { value: "not_contacted",  label: "Pinned" },
  { value: "lkd_pending",    label: "LinkedIn invite" },
  { value: "drafted",        label: "Drafted" },
  { value: "sent",           label: "Sent" },
  { value: "responded",      label: "Responded" },
  { value: "meeting_booked", label: "Meeting booked" },
  { value: "meeting_done",   label: "Meeting done" },
  { value: "deprioritized",  label: "Deprioritized" },
  { value: "ignored",        label: "Ignored" },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultOperator(type: FieldType): string {
  return OPERATORS[type][0].value
}

function needsValue(type: FieldType, operator: string): boolean {
  if (type === "boolean") return false
  if (type === "status" && (operator === "any" || operator === "none")) return false
  return true
}

let ruleCounter = 0
function newRule(field = "coworkEnriched"): SegmentRule {
  const type = FIELD_MAP[field]?.type ?? "boolean"
  return { id: String(++ruleCounter), field, operator: defaultOperator(type), value: "" }
}

// ── Combobox for text fields ──────────────────────────────────────────────────

function SegmentCombobox({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  const [open, setOpen] = useState(false)
  const boxRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(
    () =>
      options
        .filter((o) => o.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 10),
    [options, value],
  )

  useEffect(() => {
    if (!open) return
    function handleDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleDown)
    return () => document.removeEventListener("mousedown", handleDown)
  }, [open])

  return (
    <div ref={boxRef} className="relative min-w-0 w-32 shrink-0">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false) }}
        placeholder="value…"
        autoComplete="off"
        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 top-full mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[160px]">
          {filtered.map((opt) => (
            <li
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); inputRef.current?.blur() }}
              className={cn(
                "px-2.5 py-1.5 text-xs cursor-pointer hover:bg-blue-50 hover:text-blue-700 truncate",
                opt === value && "bg-blue-50 text-blue-700 font-medium",
              )}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  onSelect: (ids: string[]) => void
  onClose: () => void
}

type LabelOption = { id: string; name: string; color: string }

export default function SegmentBuilder({ onSelect, onClose }: Props) {
  const [combinator, setCombinator] = useState<"AND" | "OR">("AND")
  const [rules, setRules] = useState<SegmentRule[]>([newRule()])
  const [count, setCount] = useState<number | null>(null)
  const [ids, setIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [labels, setLabels] = useState<LabelOption[]>([])

  // Save-as-smart-list state
  const [savingList, setSavingList] = useState(false)
  const [listName, setListName] = useState("")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")

  // Autocomplete options derived from the offline contacts index
  const index = useContactsIndex()
  const fieldOptions = useMemo<Record<string, string[]>>(() => {
    const uniq = (vals: (string | null | undefined)[]) =>
      [...new Set(vals.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b))
    return {
      company:  uniq(index.map((c) => c.company)),
      city:     uniq(index.map((c) => c.city)),
      country:  COUNTRIES,
      industry: uniq(index.map((c) => c.industry)),
      position: uniq(index.map((c) => c.position)),
    }
  }, [index])

  useEffect(() => {
    fetch("/api/labels").then((r) => r.ok ? r.json() : []).then(setLabels).catch(() => {})
  }, [])

  const runQuery = useCallback(async (c: "AND" | "OR", rs: SegmentRule[]) => {
    const active = rs.filter((r) => {
      if (!r.field || !r.operator) return false
      const def = FIELD_MAP[r.field]
      if (!def) return false
      if (!needsValue(def.type, r.operator)) return true
      return r.value.trim() !== ""
    })
    if (active.length === 0) { setCount(null); setIds([]); return }
    setLoading(true)
    try {
      const res = await fetch("/api/contacts/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ combinator: c, rules: active }),
      })
      if (res.ok) {
        const data = await res.json()
        setCount(data.total)
        setIds(data.ids)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce re-query on rule changes
  useEffect(() => {
    const t = setTimeout(() => runQuery(combinator, rules), 400)
    return () => clearTimeout(t)
  }, [combinator, rules, runQuery])

  function updateRule(id: string, patch: Partial<SegmentRule>) {
    setRules((prev) => prev.map((r) => {
      if (r.id !== id) return r
      const updated = { ...r, ...patch }
      // Reset operator + value when field changes
      if (patch.field && patch.field !== r.field) {
        const def = FIELD_MAP[patch.field]
        updated.operator = def ? defaultOperator(def.type) : "is"
        updated.value = ""
      }
      // Reset value when operator changes to one that doesn't need it
      if (patch.operator) {
        const def = FIELD_MAP[updated.field]
        if (def && !needsValue(def.type, patch.operator)) updated.value = ""
      }
      return updated
    }))
  }

  function removeRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  function addRule() {
    setRules((prev) => [...prev, newRule()])
  }

  // Helper: get active (filled) rules
  function getActiveRules() {
    return rules.filter((r) => {
      if (!r.field || !r.operator) return false
      const def = FIELD_MAP[r.field]
      if (!def) return false
      if (!needsValue(def.type, r.operator)) return true
      return r.value.trim() !== ""
    })
  }

  async function saveAsSmartList() {
    const name = listName.trim()
    if (!name || count === null || count === 0) return
    setSaveStatus("saving")
    try {
      await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          filterSegment: JSON.stringify({ combinator, rules: getActiveRules() }),
        }),
      })
      setSaveStatus("saved")
      setListName("")
      setSavingList(false)
      setTimeout(() => setSaveStatus("idle"), 4000)
    } catch {
      setSaveStatus("idle")
    }
  }

  // Group fields for the select optgroup
  const groups = Array.from(new Set(FIELDS.map((f) => f.group)))

  return (
    <div className="bg-white border border-blue-200 rounded-2xl p-4 space-y-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">Segment builder</span>
          {/* AND / OR toggle */}
          <div className="flex items-center text-xs border border-gray-200 rounded-lg overflow-hidden">
            {(["AND", "OR"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCombinator(c)}
                className={cn(
                  "px-2.5 py-1 font-medium transition-colors",
                  combinator === c ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">match all / any rules</span>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
      </div>

      {/* Rules */}
      <div className="space-y-2">
        {rules.map((rule, i) => {
          const def = FIELD_MAP[rule.field]
          const ops = def ? OPERATORS[def.type] : []
          const showValue = def ? needsValue(def.type, rule.operator) : false

          return (
            <div key={rule.id} className="flex items-center gap-2">
              {/* Combinator label */}
              <span className="text-xs text-gray-400 w-6 shrink-0 text-right">
                {i === 0 ? "If" : combinator}
              </span>

              {/* Field */}
              <select
                value={rule.field}
                onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0 flex-1"
              >
                {groups.map((group) => (
                  <optgroup key={group} label={group}>
                    {FIELDS.filter((f) => f.group === group).map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* Operator */}
              <select
                value={rule.operator}
                onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
              >
                {ops.map((op) => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>

              {/* Value */}
              {showValue && (
                <>
                  {def?.type === "boolean" ? null
                    : def?.type === "status" ? (
                      <select
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
                      >
                        <option value="">pick…</option>
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    ) : def?.type === "label" ? (
                      <select
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
                      >
                        <option value="">pick label…</option>
                        {labels.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    ) : def?.type === "date" ? (
                      <input
                        type="date"
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
                      />
                    ) : (def?.type === "number" || def?.type === "aggregate") ? (
                      <input
                        type="number"
                        min={0}
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        placeholder="0"
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-20 shrink-0"
                      />
                    ) : fieldOptions[rule.field]?.length ? (
                      <SegmentCombobox
                        value={rule.value}
                        onChange={(v) => updateRule(rule.id, { value: v })}
                        options={fieldOptions[rule.field]}
                      />
                    ) : (
                      <input
                        type="text"
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        placeholder="value…"
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-0 w-28 shrink-0"
                      />
                    )}
                </>
              )}

              {/* Remove */}
              <button
                onClick={() => removeRule(rule.id)}
                disabled={rules.length === 1}
                className="p-1 text-gray-300 hover:text-red-400 disabled:opacity-30 shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="space-y-2 pt-1">

        {/* Save-as-smart-list inline form */}
        {savingList && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <BookmarkPlus size={13} className="text-green-600 shrink-0" />
            <input
              autoFocus
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")  saveAsSmartList()
                if (e.key === "Escape") { setSavingList(false); setListName("") }
              }}
              placeholder="Smart list name…"
              className="text-xs flex-1 bg-transparent outline-none placeholder-green-400 text-green-900"
            />
            <button
              onClick={saveAsSmartList}
              disabled={!listName.trim() || saveStatus === "saving"}
              className="text-xs text-green-700 font-semibold hover:text-green-900 disabled:opacity-40 shrink-0"
            >
              {saveStatus === "saving" ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setSavingList(false); setListName("") }}
              className="text-green-400 hover:text-green-600 shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Saved confirmation */}
        {saveStatus === "saved" && !savingList && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <Check size={11} />
            Smart list saved —{" "}
            <a href="/lists" className="underline hover:text-green-800">view in Lists</a>
          </p>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={addRule}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Plus size={12} />
            Add rule
          </button>

          <div className="flex items-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin text-gray-400" />}
            {!loading && count !== null && (
              <span className="text-xs text-gray-500">
                <span className="font-semibold text-gray-900">{count.toLocaleString()}</span> match
              </span>
            )}
            {/* Save as smart list — shown when segment has results */}
            {!savingList && count !== null && count > 0 && (
              <button
                onClick={() => setSavingList(true)}
                className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
              >
                <BookmarkPlus size={11} />
                Save as list
              </button>
            )}
            <button
              disabled={count === null || count === 0 || loading}
              onClick={() => onSelect(ids)}
              className="flex items-center gap-1.5 text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium"
            >
              <Users size={11} />
              Select {count !== null && count > 0 ? count.toLocaleString() : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
