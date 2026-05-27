import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { buildSegmentWhere, type SegmentDef } from "@/lib/segment-executor"
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { createElement } from "react"

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:       { padding: 36, fontFamily: "Helvetica", size: "A4" },
  header:     { marginBottom: 20 },
  title:      { fontSize: 20, fontWeight: "bold", color: "#111827" },
  description:{ fontSize: 10, color: "#6B7280", marginTop: 4 },
  meta:       { fontSize: 9,  color: "#9CA3AF", marginTop: 4 },
  rowHeader: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 6,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingVertical: 6,
    alignItems: "center",
  },
  // Column widths — 6-column layout on A4 portrait
  cName:    { width: "22%", fontSize: 9,  color: "#111827", fontWeight: "bold" },
  cTitle:   { width: "18%", fontSize: 9,  color: "#374151" },
  cCompany: { width: "18%", fontSize: 9,  color: "#374151" },
  cLoc:     { width: "16%", fontSize: 9,  color: "#6B7280" },
  cWa:      { width: "13%", fontSize: 9,  color: "#374151" },
  cLi:      { width: "13%", fontSize: 9,  color: "#374151" },
  // Header versions
  hName:    { width: "22%", fontSize: 8,  color: "#9CA3AF", fontWeight: "bold" },
  hTitle:   { width: "18%", fontSize: 8,  color: "#9CA3AF", fontWeight: "bold" },
  hCompany: { width: "18%", fontSize: 8,  color: "#9CA3AF", fontWeight: "bold" },
  hLoc:     { width: "16%", fontSize: 8,  color: "#9CA3AF", fontWeight: "bold" },
  hWa:      { width: "13%", fontSize: 8,  color: "#9CA3AF", fontWeight: "bold" },
  hLi:      { width: "13%", fontSize: 8,  color: "#9CA3AF", fontWeight: "bold" },
  footer: {
    position: "absolute", bottom: 28, left: 36, right: 36,
    fontSize: 8, color: "#9CA3AF", textAlign: "center",
  },
})

// ── Types ─────────────────────────────────────────────────────────────────────

type MsgInfo = { sentAt: Date; isOutbound: boolean }

type Contact = {
  firstName: string
  lastName:  string
  position:  string | null
  company:   string | null
  location:  string | null
  city:      string | null
  country:   string | null
  whatsAppMessages:   MsgInfo[]
  linkedInDMMessages: MsgInfo[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function interactionCell(msg: MsgInfo | undefined): string {
  if (!msg) return "—"
  const dir = msg.isOutbound ? "↑" : "↓"
  return `${dir} ${fmtDate(msg.sentAt)}`
}

// ── PDF component ─────────────────────────────────────────────────────────────

function ListPdf({
  listName, description, contacts, ownerName,
}: {
  listName: string
  description: string | null
  contacts: Contact[]
  ownerName: string
}) {
  return createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "A4", style: styles.page },
      // Header
      createElement(
        View, { style: styles.header },
        createElement(Text, { style: styles.title }, listName),
        description ? createElement(Text, { style: styles.description }, description) : null,
        createElement(Text, { style: styles.meta },
          `${contacts.length} contact${contacts.length !== 1 ? "s" : ""} · ${ownerName} · ${new Date().toLocaleDateString("fr-FR")}`)
      ),
      // Table header
      createElement(
        View, { style: styles.rowHeader },
        createElement(Text, { style: styles.hName    }, "NAME"),
        createElement(Text, { style: styles.hTitle   }, "TITLE"),
        createElement(Text, { style: styles.hCompany }, "COMPANY"),
        createElement(Text, { style: styles.hLoc     }, "LOCATION"),
        createElement(Text, { style: styles.hWa      }, "WHATSAPP"),
        createElement(Text, { style: styles.hLi      }, "LI DM"),
      ),
      // Rows
      createElement(
        View, {},
        ...contacts.map((c, i) =>
          createElement(
            View, { key: i, style: styles.row },
            createElement(Text, { style: styles.cName    }, `${c.firstName} ${c.lastName}`),
            createElement(Text, { style: styles.cTitle   }, c.position ?? "—"),
            createElement(Text, { style: styles.cCompany }, c.company   ?? "—"),
            createElement(Text, { style: styles.cLoc     },
              [c.city, c.country].filter(Boolean).join(", ") || c.location || "—"),
            createElement(Text, { style: styles.cWa }, interactionCell(c.whatsAppMessages?.[0])),
            createElement(Text, { style: styles.cLi }, interactionCell(c.linkedInDMMessages?.[0])),
          )
        )
      ),
      // Footer
      createElement(Text, { style: styles.footer }, "Generated by 6Degrees · 6degrees.app")
    )
  )
}

// ── Shared contact include ────────────────────────────────────────────────────

const PDF_INCLUDE = {
  whatsAppMessages:   { take: 1, orderBy: { sentAt: "desc" as const }, select: { sentAt: true, isOutbound: true } },
  linkedInDMMessages: { take: 1, orderBy: { sentAt: "desc" as const }, select: { sentAt: true, isOutbound: true } },
} as const

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })
  const userId = session.user.id

  const list = await prisma.contactList.findFirst({
    where: { id: params.id, userId },
    include: {
      members: {
        orderBy: { addedAt: "desc" },
        include: { contact: { include: PDF_INCLUDE } },
      },
      user: { select: { name: true } },
    },
  })
  if (!list) return new Response("Not found", { status: 404 })

  const filterCompany = (list as { filterCompany?: string | null }).filterCompany ?? null
  const filterSegment = (list as { filterSegment?: string | null }).filterSegment ?? null

  let contacts: Contact[]

  // ── Company dynamic list ────────────────────────────────────────────────────
  if (filterCompany) {
    contacts = await prisma.contact.findMany({
      where: { userId, company: { equals: filterCompany, mode: "insensitive" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: PDF_INCLUDE,
    })
  }
  // ── Smart segment list ──────────────────────────────────────────────────────
  else if (filterSegment) {
    try {
      const def = JSON.parse(filterSegment) as SegmentDef
      const where = await buildSegmentWhere(userId, def)
      contacts = await prisma.contact.findMany({
        where,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        include: PDF_INCLUDE,
      })
    } catch {
      contacts = list.members.map((m) => m.contact)
    }
  }
  // ── Static manual list ──────────────────────────────────────────────────────
  else {
    contacts = list.members.map((m) => m.contact)
  }

  const buffer = await renderToBuffer(
    createElement(ListPdf, {
      listName: list.name,
      description: list.description,
      contacts: contacts as Contact[],
      ownerName: list.user.name ?? "Unknown",
    }) as Parameters<typeof renderToBuffer>[0]
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${list.name.replace(/[^a-z0-9]/gi, "_")}.pdf"`,
    },
  })
}
