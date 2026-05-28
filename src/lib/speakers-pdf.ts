import {
  renderToBuffer, Document, Page, Text, View, Image,
  Svg, Polygon, StyleSheet,
} from "@react-pdf/renderer"
import { createElement } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpeakerForPdf = {
  firstName:    string
  lastName:     string
  role:         string | null
  company:      string | null
  photoUrl:     string | null
  priority:     number | null
  sessionTopic: string | null
}

// ── Priority config ───────────────────────────────────────────────────────────

export const PRIO_PDF: Record<number, {
  filled: number; color: string; label: string; bg: string; text: string
}> = {
  1: { filled: 4, color: "#F59E0B", label: "Must meet", bg: "#FEF3C7", text: "#92400E" },
  2: { filled: 3, color: "#3B82F6", label: "Important",  bg: "#DBEAFE", text: "#1E40AF" },
  3: { filled: 2, color: "#9CA3AF", label: "Optional",   bg: "#F3F4F6", text: "#4B5563" },
  4: { filled: 1, color: "#EF4444", label: "Skip",       bg: "#FEE2E2", text: "#991B1B" },
}

export function prioOrder(p: number | null): number {
  if (p === 4) return 99
  if (p === null) return 10
  return p
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(first: string, last: string) {
  return `${(first[0] ?? "").toUpperCase()}${(last[0] ?? "").toUpperCase()}`
}

export async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const ct = res.headers.get("content-type") ?? "image/jpeg"
    return `data:${ct};base64,${Buffer.from(buf).toString("base64")}`
  } catch {
    return null
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:    { padding: 32, fontFamily: "Helvetica", backgroundColor: "#F9FAFB" },
  header:  { backgroundColor: "#FFFFFF", borderRadius: 8, padding: 16, marginBottom: 16 },
  title:   { fontSize: 16, fontWeight: "bold", color: "#111827" },
  subtitle:{ fontSize: 9,  color: "#6B7280", marginTop: 4 },
  meta:    { fontSize: 8,  color: "#9CA3AF", marginTop: 3 },
  card: {
    backgroundColor: "#FFFFFF", borderRadius: 8, padding: 12, marginBottom: 6,
    flexDirection: "row", alignItems: "flex-start",
  },
  cardSkip:     { opacity: 0.5 },
  cardMustMeet: { borderTopWidth: 2, borderTopColor: "#F59E0B" },
  photoWrap: {
    width: 48, height: 48, borderRadius: 24,
    overflow: "hidden", marginRight: 12, flexShrink: 0,
  },
  photo: { width: 48, height: 48 },
  photoPlaceholder: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: "#4F46E5",
    alignItems: "center", justifyContent: "center",
    marginRight: 12, flexShrink: 0,
  },
  photoInitials: { color: "#FFFFFF", fontSize: 15, fontWeight: "bold" },
  info:    { flex: 1 },
  prioBadge: {
    flexDirection: "row", alignItems: "center", borderRadius: 4,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5,
    alignSelf: "flex-start", marginBottom: 4,
  },
  prioLabel: { fontSize: 7, fontWeight: "bold", marginLeft: 4 },
  name:    { fontSize: 11, fontWeight: "bold", color: "#111827", marginBottom: 2 },
  role:    { fontSize: 9,  color: "#6B7280", marginBottom: 1 },
  company: { fontSize: 9,  color: "#2563EB", marginBottom: 3 },
  session: {
    fontSize: 8, color: "#92400E", backgroundColor: "#FFFBEB", borderRadius: 4,
    paddingTop: 2, paddingBottom: 2, paddingLeft: 5, paddingRight: 5,
    alignSelf: "flex-start", marginTop: 2,
  },
  footer: {
    position: "absolute", bottom: 24, left: 32, right: 32,
    fontSize: 8, color: "#9CA3AF", textAlign: "center",
  },
})

// ── Diamond SVG row ───────────────────────────────────────────────────────────

function makeDiamonds(priority: number) {
  const cfg = PRIO_PDF[priority]
  const sz = 6
  return [1, 2, 3, 4].map((i) =>
    createElement(Svg, { key: i, width: sz, height: sz, viewBox: "0 0 8 8" },
      createElement(Polygon, {
        points: "4,0 8,4 4,8 0,4",
        fill:   i <= cfg.filled ? cfg.color : "none",
        stroke: i <= cfg.filled ? cfg.color : "#D1D5DB",
        strokeWidth: "1.5",
      })
    )
  )
}

// ── PDF component ─────────────────────────────────────────────────────────────

function SpeakersPdf({
  eventName, subtitle, speakers, ownerName, photoDataUrls,
}: {
  eventName:     string
  subtitle:      string
  speakers:      SpeakerForPdf[]
  ownerName:     string
  photoDataUrls: (string | null)[]
}) {
  return createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "A4", style: styles.page },

      createElement(
        View, { style: styles.header },
        createElement(Text, { style: styles.title    }, eventName),
        createElement(Text, { style: styles.subtitle }, subtitle),
        createElement(Text, { style: styles.meta },
          `${speakers.length} speaker${speakers.length !== 1 ? "s" : ""} · Sorted by priority · ${ownerName} · ${new Date().toLocaleDateString("fr-FR")}`)
      ),

      ...speakers.map((s, idx) => {
        const cfg   = s.priority !== null ? PRIO_PDF[s.priority] : null
        const photo = photoDataUrls[idx]
        const inits = initials(s.firstName, s.lastName)
        const cardStyle = Object.assign(
          {},
          styles.card,
          s.priority === 1 ? styles.cardMustMeet : {},
          s.priority === 4 ? styles.cardSkip     : {},
        )

        return createElement(
          View, { key: idx, style: cardStyle },

          photo
            ? createElement(View, { style: styles.photoWrap },
                createElement(Image, { src: photo, style: styles.photo })
              )
            : createElement(View, { style: styles.photoPlaceholder },
                createElement(Text, { style: styles.photoInitials }, inits)
              ),

          createElement(
            View, { style: styles.info },

            cfg
              ? createElement(
                  View, { style: Object.assign({}, styles.prioBadge, { backgroundColor: cfg.bg }) },
                  ...makeDiamonds(s.priority!),
                  createElement(Text, { style: Object.assign({}, styles.prioLabel, { color: cfg.text }) }, cfg.label)
                )
              : null,

            createElement(Text, { style: styles.name    }, `${s.firstName} ${s.lastName}`),
            s.role         ? createElement(Text, { style: styles.role    }, s.role)         : null,
            s.company      ? createElement(Text, { style: styles.company }, s.company)      : null,
            s.sessionTopic ? createElement(Text, { style: styles.session }, s.sessionTopic) : null,
          )
        )
      }),

      createElement(Text, { style: styles.footer }, "Generated by 6Degrees · 6degrees.app")
    )
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateSpeakersPdf({
  eventName,
  subtitle,
  speakers,
  ownerName,
}: {
  eventName: string
  subtitle:  string
  speakers:  SpeakerForPdf[]
  ownerName: string
}): Promise<Buffer> {
  const photoDataUrls = await Promise.all(
    speakers.map((s) => s.photoUrl ? fetchImageDataUrl(s.photoUrl) : Promise.resolve(null))
  )

  return renderToBuffer(
    createElement(SpeakersPdf, {
      eventName,
      subtitle,
      speakers,
      ownerName,
      photoDataUrls,
    }) as Parameters<typeof renderToBuffer>[0]
  ) as Promise<Buffer>
}
