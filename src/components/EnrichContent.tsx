"use client"

import { useEffect, useState, useCallback } from "react"
import { ExternalLink, Copy, Check, RefreshCw, Terminal } from "lucide-react"

type QueueContact = {
  id: string
  name: string
  profileUrl: string | null
  company: string | null
  position: string | null
  lastEnriched: string | null
  missing: string[]
}

type QueueData = {
  token: string | null
  total: number
  contacts: QueueContact[]
}

const API_BASE = "https://6degrees-one.vercel.app"

function buildScript(token: string): string {
  return `\
// 6Degrees enrichment — run in the browser console on a LinkedIn /in/ profile
;(async () => {
  const API = "${API_BASE}", TOKEN = "${token}"
  if (!location.href.includes("linkedin.com/in/")) { alert("Open a LinkedIn /in/ profile first"); return }
  const url = location.href.split("?")[0]

  const h1 = document.querySelector("h1")
  const fullName = (h1?.querySelector("span[aria-hidden='true']") ?? h1)?.textContent?.trim() ?? ""
  const [firstName, ...rest] = fullName.split(/\\s+/)
  const lastName = rest.join(" ")
  const headline = document.querySelector(".text-body-medium.break-words")?.textContent?.trim() ?? null
  const location = document.querySelector(".text-body-small.inline.t-black--light.break-words")?.textContent?.trim() ?? null

  let photoUrl = null
  for (const img of document.querySelectorAll("img")) {
    if (img.src.includes("profile-displayphoto")) { photoUrl = img.src; break }
  }

  const degEl = document.querySelector(".dist-value, .pv-member-badge span[aria-hidden='true']")
  const degree = degEl?.textContent?.trim()?.match(/[123]/)?.[0] ?? null

  let commonConnections = null
  for (const a of document.querySelectorAll("a")) {
    const t = a.textContent?.trim() ?? ""
    if (t.includes("mutual connection")) { commonConnections = parseInt(t.match(/\\d+/)?.[0] ?? "0") || null; break }
  }

  const DUR = /yr|mo|Present/i, DS = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\\d{4})/
  const EMP = /^(Full-time|Part-time|Self-employed|Freelance|Contract|Internship)$/i
  const parseItems = (sectionId, heading) => {
    const sec = document.getElementById(sectionId) ??
      [...document.querySelectorAll("section")].find(s => s.querySelector("h2")?.textContent?.toLowerCase().includes(heading))
    if (!sec) return []
    const items = []
    sec.querySelectorAll("li.artdeco-list__item, li[class*='pvs-list__item']").forEach(li => {
      const sp = [...li.querySelectorAll("span[aria-hidden='true']")].map(s => s.textContent.trim()).filter(Boolean)
      const dates = sp.filter(s => DUR.test(s) || DS.test(s))
      const texts = sp.filter(s => !DUR.test(s) && !DS.test(s) && s.length > 1 && !EMP.test(s))
      if (!texts[0]) return
      const [start, end] = (dates[0] ?? "").replace(/·.*$/, "").split(/[–—]/).map(s => s?.trim() ?? null)
      items.push({ title: texts[0], company: texts[1]?.split("·")[0]?.trim() ?? null, start: start ?? null, end: end ?? null })
    })
    return items
  }

  const payload = {
    profileUrl: url, firstName, lastName, headline, photoUrl, location, degree,
    commonConnections,
    experience: parseItems("experience", "experience"),
    education: parseItems("education", "education"),
  }
  console.log("[6Degrees] payload", payload)

  const res = await fetch(\`\${API}/api/extension/enrich\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${TOKEN}\` },
    body: JSON.stringify(payload),
  })
  const r = await res.json()
  console.log("[6Degrees] result", r)
  alert(r.ok ? \`✓ \${r.action} — \${firstName} \${lastName}\` : \`✗ \${r.error ?? "failed"}\`)
})()`
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1.5 rounded-lg transition-colors"
    >
      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
      {copied ? "Copied!" : label}
    </button>
  )
}

export default function EnrichContent() {
  const [data, setData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [enriched, setEnriched] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/enrich-queue")
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  const script = data?.token ? buildScript(data.token) : null

  return (
    <div className="space-y-5">
      {/* Instructions */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
        <p className="font-semibold mb-1">Instructions</p>
        <ol className="list-decimal ml-4 space-y-1 text-blue-800">
          <li>For each contact below, tap <strong>LinkedIn</strong> to open their profile.</li>
          <li><strong>With extension:</strong> click <em>Save to 6Degrees</em> on the page.</li>
          <li><strong>Without extension:</strong> open DevTools console, paste the script, press Enter.</li>
          <li>Tick the contact done and move to the next one.</li>
        </ol>
      </div>

      {/* Console script */}
      {script ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Console script</span>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={script} label="Copy script" />
              <button onClick={load} className="flex items-center gap-1.5 text-xs border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1.5 rounded-lg transition-colors text-gray-600">
                <RefreshCw size={11} />
                Refresh
              </button>
            </div>
          </div>
          <pre className="bg-gray-900 text-gray-100 text-xs rounded-xl p-4 overflow-x-auto max-h-40 leading-relaxed">
            {script}
          </pre>
        </div>
      ) : (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          No extension token yet — go to <a href="/settings" className="font-semibold underline">Settings</a> to generate one.
        </div>
      )}

      {/* Token quick-copy */}
      {data?.token && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
          <span className="text-xs text-gray-500 font-medium shrink-0">Token</span>
          <code className="flex-1 text-xs text-gray-700 truncate font-mono">{data.token}</code>
          <CopyButton text={data.token} />
        </div>
      )}

      {/* Contact queue */}
      <div>
        <p className="text-sm text-gray-500 mb-3">
          <span className="font-semibold text-gray-900">{data?.total ?? 0}</span> contacts need enrichment
        </p>
        {data?.contacts.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            All contacts with LinkedIn URLs are enriched ✓
          </div>
        ) : (
          <div className="space-y-2">
            {data?.contacts.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  enriched.has(c.id) ? "bg-green-50 border-green-200 opacity-60" : "bg-white border-gray-200"
                }`}
              >
                <button
                  onClick={() =>
                    setEnriched((prev) => {
                      const next = new Set(prev)
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                      return next
                    })
                  }
                  className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    enriched.has(c.id) ? "border-green-500 bg-green-500" : "border-gray-300 hover:border-green-400"
                  }`}
                >
                  {enriched.has(c.id) && <Check size={11} className="text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                  {(c.position || c.company) && (
                    <p className="text-xs text-gray-500 truncate">
                      {[c.position, c.company].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  {c.missing.map((f) => (
                    <span key={f} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
                      {f}
                    </span>
                  ))}
                </div>

                <span className="text-xs text-gray-400 shrink-0 hidden md:block w-24 text-right">
                  {c.lastEnriched
                    ? new Date(c.lastEnriched).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                    : "never"}
                </span>

                {c.profileUrl && (
                  <a
                    href={c.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0 border border-blue-200 hover:border-blue-400 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    <ExternalLink size={11} />
                    LinkedIn
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
