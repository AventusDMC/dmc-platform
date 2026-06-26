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
  | "passengers"
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
  /**
   * Language tag of `notes` (QuoteItineraryDay.notesLanguage), e.g. en|es|pt|ar.
   * Display-only — used for the proposal notes-language advisory.
   */
  notesLanguage?: string | null
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
  /**
   * The owning QuoteOption (option-set) id. Present only for real
   * `QuoteHotelOption` rows — needed to PATCH the option. Absent for
   * itinerary-fallback synthetic hotels.
   */
  optionId?: string
  /**
   * True only for real `QuoteHotelOption` rows whose primary marker can be
   * changed. Itinerary-fallback hotels are always read-only (false).
   */
  editable: boolean
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
  /** Underlying QuoteItem id — present for real items; required to edit display text. */
  quoteItemId?: string
  /**
   * True only when this item exposes editable client-facing display text. In V2
   * this is limited to EXTERNAL-PACKAGE items (the only experience text the
   * proposal renders from per-item fields). Normal experiences stay read-only.
   */
  editableText?: boolean
  /** External-package client-facing text (rendered by the proposal). Edited inertly. */
  externalClientDescription?: string | null
  externalIncludes?: string | null
  externalExcludes?: string | null
  externalHotelsOrSimilar?: string | null
  /**
   * Meal-only pricing apply (PR5). `isMeal` gates the "Preview & apply meal
   * pricing" affordance; the remaining fields are the RAW persisted values used
   * to build the meal edit payload without parsing pricingDescription. unitCost
   * is reconstructed from costBaseAmount.
   */
  isMeal?: boolean
  customServiceName?: string | null
  unitCost?: number | null
  quantity?: number | null
  paxCount?: number | null
  currency?: string | null
  serviceDate?: string | null
  /**
   * Activity-only pricing apply. `isActivity` gates the "Preview & apply activity
   * pricing" affordance; the ids are the RAW persisted values used to rebuild the
   * activity edit payload (re-price at the current rate variant — rate selection
   * stays Classic). No pricingDescription parsing.
   */
  isActivity?: boolean
  activityId?: string | null
  activityRateVariantId?: string | null
  serviceId?: string | null
  dayCount?: number | null
  /**
   * Guide-only pricing apply. `isGuide` gates the "Preview & apply guide pricing"
   * affordance; the fields are the RAW persisted guide columns (PR #554) used to
   * rebuild the guide edit payload (no pricingDescription parsing). `guideOvernight`
   * is mapped to the backend `overnight` input field in the payload.
   */
  isGuide?: boolean
  guideType?: string | null
  guideDuration?: string | null
  guideOvernight?: boolean | null
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
  /** Underlying QuoteItem id — present for real items; required to edit display text. */
  quoteItemId?: string
  /** True when this transport line exposes an editable client-facing route label. */
  editableText?: boolean
  /** Client-facing transport route label (rendered by the proposal). Edited inertly. */
  transportLabel?: string | null
}

/**
 * A traveller on the quote — READ-ONLY summary for V2. Full passenger
 * management (add/edit/delete) lives in the classic builder. All fields are
 * PII/display; none affect pricing.
 */
export interface Passenger {
  id: string
  fullName: string
  /** Structured names — used to seed the edit form (display uses fullName). */
  firstName?: string | null
  lastName?: string | null
  gender?: string | null
  dateOfBirth?: string | null
  nationality?: string | null
  passportNumber?: string | null
  passportExpiry?: string | null
  dietaryNotes?: string | null
  mobilityNotes?: string | null
  emergencyContact?: string | null
  remarks?: string | null
  /**
   * Raw ISO date values (unformatted) used ONLY to seed the edit form's
   * `<input type="date">`. The display fields above stay human-formatted.
   */
  dateOfBirthRaw?: string | null
  passportExpiryRaw?: string | null
}

/**
 * A rooming group with its assigned passengers — READ-ONLY summary for V2.
 * Room assignment / occupancy editing lives in the classic builder. Occupancy
 * here is operational (who-sleeps-where); it is NOT a pricing input.
 */
export interface RoomingGroupSummary {
  id: string
  /** Room label (temporaryRoomLabel, or a derived "Room N"). */
  label: string
  /** Hotel name for the stay this room belongs to, when known. */
  hotel: string | null
  /** Itinerary day this room is scoped to (e.g. "Day 3: Petra"), when known. */
  day: string | null
  roomType: string | null
  occupancyType: string | null
  guideRoom: boolean
  leaderRoom: boolean
  notes: string | null
  /** Assigned passenger full names (display). */
  passengers: string[]
  /** Assigned passengers with ids — needed to unassign + to filter the add-list. */
  assignedPassengers: { id: string; name: string }[]
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
  /** Display label for the market/language (may be free text, e.g. "English (UK)"). */
  marketLanguage: string
  /** Normalized proposal language CODE (en | pt | es | ar), defaulting to "en". */
  proposalLanguage?: string
  startDate: string
  endDate: string
  nights: number
  pax: number
  tourLeaders: number
  rooming: string
  currency: string
  status: QuoteStatus
  /**
   * Raw backend lifecycle status (e.g. "DRAFT" | "SENT" | "ACCEPTED" |
   * "CONFIRMED" | "CANCELLED" …), uppercased. Used to gate "Mark as Sent"
   * (the display `status` above is a lossy 4-value mapping).
   */
  statusCode?: string
  /** Public proposal share token (QuoteQuote.publicToken). Null/absent = none. */
  publicToken?: string | null
  /** Whether the public proposal link is currently active (publicEnabled). */
  publicEnabled?: boolean
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
  /** Read-only passenger list (PII; no pricing impact). */
  passengers: Passenger[]
  /** Read-only rooming groups + assignments (operational; no pricing impact). */
  roomingGroups: RoomingGroupSummary[]
  /**
   * True when the passengers GET failed (vs returning a real empty list) — the
   * UI shows a non-blocking load warning instead of the "no passengers" empty
   * state, so a transient fetch error is never mistaken for "none added".
   */
  passengersLoadError?: boolean
  /** True when the rooming GET failed (vs returning a real empty list). */
  roomingLoadError?: boolean
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

/**
 * Result of the read-only dry-run pricing preview
 * (POST /api/quotes/:id/items/:itemId/preview). Mirrors the backend response.
 * Persisted nothing — used to display projected pricing before any apply.
 */
export interface PricingPreviewTotals {
  totalCost: number
  totalSell: number
}
export interface PricingPreviewResult {
  available: boolean
  blocked: boolean
  blockedReason?: string | null
  statusCode?: string | null
  pricingResolvable?: boolean
  quote?: {
    current: PricingPreviewTotals
    projected: PricingPreviewTotals | null
    delta: PricingPreviewTotals | null
  } | null
  item?: {
    current: PricingPreviewTotals
    projected: PricingPreviewTotals | null
    delta: PricingPreviewTotals | null
  } | null
  affectedItemCount?: number
  jordanPass?: { changed: boolean; affectedEntranceItems: unknown[] } | null
  warnings?: string[]
  reResolved?: { rates: boolean; fx: boolean }
}

/** Requests a pricing preview for an existing item edit. Read-only (no apply). */
export type PreviewItemHandler = (
  quoteItemId: string,
  payload: Record<string, unknown>,
) => Promise<PricingPreviewResult>

/** Result of the meal pricing apply (POST /api/quotes/:id/items/:itemId/apply-preview). */
export interface MealApplyResult {
  applied?: boolean
  available?: boolean
  blocked?: boolean
  blockedReason?: string | null
  integrityOk?: boolean
  item?: { before: PricingPreviewTotals; after: PricingPreviewTotals }
  quote?: { before: PricingPreviewTotals; after: PricingPreviewTotals }
  warnings?: string[]
}

/**
 * Applies a previously-previewed MEAL or ACTIVITY edit. Sends the SAME payload
 * used for the preview plus the previewToken and acknowledgedDelta. Resolves to
 * the apply result; rejects (Error message = backend code) on stale/invalid/blocked.
 */
export type ApplyItemPricingHandler = (
  quoteItemId: string,
  payload: Record<string, unknown>,
  previewToken: string,
  acknowledgedDelta: boolean,
) => Promise<MealApplyResult>

/** One sanitized row of the read-only V2 pricing-apply audit history. */
export interface PricingApplyAuditEntry {
  id: string
  timestamp: string
  actor: { name: string | null; email: string | null } | null
  quoteItemId: string | null
  serviceType: string | null
  itemName: string | null
  previousItemTotalCost: number | null
  newItemTotalCost: number | null
  deltaItemCost: number | null
  previousItemTotalSell: number | null
  newItemTotalSell: number | null
  deltaItemSell: number | null
  newQuoteTotalCost: number | null
  newQuoteTotalSell: number | null
  deltaQuoteCost: number | null
  deltaQuoteSell: number | null
  acknowledgedDelta: boolean | null
  integrityOk: boolean | null
  appliedPayload?: Record<string, unknown>
}

/** Loads the read-only pricing-apply audit entries for the current quote. */
export type LoadApplyAuditHandler = () => Promise<PricingApplyAuditEntry[]>
