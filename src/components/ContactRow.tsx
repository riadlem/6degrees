"use client"

import { StickyNote, Plus, Mail, Sparkles, Users } from "lucide-react"
import { cn, initials, photoSrc } from "@/lib/utils"
import LabelBadge from "./LabelBadge"
import { type ContactSummary, linkedinLevel } from "./ContactCard"
import { STATUS_BADGE } from "@/lib/reconnect-status"
import { usePrivacy } from "@/contexts/PrivacyContext"
import { classifyEmail, EMAIL_KIND_COLOR, EMAIL_KIND_TITLE } from "@/lib/email-classify"
import CompanyLogo, { companyNameToDomain } from "./CompanyLogo"
import Link from "next/link"

// ── Country → ISO code ────────────────────────────────────────────────────────

const COUNTRY_ISO: Record<string, string> = {
  "Afghanistan":"AF","Albania":"AL","Algeria":"DZ","Angola":"AO","Argentina":"AR",
  "Armenia":"AM","Australia":"AU","Austria":"AT","Azerbaijan":"AZ","Bahrain":"BH",
  "Bangladesh":"BD","Belarus":"BY","Belgium":"BE","Bolivia":"BO","Brazil":"BR",
  "Bulgaria":"BG","Cambodia":"KH","Cameroon":"CM","Canada":"CA","Chile":"CL",
  "China":"CN","Colombia":"CO","Costa Rica":"CR","Croatia":"HR","Cyprus":"CY",
  "Czech Republic":"CZ","Czechia":"CZ","Denmark":"DK","Dominican Republic":"DO",
  "Ecuador":"EC","Egypt":"EG","Estonia":"EE","Ethiopia":"ET","Finland":"FI",
  "France":"FR","Georgia":"GE","Germany":"DE","Ghana":"GH","Greece":"GR",
  "Guatemala":"GT","Honduras":"HN","Hong Kong":"HK","Hungary":"HU","Iceland":"IS",
  "India":"IN","Indonesia":"ID","Iran":"IR","Iraq":"IQ","Ireland":"IE",
  "Israel":"IL","Italy":"IT","Ivory Coast":"CI","Japan":"JP","Jordan":"JO",
  "Kazakhstan":"KZ","Kenya":"KE","Kuwait":"KW","Latvia":"LV","Lebanon":"LB",
  "Libya":"LY","Lithuania":"LT","Luxembourg":"LU","Malaysia":"MY","Malta":"MT",
  "Mexico":"MX","Moldova":"MD","Morocco":"MA","Mozambique":"MZ","Myanmar":"MM",
  "Nepal":"NP","Netherlands":"NL","New Zealand":"NZ","Nigeria":"NG","Norway":"NO",
  "Oman":"OM","Pakistan":"PK","Palestine":"PS","Panama":"PA","Peru":"PE",
  "Philippines":"PH","Poland":"PL","Portugal":"PT","Qatar":"QA","Romania":"RO",
  "Russia":"RU","Rwanda":"RW","Saudi Arabia":"SA","Senegal":"SN","Serbia":"RS",
  "Singapore":"SG","Slovakia":"SK","Slovenia":"SI","South Africa":"ZA",
  "South Korea":"KR","Spain":"ES","Sri Lanka":"LK","Sudan":"SD","Sweden":"SE",
  "Switzerland":"CH","Syria":"SY","Taiwan":"TW","Tanzania":"TZ","Thailand":"TH",
  "Tunisia":"TN","Turkey":"TR","Türkiye":"TR","Uganda":"UG","Ukraine":"UA",
  "United Arab Emirates":"AE","UAE":"AE","United Kingdom":"GB","UK":"GB",
  "United States":"US","USA":"US","Uruguay":"UY","Uzbekistan":"UZ",
  "Venezuela":"VE","Vietnam":"VN","Yemen":"YE","Zambia":"ZM","Zimbabwe":"ZW",
}

function countryFlag(country: string): string {
  const iso = COUNTRY_ISO[country]
  if (!iso) return ""
  return iso.split("").map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397)).join("")
}

// French / alternate → English country names (display normalization for existing data)
const FR_COUNTRY_DISPLAY: Record<string, string> = {
  "royaume-uni": "United Kingdom", "royaume uni": "United Kingdom",
  "états-unis": "United States", "etats-unis": "United States",
  "etats unis": "United States", "états unis": "United States",
  "usa": "United States",
  "allemagne": "Germany", "espagne": "Spain", "italie": "Italy",
  "pays-bas": "Netherlands", "belgique": "Belgium", "suisse": "Switzerland",
  "autriche": "Austria", "chine": "China", "japon": "Japan",
  "russie": "Russia", "pologne": "Poland",
  "grèce": "Greece", "grece": "Greece",
  "danemark": "Denmark", "norvège": "Norway", "norvege": "Norway",
  "suède": "Sweden", "suede": "Sweden",
  "finlande": "Finland", "irlande": "Ireland", "turquie": "Turkey",
  "maroc": "Morocco", "australie": "Australia",
  "brésil": "Brazil", "bresil": "Brazil",
  "mexique": "Mexico", "inde": "India",
  "égypte": "Egypt", "egypte": "Egypt",
  "afrique du sud": "South Africa",
  "emirats arabes unis": "United Arab Emirates",
  "émirats arabes unis": "United Arab Emirates",
  "arabie saoudite": "Saudi Arabia",
  "sénégal": "Senegal", "senegal": "Senegal",
  "côte d'ivoire": "Ivory Coast", "cote d'ivoire": "Ivory Coast",
  "cameroun": "Cameroon",
}

function normalizeLocationFields(
  city: string | null | undefined,
  country: string | null | undefined,
): { city: string | null; country: string | null } {
  const normCountry = country
    ? (FR_COUNTRY_DISPLAY[country.trim().toLowerCase()] ?? country.trim())
    : null
  if (city) {
    const cityKey = city.trim().toLowerCase()
    const frCountry = FR_COUNTRY_DISPLAY[cityKey]
    if (frCountry) return { city: null, country: normCountry ?? frCountry }
    const trimmedCity = city.trim()
    if (!country && COUNTRY_ISO[trimmedCity]) return { city: null, country: trimmedCity }
  }
  return { city: city?.trim() ?? null, country: normCountry }
}

/** Relative time: "now", "3h", "2d", "1w", "3mo" */
function relTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const h = ms / 3_600_000
  if (h < 1)  return "now"
  if (h < 24) return `${Math.floor(h)}h`
  const d = ms / 86_400_000
  if (d < 7)  return `${Math.floor(d)}d`
  if (d < 30) return `${Math.floor(d / 7)}w`
  return `${Math.floor(d / 30)}mo`
}

const LI_ICON_PATH =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"

const LEVEL_COLORS: Record<"connected" | "pending" | "followed" | "saved", string> = {
  connected: "#0A66C2",
  pending:   "#7C3AED",
  followed:  "#D97706",
  saved:     "#9CA3AF",
}
const LEVEL_TITLES: Record<"connected" | "pending" | "followed" | "saved", string> = {
  connected: "1st-degree LinkedIn connection",
  pending:   "Pending LinkedIn connection request",
  followed:  "Followed on LinkedIn (not connected)",
  saved:     "Profile saved – not connected on LinkedIn",
}

// Grid columns: checkbox | avatar | LI | name+pos | company | city | country | WA last | LI DM last | actions
export const CONTACT_ROW_GRID = "36px 2.5rem 1.5rem 1fr 1fr 80px 90px 5rem 5rem 5.5rem"

interface Props {
  contact: ContactSummary
  selected?: boolean
  onSelect?: (id: string) => void
  onClick?: (contact: ContactSummary) => void
  onAddToList?: (contact: ContactSummary) => void
  isMobile?: boolean
}

export default function ContactRow({ contact, selected, onSelect, onClick, onAddToList, isMobile = false }: Props) {
  const fullName = `${contact.firstName} ${contact.lastName}`
  const inits = initials(contact.firstName, contact.lastName)
  const { blurred } = usePrivacy()
  const emailKind = classifyEmail(contact.emailAddress, contact.company)

  const liLevel = linkedinLevel(contact)
  const { city: normCity, country: normCountry } = normalizeLocationFields(contact.city, contact.country)
  const flag = normCountry ? countryFlag(normCountry) : ""

  const waMsg = contact.whatsAppMessages?.[0]
  const liDmMsg = contact.linkedInDMMessages?.[0]

  // ── Mobile: 3-line card layout ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        className={cn(
          "flex gap-3 px-3 py-2.5 cursor-pointer transition-colors",
          selected ? "bg-blue-50" : "odd:bg-white even:bg-gray-50/60 hover:bg-gray-100"
        )}
        onClick={() => onClick?.(contact)}
      >
        {/* Photo — square (no circle) */}
        <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 mt-0.5">
          {contact.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc(contact.photoUrl)!} alt={fullName}
              className={cn("w-11 h-11 object-cover", blurred && "blur")} />
          ) : (
            <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-semibold">
              {inits}
            </div>
          )}
        </div>

        {/* 3-line info block */}
        <div className="flex-1 min-w-0">
          {/* Line 1: Name + LI link + WA icon */}
          <div className="flex items-center gap-1.5">
            <p className={cn("flex-1 min-w-0 font-semibold text-gray-900 text-sm leading-snug", blurred && "blur-sm select-none")}>
              {fullName}
            </p>
            {liLevel && (
              contact.profileUrl ? (
                <a href={contact.profileUrl} target="_blank" rel="noopener noreferrer"
                  title={LEVEL_TITLES[liLevel]} onClick={(e) => e.stopPropagation()}
                  className="shrink-0 flex items-center">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: LEVEL_COLORS[liLevel] }}>
                    <path d={LI_ICON_PATH} />
                  </svg>
                </a>
              ) : (
                <span className="shrink-0 flex items-center" title={LEVEL_TITLES[liLevel]}>
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: LEVEL_COLORS[liLevel] }}>
                    <path d={LI_ICON_PATH} />
                  </svg>
                </span>
              )
            )}
            {waMsg && (
              <span className="shrink-0" title={waMsg.isOutbound ? "WhatsApp sent" : "WhatsApp received"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"
                  className={waMsg.isOutbound ? "text-blue-400" : "text-emerald-500"}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
                </svg>
              </span>
            )}
          </div>

          {/* Line 2: Title (truncated, 1 line) */}
          {contact.position && (
            <p className={cn("text-xs text-gray-400 truncate leading-snug mt-0.5", blurred && "blur-sm select-none")}>
              {contact.position}
            </p>
          )}

          {/* Line 3: Company + flag + shared-contacts pill + checkbox */}
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            {contact.company ? (
              <Link
                href={`/companies/${encodeURIComponent(contact.company)}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 min-w-0 group/company hover:text-blue-600 transition-colors"
              >
                <CompanyLogo domain={companyNameToDomain(contact.company)} name={contact.company} size={12} radius="rounded-sm" />
                <span className="text-xs text-gray-500 truncate group-hover/company:text-blue-600">{contact.company}</span>
              </Link>
            ) : <span className="flex-1" />}
            {flag && <span className="text-xs shrink-0" title={normCountry ?? undefined}>{flag}</span>}
            {contact.commonConnections != null && contact.commonConnections > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-blue-700 bg-blue-100 rounded-full px-1.5 py-0.5 shrink-0">
                <Users size={9} />
                {contact.commonConnections}
              </span>
            )}
            {onSelect && (
              <div className="ml-auto shrink-0" onClick={(e) => { e.stopPropagation(); onSelect(contact.id) }}>
                <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center",
                  selected ? "bg-blue-600 border-blue-600" : "border-gray-300")}>
                  {selected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Desktop: 10-column grid layout ────────────────────────────────────────────
  return (
    <div
      className={cn(
        "group grid gap-2 px-3 py-2 cursor-pointer transition-colors text-xs items-center",
        selected ? "bg-blue-50" : "odd:bg-white even:bg-gray-50/60 hover:bg-gray-100"
      )}
      style={{ gridTemplateColumns: CONTACT_ROW_GRID }}
      onClick={() => onClick?.(contact)}
    >
      {/* Checkbox */}
      <div
        className="flex items-center justify-center"
        onClick={(e) => { e.stopPropagation(); onSelect?.(contact.id) }}
      >
        {onSelect && (
          <div className={cn(
            "w-4 h-4 rounded border-2 flex items-center justify-center",
            selected ? "bg-blue-600 border-blue-600" : "border-gray-300 group-hover:border-gray-400"
          )}>
            {selected && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Avatar */}
      <div className="w-9 h-9 rounded-full overflow-hidden shrink-0">
        {contact.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc(contact.photoUrl)!} alt={fullName}
            className={cn("w-9 h-9 rounded-full object-cover", blurred && "blur")} />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-semibold">
            {inits}
          </div>
        )}
      </div>

      {/* LinkedIn badge */}
      <div className="flex items-center justify-center">
        {liLevel ? (
          contact.profileUrl ? (
            <a href={contact.profileUrl} target="_blank" rel="noopener noreferrer"
              title={LEVEL_TITLES[liLevel]} onClick={(e) => e.stopPropagation()}
              className="flex items-center">
              <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: LEVEL_COLORS[liLevel] }}>
                <path d={LI_ICON_PATH} />
              </svg>
            </a>
          ) : (
            <span title={LEVEL_TITLES[liLevel]}>
              <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: LEVEL_COLORS[liLevel] }}>
                <path d={LI_ICON_PATH} />
              </svg>
            </span>
          )
        ) : null}
      </div>

      {/* Name + position + email */}
      <div className="min-w-0">
        <p className={cn("font-semibold text-gray-900 text-sm leading-tight truncate", blurred && "blur-sm select-none")}>
          {fullName}
        </p>
        {contact.position && (
          <p className="text-xs text-gray-400 leading-tight truncate">{contact.position}</p>
        )}
        {emailKind && (
          <div
            className={cn("text-[10px] flex items-center gap-0.5 mt-0.5", EMAIL_KIND_COLOR[emailKind])}
            title={EMAIL_KIND_TITLE[emailKind]}
          >
            <Mail size={8} className="shrink-0" />
            {emailKind !== "mismatch" && (
              <span className={cn("truncate", blurred && "blur-sm select-none")}>
                {contact.emailAddress}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Company */}
      <div className="min-w-0">
        {contact.company ? (
          <Link
            href={`/companies/${encodeURIComponent(contact.company)}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 group/company hover:text-blue-600 transition-colors"
          >
            <CompanyLogo domain={companyNameToDomain(contact.company)} name={contact.company} size={14} radius="rounded-sm" />
            <p className="text-xs text-gray-500 group-hover/company:text-blue-600 truncate">{contact.company}</p>
          </Link>
        ) : null}
      </div>

      {/* City */}
      <div className="min-w-0">
        <p className="text-xs text-gray-400 truncate">{normCity ?? ""}</p>
      </div>

      {/* Country: flag + name */}
      <div className="min-w-0 flex items-center gap-1">
        {flag && <span className="text-sm leading-none shrink-0" title={normCountry ?? undefined}>{flag}</span>}
        <p className="text-xs text-gray-500 truncate">{normCountry ?? ""}</p>
      </div>

      {/* WA last interaction */}
      <div className="flex items-center justify-end gap-1 shrink-0">
        {waMsg ? (
          <span
            className={cn("font-medium tabular-nums", waMsg.isOutbound ? "text-blue-500" : "text-emerald-600")}
            title={waMsg.isOutbound ? "Outbound WA message" : "Inbound WA message"}
          >
            {waMsg.isOutbound ? "↑" : "↓"}{" "}
            {relTime(typeof waMsg.sentAt === "string" ? waMsg.sentAt : new Date(waMsg.sentAt).toISOString())}
          </span>
        ) : (
          <span className="text-gray-200">—</span>
        )}
      </div>

      {/* LI DM last interaction */}
      <div className="flex items-center justify-end gap-1 shrink-0">
        {liDmMsg ? (
          <span
            className={cn("font-medium tabular-nums", liDmMsg.isOutbound ? "text-blue-500" : "text-emerald-600")}
            title={liDmMsg.isOutbound ? "Outbound LinkedIn DM" : "Inbound LinkedIn DM"}
          >
            {liDmMsg.isOutbound ? "↑" : "↓"}{" "}
            {relTime(typeof liDmMsg.sentAt === "string" ? liDmMsg.sentAt : new Date(liDmMsg.sentAt).toISOString())}
          </span>
        ) : (
          <span className="text-gray-200">—</span>
        )}
      </div>

      {/* Actions: status, labels, notes, connections, add-to-list */}
      <div className="flex items-center gap-1 justify-end shrink-0">
        {contact.commonConnections != null && contact.commonConnections > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
            <Users size={10} />
            {contact.commonConnections}
          </span>
        )}
        {contact.outreachStatus && STATUS_BADGE[contact.outreachStatus] && (
          <span className={cn("text-xs rounded-full px-2 py-0.5 border font-medium shrink-0", STATUS_BADGE[contact.outreachStatus].className)}>
            {STATUS_BADGE[contact.outreachStatus].label}
          </span>
        )}
        {contact.labels.slice(0, 1).map(({ label }) => (
          <LabelBadge key={label.id} label={label} />
        ))}
        {contact.labels.length > 1 && (
          <span className="text-xs text-gray-400">+{contact.labels.length - 1}</span>
        )}
        {contact.coworkEnrichedAt && (
          <span className="text-xs text-purple-500 bg-purple-50 rounded-full px-1.5 py-0.5 shrink-0">
            <Sparkles size={10} className="inline" />
          </span>
        )}
        {contact.notes.length > 0 && (
          <span className="text-xs text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5 shrink-0">
            <StickyNote size={10} className="inline" />
          </span>
        )}
        {onAddToList && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddToList(contact) }}
            className="opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-700 transition-opacity shrink-0"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
