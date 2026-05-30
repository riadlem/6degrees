import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { createElement } from "react"

export type ContactForPdf = {
  id?: string
  firstName: string
  lastName: string
  position: string | null
  company: string | null
  country: string | null
  profileUrl: string | null
  emailAddress?: string | null
  phoneNumber?: string | null
  interactionScore?: number | null
  lastInteractionAt?: string | null
  lastEmailAt?: string | null
  lastWaAt?: string | null
  lastLiAt?: string | null
}

// ── Styles ────────────────────────────────────────────────────────────────────

const base = { fontFamily: "Helvetica" }

const s = StyleSheet.create({
  page:       { ...base, padding: 36 },
  pageLand:   { ...base, padding: 36, },
  header:     { marginBottom: 18 },
  title:      { fontSize: 18, fontWeight: "bold", color: "#111827" },
  meta:       { fontSize: 9, color: "#9CA3AF", marginTop: 4 },
  levelBadge: { fontSize: 8, color: "#6B7280", marginTop: 2 },
  rowHeader:  { flexDirection: "row", borderBottomWidth: 2, borderBottomColor: "#E5E7EB", paddingVertical: 5, marginBottom: 2 },
  row:        { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#F3F4F6", paddingVertical: 5, alignItems: "center" },
  footer:     { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 8, color: "#9CA3AF", textAlign: "center" },
  // L1 portrait (5 cols)
  l1n:  { width: "28%", fontSize: 9, color: "#111827", fontWeight: "bold" },
  l1t:  { width: "22%", fontSize: 9, color: "#374151" },
  l1c:  { width: "20%", fontSize: 9, color: "#374151" },
  l1co: { width: "12%", fontSize: 9, color: "#6B7280" },
  l1l:  { width: "18%", fontSize: 9, color: "#2563EB" },
  // L2 portrait (7 cols)
  l2n:  { width: "20%", fontSize: 8, color: "#111827", fontWeight: "bold" },
  l2t:  { width: "16%", fontSize: 8, color: "#374151" },
  l2c:  { width: "16%", fontSize: 8, color: "#374151" },
  l2co: { width: "9%",  fontSize: 8, color: "#6B7280" },
  l2e:  { width: "20%", fontSize: 8, color: "#374151" },
  l2p:  { width: "11%", fontSize: 8, color: "#374151" },
  l2l:  { width: "8%",  fontSize: 8, color: "#2563EB" },
  // L3 landscape (9 cols)
  l3n:  { width: "16%", fontSize: 8, color: "#111827", fontWeight: "bold" },
  l3t:  { width: "12%", fontSize: 8, color: "#374151" },
  l3c:  { width: "12%", fontSize: 8, color: "#374151" },
  l3co: { width: "7%",  fontSize: 8, color: "#6B7280" },
  l3e:  { width: "16%", fontSize: 8, color: "#374151" },
  l3p:  { width: "10%", fontSize: 8, color: "#374151" },
  l3sc: { width: "7%",  fontSize: 8, color: "#6B7280" },
  l3wa: { width: "8%",  fontSize: 8, color: "#374151" },
  l3li: { width: "8%",  fontSize: 8, color: "#374151" },
  l3em: { width: "8%",  fontSize: 8, color: "#374151" },  // no extra space on last col
  // Header text style
  h:    { fontSize: 7, color: "#9CA3AF", fontWeight: "bold" },
})

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

const LEVEL_LABELS = ["", "Basic", "With contact info", "Full"]

function SharePdf({ contacts, shareName, ownerName, level }: {
  contacts: ContactForPdf[]
  shareName: string | null
  ownerName: string
  level: number
}) {
  const isL3 = level >= 3
  const pageSize = isL3 ? "A4" : "A4"
  const orient = isL3 ? "landscape" : "portrait"
  const meta = `${contacts.length} contact${contacts.length !== 1 ? "s" : ""} · ${ownerName} · ${new Date().toLocaleDateString("fr-FR")}`
  const levelLabel = `Level ${level}: ${LEVEL_LABELS[level] ?? ""}`

  if (level === 1) {
    return createElement(Document, null,
      createElement(Page, { size: pageSize, orientation: orient, style: s.page },
        createElement(View, { style: s.header },
          createElement(Text, { style: s.title }, shareName ?? "Shared contacts"),
          createElement(Text, { style: s.meta }, meta),
          createElement(Text, { style: s.levelBadge }, levelLabel),
        ),
        createElement(View, { style: s.rowHeader },
          createElement(Text, { style: { ...s.l1n, ...s.h } }, "NAME"),
          createElement(Text, { style: { ...s.l1t, ...s.h } }, "TITLE"),
          createElement(Text, { style: { ...s.l1c, ...s.h } }, "COMPANY"),
          createElement(Text, { style: { ...s.l1co, ...s.h } }, "COUNTRY"),
          createElement(Text, { style: { ...s.l1l, ...s.h } }, "LINKEDIN"),
        ),
        createElement(View, {},
          ...contacts.map((c, i) =>
            createElement(View, { key: i, style: s.row },
              createElement(Text, { style: s.l1n }, `${c.firstName} ${c.lastName}`),
              createElement(Text, { style: s.l1t }, c.position ?? "—"),
              createElement(Text, { style: s.l1c }, c.company ?? "—"),
              createElement(Text, { style: s.l1co }, c.country ?? "—"),
              createElement(Text, { style: s.l1l }, c.profileUrl ? c.profileUrl.replace("https://www.linkedin.com/in/", "in/") : "—"),
            )
          )
        ),
        createElement(Text, { style: s.footer }, "Generated by 6Degrees · 6degrees.app"),
      )
    )
  }

  if (level === 2) {
    return createElement(Document, null,
      createElement(Page, { size: pageSize, orientation: orient, style: s.page },
        createElement(View, { style: s.header },
          createElement(Text, { style: s.title }, shareName ?? "Shared contacts"),
          createElement(Text, { style: s.meta }, meta),
          createElement(Text, { style: s.levelBadge }, levelLabel),
        ),
        createElement(View, { style: s.rowHeader },
          createElement(Text, { style: { ...s.l2n, ...s.h } }, "NAME"),
          createElement(Text, { style: { ...s.l2t, ...s.h } }, "TITLE"),
          createElement(Text, { style: { ...s.l2c, ...s.h } }, "COMPANY"),
          createElement(Text, { style: { ...s.l2co, ...s.h } }, "COUNTRY"),
          createElement(Text, { style: { ...s.l2e, ...s.h } }, "EMAIL"),
          createElement(Text, { style: { ...s.l2p, ...s.h } }, "PHONE"),
          createElement(Text, { style: { ...s.l2l, ...s.h } }, "LI"),
        ),
        createElement(View, {},
          ...contacts.map((c, i) =>
            createElement(View, { key: i, style: s.row },
              createElement(Text, { style: s.l2n }, `${c.firstName} ${c.lastName}`),
              createElement(Text, { style: s.l2t }, c.position ?? "—"),
              createElement(Text, { style: s.l2c }, c.company ?? "—"),
              createElement(Text, { style: s.l2co }, c.country ?? "—"),
              createElement(Text, { style: s.l2e }, c.emailAddress ?? "—"),
              createElement(Text, { style: s.l2p }, c.phoneNumber ?? "—"),
              createElement(Text, { style: s.l2l }, c.profileUrl ? "✓" : "—"),
            )
          )
        ),
        createElement(Text, { style: s.footer }, "Generated by 6Degrees · 6degrees.app"),
      )
    )
  }

  // Level 3 — landscape
  return createElement(Document, null,
    createElement(Page, { size: pageSize, orientation: "landscape", style: s.page },
      createElement(View, { style: s.header },
        createElement(Text, { style: s.title }, shareName ?? "Shared contacts"),
        createElement(Text, { style: s.meta }, meta),
        createElement(Text, { style: s.levelBadge }, levelLabel),
      ),
      createElement(View, { style: s.rowHeader },
        createElement(Text, { style: { ...s.l3n, ...s.h } }, "NAME"),
        createElement(Text, { style: { ...s.l3t, ...s.h } }, "TITLE"),
        createElement(Text, { style: { ...s.l3c, ...s.h } }, "COMPANY"),
        createElement(Text, { style: { ...s.l3co, ...s.h } }, "COUNTRY"),
        createElement(Text, { style: { ...s.l3e, ...s.h } }, "EMAIL"),
        createElement(Text, { style: { ...s.l3p, ...s.h } }, "PHONE"),
        createElement(Text, { style: { ...s.l3sc, ...s.h } }, "SCORE"),
        createElement(Text, { style: { ...s.l3wa, ...s.h } }, "WA"),
        createElement(Text, { style: { ...s.l3li, ...s.h } }, "LI DM"),
        createElement(Text, { style: { ...s.l3em, ...s.h } }, "EMAIL"),
      ),
      createElement(View, {},
        ...contacts.map((c, i) =>
          createElement(View, { key: i, style: s.row },
            createElement(Text, { style: s.l3n }, `${c.firstName} ${c.lastName}`),
            createElement(Text, { style: s.l3t }, c.position ?? "—"),
            createElement(Text, { style: s.l3c }, c.company ?? "—"),
            createElement(Text, { style: s.l3co }, c.country ?? "—"),
            createElement(Text, { style: s.l3e }, c.emailAddress ?? "—"),
            createElement(Text, { style: s.l3p }, c.phoneNumber ?? "—"),
            createElement(Text, { style: s.l3sc }, c.interactionScore != null ? c.interactionScore.toFixed(1) : "—"),
            createElement(Text, { style: s.l3wa }, fmtDate(c.lastWaAt)),
            createElement(Text, { style: s.l3li }, fmtDate(c.lastLiAt)),
            createElement(Text, { style: s.l3em }, fmtDate(c.lastEmailAt)),
          )
        )
      ),
      createElement(Text, { style: s.footer }, "Generated by 6Degrees · 6degrees.app"),
    )
  )
}

export async function renderSharePdf(
  contacts: ContactForPdf[],
  shareName: string | null,
  ownerName: string,
  level: number,
): Promise<Buffer> {
  return renderToBuffer(
    createElement(SharePdf, { contacts, shareName, ownerName, level }) as Parameters<typeof renderToBuffer>[0]
  )
}
