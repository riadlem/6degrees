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
export const CONTACT_ROW_GRID        = "36px 2.5rem 1.5rem 1fr 1fr 80px 90px 5rem 5rem 5.5rem"
// Mobile: avatar · LI · name+flag · company · actions (no city/country/WA/LI DM columns)
export const CONTACT_ROW_GRID_MOBILE = "36px 2.5rem 1.5rem 1fr 1fr 3.5rem"

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

  return (
    <div
      className={cn(
        "group grid gap-2 px-3 py-2 cursor-pointer transition-colors text-xs",
        isMobile ? "items-start" : "items-center",
        selected ? "bg-blue-50" : "odd:bg-white even:bg-gray-50/60 hover:bg-gray-100"
      )}
      style={{ gridTemplateColumns: isMobile ? CONTACT_ROW_GRID_MOBILE : CONTACT_ROW_GRID }}
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
          <img
            src={photoSrc(contact.photoUrl)!}
            alt={fullName}
            className={cn("w-9 h-9 rounded-full object-cover", blurred && "blur")}
          />
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
            <a
              href={contact.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={LEVEL_TITLES[liLevel]}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center"
            >
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

      {/* Name + position + flag (mobile) + optional email */}
      <div className="min-w-0">
        <p className={cn("font-semibold text-gray-900 text-sm leading-tight", isMobile ? "break-words" : "truncate", blurred && "blur-sm select-none")}>
          {fullName}
        </p>
        <div className="flex items-center gap-1 leading-tight">
          {isMobile && flag && (
            <span className="text-xs leading-none shrink-0" title={normCountry ?? undefined}>{flag}</span>
          )}
          {contact.position && (
            <p className={cn("text-xs text-gray-400 leading-tight", isMobile ? "break-words" : "truncate")}>{contact.position}</p>
          )}
        </div>
        {emailKind && !isMobile && (
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
            <CompanyLogo
              domain={companyNameToDomain(contact.company)}
              name={contact.company}
              size={14}
              radius="rounded-sm"
            />
            <p className={cn("text-xs text-gray-500 group-hover/company:text-blue-600", isMobile ? "break-words" : "truncate")}>{contact.company}</p>
          </Link>
        ) : null}
      </div>

      {/* City — desktop only */}
      {!isMobile && (
        <div className="min-w-0">
          <p className="text-xs text-gray-400 truncate">{normCity ?? ""}</p>
        </div>
      )}

      {/* Country: flag + name on desktop only (mobile flag is in name cell) */}
      {!isMobile && (
        <div className="min-w-0 flex items-center gap-1">
          {flag && <span className="text-sm leading-none shrink-0" title={normCountry ?? undefined}>{flag}</span>}
          <p className="text-xs text-gray-500 truncate">{normCountry ?? ""}</p>
        </div>
      )}

      {/* WA last interaction — desktop only */}
      {!isMobile && (
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
      )}

      {/* LI DM last interaction — desktop only */}
      {!isMobile && (
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
      )}

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
