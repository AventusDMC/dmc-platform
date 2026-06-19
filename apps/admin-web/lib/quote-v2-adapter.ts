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

/**
 * PHASE B INTEGRATION POINT — replace the body of this function.
 *
 * Fetch the raw ERP quote by id. This is the ONLY place that should know how
 * data is retrieved (REST/GraphQL/Prisma/server action). Return the raw
 * payload, or `null` when not found. Do NOT map here — return raw and let
 * `adaptErpQuote` normalise it.
 *
 * Example (Phase B):
 *   const res = await fetch(`${process.env.ERP_API_URL}/quotes/${id}`, {
 *     headers: { Authorization: `Bearer ${process.env.ERP_API_TOKEN}` },
 *     cache: "no-store",
 *   })
 *   if (!res.ok) return null
 *   return (await res.json()) as RawErpQuote
 */
async function fetchErpQuote(_id: string): Promise<RawErpQuote | null> {
  // No ERP endpoint is wired yet (Phase A). Returning null triggers the
  // documented dev fallback / empty-state path below.
  return null
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
    const message = err instanceof Error ? err.message : "Failed to load quote."
    return { quote: null, usedFallback: false, error: message }
  }
}
