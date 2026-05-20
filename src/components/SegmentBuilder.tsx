"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, X, Loader2, Users } from "lucide-react"
import { cn } from "@/lib/utils"
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
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={addRule}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Plus size={12} />
          Add rule
        </button>

        <div className="flex items-center gap-3">
          {loading && <Loader2 size={13} className="animate-spin text-gray-400" />}
          {!loading && count !== null && (
            <span className="text-xs text-gray-500">
              <span className="font-semibold text-gray-900">{count.toLocaleString()}</span> contact{count !== 1 ? "s" : ""} match
            </span>
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
  )
}
