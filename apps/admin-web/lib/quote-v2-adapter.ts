// Quote Builder V2 — ERP → UI adapter (Phase A, read-only).
//
// PURPOSE
// This file is the single boundary between your ERP / quote API and the
// presentational V2 Quote shape (`@/lib/quote-types`). The UI never talks to
// the backend directly: a server component calls `loadQuoteV2(id)`, which
// fetches the raw ERP payload and normalises it into a safe `Quote`.
//
// SCOPE / GUARDRAILS (Phase A)
//   - Read-only. No writes, no Save/Send/PDF wiring (see Phase B/C markers).
//   - No pricing math. `quote.pricing` is mapped 1:1 from the ERP engine
//     result — figures are displayed verbatim, never recomputed here.
//   - Defensive: every field is coerced with a safe fallback so malformed or
//     partial payloads degrade into empty states / "missing" warnings instead
//     of throwing at render time.

import type {
  Quote,
  QuoteMeta,
  QuoteStatus,
  QuoteType,
  Client,
  Agency,
  WorkflowStep,
  StepId,
  Status,
  SetupField,
  ItineraryDay,
  Meal,
  HotelCityBlock,
  HotelSelection,
  HotelCategory,
  ContractStatus,
  Experience,
  TransportService,
  TransportType,
  PricingBreakdown,
  CostLine,
  ProposalContent,
  ProposalReadinessItem,
} from "./quote-types"
import { demoQuote } from "./quote-demo-data"
import { adminPageFetchJson, isNextRedirectError } from "../app/lib/admin-server"

/* ------------------------------------------------------------------ */
/* Raw ERP payload contract                                            */
/* ------------------------------------------------------------------ */
//
// The shape Phase B is expected to deliver from the real ERP/API. Every field
// is optional and loosely typed on purpose — the adapter tolerates missing,
// null or wrongly-typed values. Treat this as the integration contract:
// whatever your endpoint returns should be massaged toward this shape, but the
// adapter will not crash if it deviates.

export interface RawErpQuote {
  id?: unknown
  // meta
  title?: unknown
  reference?: unknown
  code?: unknown
  quoteType?: unknown
  destination?: unknown
  marketLanguage?: unknown
  startDate?: unknown
  endDate?: unknown
  nights?: unknown
  pax?: unknown
  tourLeaders?: unknown
  rooming?: unknown
  currency?: unknown
  status?: unknown
  owner?: unknown
  lastSaved?: unknown
  updatedAt?: unknown
  // relations
  client?: unknown
  steps?: unknown
  setupFields?: unknown
  itinerary?: unknown
  hotelCities?: unknown
  experiences?: unknown
  transport?: unknown
  pricing?: unknown
  proposal?: unknown
  readiness?: unknown
  // allow extra ERP fields without breaking typing
  [key: string]: unknown
}

/* ------------------------------------------------------------------ */
/* Coercion helpers (operate on unknown, never throw)                  */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return fallback
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function asNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v
  if (typeof v === "string") return ["true", "1", "yes", "y"].includes(v.toLowerCase())
  if (typeof v === "number") return v === 1
  return fallback
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function asStringArray(v: unknown): string[] {
  return asArray(v)
    .map((x) => asString(x))
    .filter((x) => x.length > 0)
}

function asEnum<T extends string | number>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (allowed.includes(v as T)) return v as T
  // tolerate case / whitespace differences for string enums
  if (typeof v === "string") {
    const norm = v.trim().toLowerCase()
    const hit = allowed.find((a) => String(a).toLowerCase() === norm)
    if (hit !== undefined) return hit
  }
  return fallback
}

function rec(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {}
}

/* ------------------------------------------------------------------ */
/* Domain-specific normalisers                                         */
/* ------------------------------------------------------------------ */

const STATUS_VALUES = ["complete", "partial", "missing"] as const

function normStatus(v: unknown): Status {
  return asEnum<Status>(v, STATUS_VALUES, "missing")
}

function normQuoteStatus(v: unknown): QuoteStatus {
  const s = asString(v).trim().toLowerCase().replace(/[\s_]+/g, "-")
  const map: Record<string, QuoteStatus> = {
    draft: "draft",
    "in-review": "in-review",
    review: "in-review",
    pending: "in-review",
    sent: "sent",
    issued: "sent",
    confirmed: "confirmed",
    booked: "confirmed",
    won: "confirmed",
  }
  return map[s] ?? "draft"
}

function normQuoteType(v: unknown): QuoteType {
  const s = asString(v).trim().toLowerCase()
  if (s === "group" || s === "git") return "Group"
  if (s === "fit" || s === "individual") return "FIT"
  return "FIT"
}

function normContract(v: unknown): ContractStatus {
  const s = asString(v).trim().toLowerCase().replace(/[\s_]+/g, "-")
  if (s === "contracted" || s === "confirmed") return "contracted"
  if (s === "on-request" || s === "request" || s === "tentative") return "on-request"
  return "no-contract"
}

function normCategory(v: unknown): HotelCategory {
  if (typeof v === "string" && v.trim().toLowerCase().startsWith("camp")) return "Camp"
  const n = asNumber(v, 0)
  if (n === 5 || n === 4 || n === 3) return n as HotelCategory
  return "Camp"
}

function normMeals(v: unknown): Meal[] {
  const allowed: Meal[] = ["B", "L", "D"]
  return asArray(v)
    .map((m) => asString(m).trim().toUpperCase().charAt(0))
    .filter((m): m is Meal => (allowed as string[]).includes(m))
}

function normTransportType(v: unknown): TransportType {
  return asEnum<TransportType>(v, ["Transfer", "Touring", "Package"], "Transfer")
}

const STEP_IDS: StepId[] = [
  "setup",
  "itinerary",
  "hotels",
  "experiences",
  "transport",
  "pricing",
  "proposal",
]

function normStepId(v: unknown, fallback: StepId = "setup"): StepId {
  return asEnum<StepId>(v, STEP_IDS, fallback)
}

// Canonical step labels/descriptions, used when the ERP omits the stepper meta.
const STEP_DEFS: Record<StepId, { label: string; description: string }> = {
  setup: { label: "Setup", description: "Client & trip basics" },
  itinerary: { label: "Itinerary", description: "Day-by-day program" },
  hotels: { label: "Hotels", description: "Accommodation & rooming" },
  experiences: { label: "Experiences", description: "Visits & entrances" },
  transport: { label: "Transport", description: "Vehicles & transfers" },
  pricing: { label: "Pricing", description: "Costs & margin" },
  proposal: { label: "Proposal", description: "Review & generate PDF" },
}

/* ------------------------------------------------------------------ */
/* Section mappers                                                     */
/* ------------------------------------------------------------------ */

function mapMeta(raw: RawErpQuote, id: string): QuoteMeta {
  return {
    title: asString(raw.title, "Untitled quote"),
    reference: asString(raw.reference ?? raw.code ?? id, id),
    quoteType: normQuoteType(raw.quoteType),
    destination: asString(raw.destination, "—"),
    marketLanguage: asString(raw.marketLanguage, "—"),
    startDate: asString(raw.startDate),
    endDate: asString(raw.endDate),
    nights: asNumber(raw.nights),
    pax: asNumber(raw.pax),
    tourLeaders: asNumber(raw.tourLeaders),
    rooming: asString(raw.rooming, "—"),
    currency: asString(raw.currency, "USD"),
    status: normQuoteStatus(raw.status),
    owner: asString(raw.owner, "—"),
    // Display string only. If your ERP returns a timestamp, format it in
    // Phase B (e.g. relative time) before passing it through.
    lastSaved: asString(raw.lastSaved ?? raw.updatedAt, "—"),
  }
}

function mapClient(raw: RawErpQuote): Client {
  const c = rec(raw.client)
  const a = rec(c.agency)
  const agency: Agency = {
    id: asString(a.id, "agency-unknown"),
    name: asString(a.name, "Unknown agency"),
    country: asString(a.country, "—"),
    marketLanguage: asString(a.marketLanguage, "—"),
  }
  return {
    id: asString(c.id, "client-unknown"),
    contactName: asString(c.contactName, "—"),
    contactEmail: c.contactEmail ? asString(c.contactEmail) : undefined,
    agency,
  }
}

function mapSteps(raw: RawErpQuote): WorkflowStep[] {
  const provided = asArray(raw.steps)
  // Build a status lookup from whatever the ERP supplied.
  const statusById = new Map<StepId, Status>()
  for (const s of provided) {
    const r = rec(s)
    const id = normStepId(r.id, "setup")
    statusById.set(id, normStatus(r.status))
  }
  // Always emit the canonical 7 steps in order so the stepper is stable.
  return STEP_IDS.map((id) => ({
    id,
    label: STEP_DEFS[id].label,
    description: STEP_DEFS[id].description,
    status: statusById.get(id) ?? "missing",
  }))
}

function mapSetupFields(raw: RawErpQuote): SetupField[] {
  return asArray(raw.setupFields).map((f) => {
    const r = rec(f)
    return {
      label: asString(r.label, "—"),
      value: asString(r.value, "—"),
      group: asEnum<SetupField["group"]>(r.group, ["client", "trip", "config"], "config"),
    }
  })
}

function mapItinerary(raw: RawErpQuote): ItineraryDay[] {
  return asArray(raw.itinerary).map((d, i) => {
    const r = rec(d)
    return {
      id: asString(r.id, `day-${i + 1}`),
      day: asNumber(r.day, i + 1),
      date: asString(r.date),
      overnightCity: asString(r.overnightCity, "—"),
      title: asString(r.title, "—"),
      visits: asStringArray(r.visits),
      meals: normMeals(r.meals),
      hotelAssigned: r.hotelAssigned == null ? null : asString(r.hotelAssigned),
      transportAssigned: r.transportAssigned == null ? null : asString(r.transportAssigned),
      warnings: asStringArray(r.warnings),
    }
  })
}

function mapHotelCities(raw: RawErpQuote): HotelCityBlock[] {
  return asArray(raw.hotelCities).map((block, bi) => {
    const r = rec(block)
    const city = asString(r.city, `City ${bi + 1}`)
    const options: HotelSelection[] = asArray(r.options).map((o, oi) => {
      const ro = rec(o)
      return {
        id: asString(ro.id, `${city}-opt-${oi + 1}`),
        name: asString(ro.name, "—"),
        city: asString(ro.city, city),
        category: normCategory(ro.category),
        contractStatus: normContract(ro.contractStatus),
        mealPlan: asString(ro.mealPlan, "—"),
        roomingSummary: asString(ro.roomingSummary, "—"),
        ratePerNight: asNumber(ro.ratePerNight),
        nights: asNumber(ro.nights),
        selected: asBool(ro.selected),
        cityTax: asNumber(ro.cityTax),
      }
    })
    return { city, nights: asNumber(r.nights), options }
  })
}

function mapExperiences(raw: RawErpQuote): Experience[] {
  return asArray(raw.experiences).map((e, i) => {
    const r = rec(e)
    return {
      id: asString(r.id, `exp-${i + 1}`),
      name: asString(r.name, "—"),
      city: asString(r.city, "—"),
      type: asString(r.type, "—"),
      day: asString(r.day, "—"),
      status: normStatus(r.status),
      amount: asNumber(r.amount),
      included: asBool(r.included),
    }
  })
}

function mapTransport(raw: RawErpQuote): TransportService[] {
  return asArray(raw.transport).map((t, i) => {
    const r = rec(t)
    return {
      id: asString(r.id, `transport-${i + 1}`),
      route: asString(r.route, "—"),
      type: normTransportType(r.type),
      day: asString(r.day, "—"),
      vehicleClass: asString(r.vehicleClass, "—"),
      supplier: asString(r.supplier, "Unassigned"),
      supplierContract: normContract(r.supplierContract),
      priceStatus: normStatus(r.priceStatus),
      amount: asNumberOrNull(r.amount),
      warning: r.warning == null ? null : asString(r.warning) || null,
    }
  })
}

// NOTE: pricing is mapped 1:1 from the ERP pricing-engine result. No totals
// are recomputed here — netCost / margin / sellingPrice / perPerson are
// displayed exactly as the engine produced them.
function mapPricing(raw: RawErpQuote, currency: string): PricingBreakdown {
  const p = rec(raw.pricing)
  const lines: CostLine[] = asArray(p.lines).map((l, i) => {
    const r = rec(l)
    return {
      id: asString(r.id, `cost-${i + 1}`),
      label: asString(r.label, "—"),
      amount: asNumber(r.amount),
      status: normStatus(r.status),
      note: asString(r.note),
    }
  })
  return {
    lines,
    netCost: asNumber(p.netCost),
    markupPercent: asNumber(p.markupPercent),
    margin: asNumber(p.margin),
    sellingPrice: asNumber(p.sellingPrice),
    pax: asNumber(p.pax),
    perPerson: asNumber(p.perPerson),
    currency: asString(p.currency, currency),
  }
}

function mapProposal(raw: RawErpQuote): ProposalContent {
  const p = rec(raw.proposal)
  return {
    included: asStringArray(p.included),
    excluded: asStringArray(p.excluded),
  }
}

function mapReadiness(raw: RawErpQuote): ProposalReadinessItem[] {
  return asArray(raw.readiness).map((r, i) => {
    const ro = rec(r)
    return {
      id: asString(ro.id, `ready-${i + 1}`),
      label: asString(ro.label, "—"),
      done: asBool(ro.done),
      step: normStepId(ro.step, "setup"),
    }
  })
}

/* ------------------------------------------------------------------ */
/* Public adapter                                                      */
/* ------------------------------------------------------------------ */

/**
 * Convert a raw ERP quote payload into the normalised V2 `Quote`.
 * Pure and defensive: safe to call with `null`, `{}` or partial data.
 */
export function adaptErpQuote(raw: RawErpQuote | null | undefined, fallbackId: string): Quote {
  const safeRaw = rec(raw) as RawErpQuote
  const id = asString(safeRaw.id, fallbackId) || fallbackId
  const meta = mapMeta(safeRaw, id)
  return {
    id,
    meta,
    client: mapClient(safeRaw),
    steps: mapSteps(safeRaw),
    setupFields: mapSetupFields(safeRaw),
    itinerary: mapItinerary(safeRaw),
    hotelCities: mapHotelCities(safeRaw),
    experiences: mapExperiences(safeRaw),
    transport: mapTransport(safeRaw),
    pricing: mapPricing(safeRaw, meta.currency),
    proposal: mapProposal(safeRaw),
    readiness: mapReadiness(safeRaw),
  }
}

/* ------------------------------------------------------------------ */
/* Data loader (Phase B integration point)                            */
/* ------------------------------------------------------------------ */

/** Result envelope so the page can render loading / empty / error states. */
export interface LoadQuoteResult {
  quote: Quote | null
  /** True when demo fallback data was substituted (dev/demo only). */
  usedFallback: boolean
  /** Human-readable error, or null on success. */
  error: string | null
}

/** Demo fallback is only permitted outside production. */
function demoFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_QUOTE_DEMO === "1"
}

/* ------------------------------------------------------------------ */
/* Phase B — real ERP data source (READ-ONLY)                          */
/* ------------------------------------------------------------------ */
//
// fetchErpQuote loads the existing quote via the SAME server helper the classic
// quote-detail page uses (adminPageFetchJson → /api/quotes/:id and
// /api/quotes/:id/itinerary). It maps the response into RawErpQuote; the
// existing adaptErpQuote then does final type coercion. No writes, no new
// endpoints, no pricing math — totals are passed through 1:1.
//
// These interfaces capture ONLY the fields read from the existing API
// responses (mirroring app/quotes/[id]/page.tsx `Quote` and
// QuoteItineraryTab.tsx `QuoteItineraryResponse`). Everything is optional/loose
// so a partial payload degrades gracefully instead of throwing.

interface ApiRef {
  id?: string | null
  name?: string | null
}
interface ApiServiceType {
  id?: string | null
  name?: string | null
  code?: string | null
}
interface ApiService {
  id?: string | null
  name?: string | null
  category?: string | null
  serviceType?: ApiServiceType | null
}
interface ApiVehicleRate {
  routeName?: string | null
  route?: {
    name?: string | null
    fromPlace?: { city?: string | null; name?: string | null } | null
    toPlace?: { city?: string | null; name?: string | null } | null
  } | null
  vehicle?: { name?: string | null; vehicleType?: string | null } | null
  serviceType?: ApiServiceType | null
  supplier?: ApiRef | null
}
interface ApiQuoteItem {
  id?: string | null
  hotelId?: string | null
  activityId?: string | null
  ticketRateVariantId?: string | null
  routeId?: string | null
  touringRouteId?: string | null
  transportServiceTypeId?: string | null
  serviceDate?: string | null
  totalSell?: number | null
  sellPrice?: number | null
  pricingDescription?: string | null
  excursionTemplateComponentOptional?: boolean | null
  activity?: { name?: string | null } | null
  service?: ApiService | null
  appliedVehicleRate?: ApiVehicleRate | null
  touringRoute?: { name?: string | null; startCity?: string | null } | null
  touringRoutePricing?: { vehicle?: { name?: string | null } | null; supplier?: ApiRef | null } | null
  hotel?: { name?: string | null } | null
}
interface ApiHotelOption {
  id?: string | null
  city?: string | null
  hotelNameSnapshot?: string | null
  roomType?: string | null
  mealPlan?: string | null
  nights?: number | null
  isPrimary?: boolean | null
}
interface ApiQuoteOption {
  hotelCategory?: { name?: string | null } | null
  hotelOptions?: ApiHotelOption[] | null
}
interface ApiQuote {
  id?: string | null
  quoteNumber?: string | null
  quoteType?: string | null
  title?: string | null
  quoteCurrency?: string | null
  proposalLanguage?: string | null
  inclusionsText?: string | null
  exclusionsText?: string | null
  status?: string | null
  travelStartDate?: string | null
  nightCount?: number | null
  adults?: number | null
  children?: number | null
  roomCount?: number | null
  totalCost?: number | null
  totalSell?: number | null
  pricePerPax?: number | null
  sentAt?: string | null
  agent?: { firstName?: string | null; lastName?: string | null } | null
  company?: { id?: string | null; name?: string | null } | null
  contact?: { id?: string | null; firstName?: string | null; lastName?: string | null } | null
  quoteItems?: ApiQuoteItem[] | null
  quoteOptions?: ApiQuoteOption[] | null
}
interface ApiItineraryLinked {
  serviceDate?: string | null
  activityName?: string | null
  service?: ApiService | null
  hotel?: { name?: string | null; city?: string | null } | null
  appliedVehicleRate?: { routeName?: string | null; vehicle?: { name?: string | null } | null } | null
}
interface ApiItineraryDay {
  id?: string | null
  dayNumber?: number | null
  title?: string | null
  overnightCity?: string | null
  dayItems?: Array<{ quoteService?: ApiItineraryLinked | null }> | null
}
interface ApiItinerary {
  days?: ApiItineraryDay[] | null
}

function splitTextLines(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-*]+/, "").trim())
    .filter((l) => l.length > 0)
}

function addDaysIso(startIso: string | null | undefined, days: number): string {
  if (!startIso) return ""
  const d = new Date(startIso)
  if (Number.isNaN(d.getTime())) return ""
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDayDate(startIso: string | null | undefined, dayNumber: number): string {
  if (!startIso) return ""
  const d = new Date(startIso)
  if (Number.isNaN(d.getTime())) return ""
  d.setDate(d.getDate() + Math.max(0, dayNumber - 1))
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

// V2's HotelCategory is 3|4|5|"Camp" with no "unknown" member. Use the real
// option category name when it yields a star digit (or clearly a camp); when it
// does not, fall back to a conservative 3 rather than inventing a higher rating
// or implying a desert camp.
function mapHotelCategory(name: string | null | undefined): number | string {
  const n = (name ?? "").toLowerCase()
  if (/camp|tent|bedouin/.test(n)) return "Camp"
  const digit = n.match(/[345]/)
  if (digit) return Number(digit[0])
  return 3
}

function isTransportItem(it: ApiQuoteItem): boolean {
  return Boolean(it.appliedVehicleRate || it.routeId || it.touringRouteId || it.transportServiceTypeId)
}

function isHotelItem(it: ApiQuoteItem): boolean {
  return it.hotelId != null
}

/** Map an existing ERP quote (+ optional itinerary) into the loose RawErpQuote. */
function mapErpQuoteToRaw(q: ApiQuote, itin: ApiItinerary | null, fallbackId: string): RawErpQuote {
  const id = q.id ?? fallbackId
  const pax = (q.adults ?? 0) + (q.children ?? 0)
  const nights = q.nightCount ?? 0
  const currency = q.quoteCurrency ?? "USD"
  const totalCost = q.totalCost ?? 0
  const totalSell = q.totalSell ?? 0
  const ownerName = q.agent ? [q.agent.firstName, q.agent.lastName].filter(Boolean).join(" ").trim() : ""
  const contactName = q.contact ? [q.contact.firstName, q.contact.lastName].filter(Boolean).join(" ").trim() : ""

  // ---- itinerary (rich, from the itinerary endpoint) ----
  const days = itin?.days ?? []
  const itinerary = days.map((d) => {
    const items = d.dayItems ?? []
    const hotelItem = items.find((di) => di.quoteService?.hotel)
    const transportRate = items.find((di) => di.quoteService?.appliedVehicleRate)?.quoteService?.appliedVehicleRate
    const visits: string[] = []
    for (const di of items) {
      const s = di.quoteService
      if (!s || s.hotel || s.appliedVehicleRate) continue
      const label = s.activityName ?? s.service?.name ?? ""
      if (label) visits.push(label)
    }
    return {
      id: d.id ?? `day-${d.dayNumber ?? 0}`,
      day: d.dayNumber ?? 0,
      date: formatDayDate(q.travelStartDate, d.dayNumber ?? 0),
      overnightCity: d.overnightCity ?? "",
      title: d.title ?? "",
      visits,
      meals: [], // per-meal B/L/D not represented in source; rendered as missing
      hotelAssigned: hotelItem?.quoteService?.hotel?.name ?? null,
      transportAssigned: transportRate ? transportRate.routeName ?? transportRate.vehicle?.name ?? null : null,
      warnings: [],
    }
  })

  // ---- hotels (from quoteOptions.hotelOptions, grouped by city) ----
  const cityMap = new Map<string, { city: string; nights: number; options: unknown[] }>()
  for (const opt of q.quoteOptions ?? []) {
    const category = mapHotelCategory(opt.hotelCategory?.name)
    for (const ho of opt.hotelOptions ?? []) {
      const city = ho.city ?? "—"
      if (!cityMap.has(city)) cityMap.set(city, { city, nights: ho.nights ?? 0, options: [] })
      const block = cityMap.get(city)!
      block.nights = Math.max(block.nights, ho.nights ?? 0)
      block.options.push({
        id: ho.id ?? `${city}-opt-${block.options.length + 1}`,
        name: ho.hotelNameSnapshot ?? "—",
        city,
        category,
        // The source carries no contract-status enum: a selected hotel maps to
        // "on-request" (never assume "contracted"); an unselected one to
        // "no-contract". We only ever claim "contracted" with proof — which we
        // do not have here.
        contractStatus: ho.isPrimary ? "on-request" : "no-contract",
        mealPlan: ho.mealPlan ?? "—",
        roomingSummary: ho.roomType ?? "—",
        ratePerNight: 0,
        nights: ho.nights ?? 0,
        selected: Boolean(ho.isPrimary),
        cityTax: 0,
      })
    }
  }
  const hotelCities = Array.from(cityMap.values())

  // ---- experiences + transport + pricing lines (from quoteItems) ----
  const experiences: unknown[] = []
  const transport: unknown[] = []
  const pricingLines: unknown[] = []
  for (const it of q.quoteItems ?? []) {
    const sell = it.totalSell ?? it.sellPrice ?? 0
    const lineLabel =
      it.hotel?.name ??
      it.activity?.name ??
      it.appliedVehicleRate?.routeName ??
      it.touringRoute?.name ??
      it.service?.name ??
      "Service"
    pricingLines.push({
      id: it.id ?? `line-${pricingLines.length + 1}`,
      label: lineLabel,
      amount: sell,
      status: sell > 0 ? "complete" : "partial",
      note: it.pricingDescription ?? "",
    })

    if (isHotelItem(it)) continue // hotels are sourced from quoteOptions above

    if (isTransportItem(it)) {
      const vr = it.appliedVehicleRate
      const fromCity = vr?.route?.fromPlace?.city
      const toCity = vr?.route?.toPlace?.city
      const route =
        vr?.routeName ??
        (fromCity && toCity ? `${fromCity} → ${toCity}` : null) ??
        it.touringRoute?.name ??
        it.service?.name ??
        "—"
      const supplierName = vr?.supplier?.name ?? it.touringRoutePricing?.supplier?.name ?? null
      transport.push({
        id: it.id ?? `transport-${transport.length + 1}`,
        route,
        type: it.touringRouteId || it.touringRoute ? "Touring" : "Transfer",
        day: it.serviceDate ?? "—",
        vehicleClass: vr?.vehicle?.name ?? it.touringRoutePricing?.vehicle?.name ?? "—",
        supplier: supplierName ?? "Unassigned",
        // No supplier-contract enum in source: assigned → on-request, else no-contract.
        supplierContract: supplierName ? "on-request" : "no-contract",
        priceStatus: sell > 0 ? "complete" : "missing",
        amount: sell > 0 ? sell : null,
        warning: sell > 0 ? null : "No rate available",
      })
      continue
    }

    // everything else = experience / entrance / service
    experiences.push({
      id: it.id ?? `exp-${experiences.length + 1}`,
      name: it.activity?.name ?? it.service?.name ?? "—",
      city: "—",
      type: it.service?.serviceType?.name ?? (it.activityId ? "Activity" : "Service"),
      day: it.serviceDate ?? "—",
      status: sell > 0 ? "complete" : "partial",
      amount: sell,
      included: !it.excursionTemplateComponentOptional,
    })
  }

  // ---- destination (best-effort; never invented) ----
  const destination = days.find((d) => d.overnightCity)?.overnightCity ?? hotelCities[0]?.city ?? "—"

  // ---- pricing (1:1 from the engine; margin/markup are display arithmetic) ----
  const pricing = {
    lines: pricingLines,
    netCost: totalCost,
    markupPercent: totalCost > 0 ? Math.round(((totalSell - totalCost) / totalCost) * 100) : 0,
    margin: totalSell - totalCost,
    sellingPrice: totalSell,
    pax,
    perPerson: q.pricePerPax ?? (pax > 0 ? totalSell / pax : 0),
    currency,
  }

  // ---- readiness (derived from data presence; no server-side checklist yet) ----
  const hotelsSelected = hotelCities.some((c) =>
    (c.options as Array<{ selected?: boolean }>).some((o) => o.selected),
  )
  const transportPriced =
    transport.length > 0 && (transport as Array<{ amount: number | null }>).every((t) => t.amount != null)
  const readiness = [
    { id: "r-setup", label: "Client, dates and pax confirmed", done: Boolean(q.company && q.travelStartDate && pax > 0), step: "setup" },
    { id: "r-itinerary", label: "Itinerary has days", done: itinerary.length > 0, step: "itinerary" },
    { id: "r-hotels", label: "Hotels selected for each stop", done: hotelsSelected, step: "hotels" },
    { id: "r-experiences", label: "Experiences confirmed", done: experiences.length > 0, step: "experiences" },
    { id: "r-transport", label: "Transport priced for every service", done: transportPriced, step: "transport" },
    { id: "r-pricing", label: "Pricing available", done: totalSell > 0, step: "pricing" },
  ]

  // ---- workflow step statuses (drive the stepper badges) ----
  const stepStatus = (done: boolean, partial = false) => (done ? "complete" : partial ? "partial" : "missing")
  const steps = [
    { id: "setup", status: stepStatus(Boolean(q.company && q.travelStartDate)) },
    { id: "itinerary", status: stepStatus(itinerary.length > 0) },
    { id: "hotels", status: stepStatus(hotelsSelected, hotelCities.length > 0) },
    { id: "experiences", status: stepStatus(experiences.length > 0) },
    { id: "transport", status: stepStatus(transportPriced, transport.length > 0) },
    { id: "pricing", status: stepStatus(totalSell > 0) },
    { id: "proposal", status: stepStatus(splitTextLines(q.inclusionsText).length > 0) },
  ]

  // ---- setup fields (read-only display) ----
  const setupFields = [
    { group: "client", label: "Agency / Client", value: q.company?.name ?? "—" },
    { group: "client", label: "Booking contact", value: contactName || "—" },
    { group: "trip", label: "Destination", value: destination },
    { group: "trip", label: "Travel start", value: q.travelStartDate ?? "—" },
    { group: "trip", label: "Duration", value: nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "—" },
    { group: "config", label: "Pax", value: pax > 0 ? `${pax}` : "—" },
    { group: "config", label: "Rooms", value: q.roomCount ? `${q.roomCount}` : "—" },
    { group: "config", label: "Currency", value: currency },
    { group: "config", label: "Operations owner", value: ownerName || "—" },
  ]

  return {
    id,
    title: q.title ?? "Untitled quote",
    reference: q.quoteNumber ?? id,
    quoteType: q.quoteType ?? "FIT",
    destination,
    marketLanguage: q.proposalLanguage ?? "—",
    startDate: q.travelStartDate ?? "",
    endDate: addDaysIso(q.travelStartDate, nights),
    nights,
    pax,
    tourLeaders: 0,
    rooming: q.roomCount ? `${q.roomCount} room${q.roomCount === 1 ? "" : "s"}` : "—",
    currency,
    status: q.status ?? "draft",
    owner: ownerName || "—",
    lastSaved: q.sentAt ?? "—",
    client: {
      id: q.contact?.id ?? "client",
      contactName: contactName || "—",
      agency: {
        id: q.company?.id ?? "agency",
        name: q.company?.name ?? "—",
        country: "—",
        marketLanguage: "—",
      },
    },
    steps,
    setupFields,
    itinerary,
    hotelCities,
    experiences,
    transport,
    pricing,
    proposal: {
      included: splitTextLines(q.inclusionsText),
      excluded: splitTextLines(q.exclusionsText),
    },
    readiness,
  }
}

/**
 * Load the raw ERP quote by id (READ-ONLY) from the existing API, via the same
 * server helper / endpoints the classic quote-detail page uses. Returns `null`
 * when the quote is not found (→ empty state in prod, demo fallback in dev).
 * Auth redirects from adminPageFetchJson propagate (re-thrown by loadQuoteV2).
 */
// The hydrated /quotes/:id endpoint loads many relations and is heavy (commonly
// ~8s against a remote DB), so the 8s default timeout is too tight for this
// single critical-path read. Give it (and the itinerary) more headroom.
const BUILDER_V2_QUOTE_TIMEOUT_MS = 20_000
const BUILDER_V2_ITINERARY_TIMEOUT_MS = 15_000

async function fetchErpQuote(id: string): Promise<RawErpQuote | null> {
  const main = await adminPageFetchJson<ApiQuote | null>(`/api/quotes/${id}`, "Builder V2 quote", {
    cache: "no-store",
    allow404: true,
    timeoutMs: BUILDER_V2_QUOTE_TIMEOUT_MS,
  })

  if (!main) return null

  // Rich day-by-day itinerary is best-effort: its absence must not break render.
  let itinerary: ApiItinerary | null = null
  try {
    itinerary = await adminPageFetchJson<ApiItinerary | null>(`/api/quotes/${id}/itinerary`, "Builder V2 itinerary", {
      cache: "no-store",
      allow404: true,
      timeoutMs: BUILDER_V2_ITINERARY_TIMEOUT_MS,
    })
  } catch (err) {
    if (isNextRedirectError(err)) throw err
    itinerary = null
  }

  return mapErpQuoteToRaw(main, itinerary, id)
}

/**
 * Load + normalise a quote for the V2 builder route.
 *
 * - Real data: fetched via `fetchErpQuote`, then normalised by `adaptErpQuote`.
 * - Not found / no endpoint: in dev/demo, falls back to `demoQuote`; in
 *   production it returns `quote: null` so the UI shows the empty state.
 * - Thrown errors are caught and surfaced via the `error` field.
 */
export async function loadQuoteV2(id: string): Promise<LoadQuoteResult> {
  try {
    const raw = await fetchErpQuote(id)

    if (raw) {
      // Real ERP data exists — normalise and use it. Demo data is NOT shown.
      return { quote: adaptErpQuote(raw, id), usedFallback: false, error: null }
    }

    // No real data. Use demo content only in dev/demo mode.
    if (demoFallbackAllowed()) {
      return { quote: { ...demoQuote, id }, usedFallback: true, error: null }
    }

    // Production with no record found → empty state, never demo data.
    return { quote: null, usedFallback: false, error: null }
  } catch (err) {
    // Auth/redirect signals (e.g. missing/expired session → /login) must NOT be
    // swallowed into an error state — let Next.js handle the redirect.
    if (isNextRedirectError(err)) throw err
    const message = err instanceof Error ? err.message : "Failed to load quote."
    return { quote: null, usedFallback: false, error: message }
  }
}
