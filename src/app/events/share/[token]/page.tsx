import { notFound } from "next/navigation"
import { Suspense } from "react"
import prisma from "@/lib/prisma"
import { prioOrder } from "@/lib/speakers-pdf"
import ImportButton from "./ImportButton"
import SpeakersContent from "./SpeakersContent"

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
    },
  })

  const sorted = [...speakers].sort((a, b) => prioOrder(a.priority) - prioOrder(b.priority))

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
              <h1 className="text-2xl font-bold text-gray-900">Money 20/20 Europe 2026</h1>
              <p className="text-sm text-gray-500 mt-0.5">Amsterdam · June 2–4, 2026</p>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex items-center gap-2">
                  {share.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={share.user.image} alt="" className="w-6 h-6 rounded-full" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {(share.user.name ?? "U")[0]}
                    </div>
                  )}
                  <span className="text-sm text-gray-600">{share.user.name}</span>
                </div>
              </div>
            </div>

            <Suspense fallback={null}>
              <ImportButton token={params.token} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <SpeakersContent speakers={sorted} token={params.token} />
      </div>
    </div>
  )
}
