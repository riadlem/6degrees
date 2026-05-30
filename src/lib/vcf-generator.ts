export type ContactForVcf = {
  firstName: string
  lastName: string
  position: string | null
  company: string | null
  country: string | null
  profileUrl: string | null
  photoUrl: string | null
  // Level 2+
  emailAddress?: string | null
  phoneNumber?: string | null
  phones?: string[]
}

function escapeVcf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n")
}

function buildCard(c: ContactForVcf, level: number): string {
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVcf(`${c.firstName} ${c.lastName}`)}`,
    `N:${escapeVcf(c.lastName)};${escapeVcf(c.firstName)};;;`,
  ]
  if (c.position) lines.push(`TITLE:${escapeVcf(c.position)}`)
  if (c.company) lines.push(`ORG:${escapeVcf(c.company)}`)
  if (c.country) lines.push(`ADR;type=WORK:;;;;;;${escapeVcf(c.country)}`)
  if (c.profileUrl) lines.push(`URL;type=LinkedIn:${c.profileUrl}`)
  if (c.photoUrl) lines.push(`PHOTO;VALUE=URI:${c.photoUrl}`)
  if (level >= 2) {
    if (c.emailAddress) lines.push(`EMAIL;type=INTERNET:${c.emailAddress}`)
    if (c.phoneNumber) lines.push(`TEL;type=CELL:${c.phoneNumber}`)
    for (const p of c.phones ?? []) lines.push(`TEL;type=WORK:${p}`)
  }
  lines.push("END:VCARD")
  return lines.join("\r\n")
}

export function generateVcf(contacts: ContactForVcf[], level: number): string {
  return contacts.map((c) => buildCard(c, level)).join("\r\n")
}
