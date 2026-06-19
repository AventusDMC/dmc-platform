// Production-ready domain contracts for the Quote Builder V2.
//
// These interfaces describe the shape the UI expects. They are intentionally
// decoupled from any backend / ORM model — map your Prisma rows (or API
// payloads) into these types in a server component or loader, then pass the
// resulting `Quote` into <QuoteBuilderV2 />. No business logic, no pricing
// formulas, and no mock data live here.

export type StepId =
  | "setup"
  | "itinerary"
  | "hotels"
  | "experiences"
  | "transport"
  | "pricing"
  | "proposal"

/** Generic readiness state used across components and badges. */
export type Status = "complete" | "partial" | "missing"

/** Lifecycle state of the quote itself. */
export type QuoteStatus = "draft" | "in-review" | "sent" | "confirmed"

export type QuoteType = "FIT" | "Group"

/** Supplier / hotel contracting state. */
export type ContractStatus = "contracted" | "on-request" | "no-contract"

export type Meal = "B" | "L" | "D"

export type HotelCategory = 5 | 4 | 3 | "Camp" | "Unknown"

export type TransportType = "Transfer" | "Touring" | "Package"

/** A travel agency / B2B buyer placing the request. */
export interface Agency {
  id: string
  name: string
  country: string
  marketLanguage: string
}

/** The booking contact tied to an agency. */
export interface Client {
  id: string
  agency: Agency
  contactName: string
  contactEmail?: string
}

/** One entry in the workflow stepper. */
export interface WorkflowStep {
  id: StepId
  label: string
  description: string
  status: Status
}

/** A read-only key/value field shown on the Setup step. */
export interface SetupField {
  label: string
  value: string
  group: "client" | "trip" | "config"
}

/** A single day of the day-by-day program. */
export interface ItineraryDay {
  id: string
  day: number
  date: string
  overnightCity: string
  title: string
  visits: string[]
  meals: Meal[]
  hotelAssigned: string | null
  transportAssigned: string | null
  warnings: string[]
  /** Client-facing descriptive narrative (QuoteItineraryDay.notes). */
  notes?: string | null
}

/** A selectable hotel option for a given overnight stop. */
export interface HotelSelection {
  id: string
  name: string
  city: string
  category: HotelCategory
  contractStatus: ContractStatus
  mealPlan: string
  roomingSummary: string
  ratePerNight: number
  nights: number
  selected: boolean
  cityTax: number
}

/** Hotel options grouped by overnight city. */
export interface HotelCityBlock {
  city: string
  nights: number
  options: HotelSelection[]
}

/** A sightseeing visit, entrance fee or optional activity. */
export interface Experience {
  id: string
  name: string
  city: string
  type: string
  day: string
  status: Status
  amount: number
  included: boolean
}

/** A ground transport / transfer service. */
export interface TransportService {
  id: string
  route: string
  type: TransportType
  day: string
  vehicleClass: string
  supplier: string
  supplierContract: ContractStatus
  priceStatus: Status
  amount: number | null
  warning: string | null
}

/** A single cost component line in the pricing breakdown. */
export interface CostLine {
  id: string
  label: string
  amount: number
  status: Status
  note: string
}

/**
 * Pre-computed pricing breakdown. All figures are produced by the backend
 * pricing engine — the UI only formats and displays them, it never recomputes.
 */
export interface PricingBreakdown {
  lines: CostLine[]
  netCost: number
  markupPercent: number
  margin: number
  sellingPrice: number
  pax: number
  perPerson: number
  currency: string
}

/** Inclusions / exclusions shown on the client-facing proposal. */
export interface ProposalContent {
  included: string[]
  excluded: string[]
}

/** A single pre-flight check; `step` links it back to where it is resolved. */
export interface ProposalReadinessItem {
  id: string
  label: string
  done: boolean
  step: StepId
}

/** High-level descriptive metadata for the quote. */
export interface QuoteMeta {
  title: string
  reference: string
  quoteType: QuoteType
  destination: string
  marketLanguage: string
  startDate: string
  endDate: string
  nights: number
  pax: number
  tourLeaders: number
  rooming: string
  currency: string
  status: QuoteStatus
  owner: string
  lastSaved: string
}

/** The full aggregate the Quote Builder renders. */
export interface Quote {
  id: string
  meta: QuoteMeta
  client: Client
  steps: WorkflowStep[]
  setupFields: SetupField[]
  itinerary: ItineraryDay[]
  hotelCities: HotelCityBlock[]
  experiences: Experience[]
  transport: TransportService[]
  pricing: PricingBreakdown
  proposal: ProposalContent
  readiness: ProposalReadinessItem[]
}

/** A blocking/missing item surfaced in the summary sidebar. */
export interface BlockingItem {
  id: string
  label: string
  step: StepId
}

/** Per-component readiness used by the summary sidebar. */
export interface ComponentStatus {
  label: string
  step: StepId
  status: Status
}

/** Suggested next action shown to the operator. */
export interface NextAction {
  label: string
  step: StepId
}
