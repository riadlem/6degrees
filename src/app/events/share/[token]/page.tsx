import { notFound } from "next/navigation"
import { Suspense } from "react"
import prisma from "@/lib/prisma"
import { Building2 } from "lucide-react"
import ImportButton from "./ImportButton"

type Props = { params: { token: string } }

export async function generateMetadata({ params }: Props) {
  const share = await prisma.eventShare.findFirst({
    where: { shareToken: params.token, shareEnabled: true },
    include: { user: { select: { name: true } } },
  })
  if (!share) return { title: "Not found" }
  return {
    title: `Speaker list · Money 20/20 Europe 2026 — 6Degrees`,
    description: `${share.user.name}'s curated speaker list for Money 20/20 Europe 2026`,
  }
}

// ─── Priority config (duplicated here — pure static data) ─────────────────────

const PRIO: Record<number, { filled: number; color: string; label: string }> = {
  1: { filled: 4, color: "#F59E0B", label: "Must meet" },
  2: { filled: 3, color: "#3B82F6", label: "Important"  },
  3: { filled: 2, color: "#9CA3AF", label: "Optional"   },
  4: { filled: 1, color: "#EF4444", label: "Skip"       },
}

function ReadOnlyDiamonds({ priority, size = 7 }: { priority: number | null; size?: number }) {
  const cfg = priority !== null ? PRIO[priority] : null
  const filled = cfg?.filled ?? 0
  const color  = cfg?.color  ?? "#9CA3AF"
  return (
    <div className="flex items-center gap-0.5" title={cfg?.label ?? "No priority set"}>
      {[1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 8 8">
          <polygon
            points="4,0 8,4 4,8 0,4"
            fill={i <= filled ? color : "none"}
            stroke={i <= filled ? color : "#D1D5DB"}
            strokeWidth="1.2"
          />
        </svg>
      ))}
    </div>
  )
}

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

const LI_PATH = "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"

export default async function SharedEventPage({ params }: Props) {
  const share = await prisma.eventShare.findFirst({
    where: { shareToken: params.token, shareEnabled: true },
    include: { user: { select: { name: true, image: true } } },
  })
  if (!share) notFound()

  const speakers = await prisma.eventSpeaker.findMany({
    where: { userId: share.userId, eventSlug: share.eventSlug },
    select: {
      id: true, firstName: true, lastName: true,
      role: true, company: true, photoUrl: true,
      priority: true, sessionTopic: true,
      linkedinUrl: true, linkedinKey: true,
      eventName: true,
    },
  })

  function prioOrder(p: number | null): number {
    if (p === 4) return 99
    if (p === null) return 10
    return p
  }

  const sorted = [...speakers].sort((a, b) => prioOrder(a.priority) - prioOrder(b.priority))
  const eventName = sorted[0]?.eventName ?? "Money 20/20 Europe 2026"

  function resolvedLinkedinUrl(linkedinUrl: string | null, linkedinKey: string | null): string | null {
    if (linkedinUrl) return linkedinUrl
    if (linkedinKey && !linkedinKey.startsWith("m2020-")) return `https://www.linkedin.com/in/${linkedinKey}/`
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-blue-600 font-bold text-lg">6°</span>
                <span className="text-gray-400 text-sm">/</span>
                <span className="text-sm text-gray-500">Shared speaker list</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{eventName}</h1>
              <p className="text-sm text-gray-500 mt-0.5">Amsterdam · June 2–4, 2026</p>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex items-center gap-2">
                  {share.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={share.user.image} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {(share.user.name ?? "U")[0]}
                    </div>
                  )}
                  <span className="text-sm text-gray-600">{share.user.name}</span>
                </div>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">
                  {sorted.length} speaker{sorted.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <Suspense fallback={null}>
              <ImportButton token={params.token} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Speaker grid */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sorted.map((speaker) => {
            const liUrl = resolvedLinkedinUrl(speaker.linkedinUrl, speaker.linkedinKey)
            const p4 = speaker.priority === 4
            const p1 = speaker.priority === 1
            const cfg = speaker.priority !== null ? PRIO[speaker.priority] : null

            return (
              <div
                key={speaker.id}
                className={`bg-white rounded-xl border p-4 flex flex-col gap-2.5 ${
                  p1 ? "border-amber-300 border-t-2" : "border-gray-200"
                } ${p4 ? "opacity-50" : ""}`}
              >
                {/* Header */}
                <div className="flex items-start gap-3">
                  {speaker.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={speaker.photoUrl}
                      alt={`${speaker.firstName} ${speaker.lastName}`}
                      className="w-11 h-11 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {initials(speaker.firstName, speaker.lastName)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {speaker.firstName} {speaker.lastName}
                    </p>
                    {speaker.role && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{speaker.role}</p>
                    )}
                    {speaker.company && (
                      <p className="text-xs text-blue-600 font-medium flex items-center gap-1 truncate mt-0.5">
                        <Building2 size={10} className="shrink-0" />
                        {speaker.company}
                      </p>
                    )}
                  </div>

                  {/* LinkedIn icon */}
                  {liUrl && (
                    <a
                      href={liUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="LinkedIn profile"
                      className="shrink-0"
                    >
                      <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "#0A66C2" }}>
                        <path d={LI_PATH} />
                      </svg>
                    </a>
                  )}
                </div>

                {/* Priority */}
                {speaker.priority !== null && cfg && (
                  <div className="flex items-center gap-1.5">
                    <ReadOnlyDiamonds priority={speaker.priority} />
                    <span className="text-xs font-medium" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                )}

                {/* Session topic */}
                {speaker.sessionTopic && (
                  <div className="px-2 py-1 bg-amber-50 border border-amber-100 rounded-lg">
                    <p className="text-[10px] text-amber-800 font-medium line-clamp-1">
                      {speaker.sessionTopic}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Shared via{" "}
          <a href="/" className="text-blue-500 hover:underline">
            6Degrees
          </a>
          {" · "}
          {sorted.length} speaker{sorted.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  )
}
