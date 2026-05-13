import { notFound } from "next/navigation"
import prisma from "@/lib/prisma"
import { initials, formatDate } from "@/lib/utils"
import { MapPin, Building2, Users } from "lucide-react"

type Props = { params: { token: string } }

export async function generateMetadata({ params }: Props) {
  const list = await prisma.contactList.findFirst({
    where: { shareToken: params.token, shareEnabled: true },
    select: { name: true, description: true, user: { select: { name: true } } },
  })
  if (!list) return { title: "Not found" }
  return {
    title: `${list.name} — 6Degrees`,
    description: list.description ?? `A contact list by ${list.user.name}`,
  }
}

export default async function SharedListPage({ params }: Props) {
  const list = await prisma.contactList.findFirst({
    where: { shareToken: params.token, shareEnabled: true },
    include: {
      user: { select: { name: true, image: true } },
      members: {
        orderBy: { addedAt: "asc" },
        include: {
          contact: {
            select: {
              id: true, firstName: true, lastName: true,
              position: true, company: true, location: true,
              industry: true, photoUrl: true, commonConnections: true,
              headline: true,
            },
          },
        },
      },
      _count: { select: { members: true } },
    },
  })

  if (!list) notFound()

  const contacts = list.members.map((m) => m.contact)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-blue-600 font-bold text-lg">6°</span>
                <span className="text-gray-400 text-sm">/</span>
                <span className="text-sm text-gray-500">Shared list</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{list.name}</h1>
              {list.description && (
                <p className="text-gray-500 mt-1 text-sm">{list.description}</p>
              )}
              <div className="flex items-center gap-3 mt-3">
                <div className="flex items-center gap-2">
                  {list.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={list.user.image} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {(list.user.name ?? "U")[0]}
                    </div>
                  )}
                  <span className="text-sm text-gray-600">{list.user.name}</span>
                </div>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">
                  {list._count.members} contact{list._count.members !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <a
              href="/"
              className="shrink-0 text-sm font-semibold text-blue-600 border border-blue-200 rounded-xl px-4 py-2 hover:bg-blue-50 transition-colors"
            >
              Try 6Degrees
            </a>
          </div>
        </div>
      </div>

      {/* Contacts */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {contacts.map((contact) => {
            const fullName = `${contact.firstName} ${contact.lastName}`
            const inits = initials(contact.firstName, contact.lastName)
            return (
              <div
                key={contact.id}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-start gap-3">
                  {contact.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={contact.photoUrl}
                      alt={fullName}
                      className="w-11 h-11 rounded-full object-cover border border-gray-100 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {inits}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{fullName}</p>
                    {contact.position && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{contact.position}</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  {contact.company && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Building2 size={11} className="text-gray-400 shrink-0" />
                      <span className="truncate">{contact.company}</span>
                    </div>
                  )}
                  {contact.location && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <MapPin size={11} className="text-gray-400 shrink-0" />
                      <span className="truncate">{contact.location}</span>
                    </div>
                  )}
                  {contact.industry && (
                    <div className="inline-block text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5 truncate max-w-full">
                      {contact.industry}
                    </div>
                  )}
                </div>

                {contact.commonConnections != null && contact.commonConnections > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                    <Users size={10} />
                    {contact.commonConnections} mutual
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Shared via <a href="/" className="text-blue-500 hover:underline">6Degrees</a>
          {" · "}Viewed {formatDate(new Date().toISOString())}
        </p>
      </div>
    </div>
  )
}
