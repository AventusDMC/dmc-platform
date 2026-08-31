/**
 * CP-N3b2c2a — Finance quote-detail mapper (READ-ONLY, additive, pure).
 *
 * Projects the raw hydrated quote (QuotesService.findOne / loadQuoteState) into the
 * closed {@link FinanceQuoteDetail} allowlist for `GET /quotes/:id/finance-detail`.
 *
 * Composition: build the operational projection once via {@link mapQuoteToOperational}
 * (reused for the sell-side branches AND the cost-free currentPricing / priceComputation
 * re-derivation), then EXPLICITLY assign every FinanceQuoteDetail root field — taking the
 * cost-bearing branches (totalCost, quoteItems, quoteOptions, quoteItineraryDays, booking)
 * from the finance builders below, and every other field from the operational output.
 *
 * Design invariants:
 *  - EXPLICIT PROPERTY ASSIGNMENT ONLY. No `...spread`, no Object.assign, no JSON clone,
 *    no recursive scrubber, no denylist. A newly added Prisma column is invisible until
 *    explicitly added to a builder here.
 *  - `unknown` / `Record<string, unknown>` appear ONLY inside the private JSON parsers /
 *    type guards below; every boundary value is narrowed by exact-key validation before
 *    use and is NEVER copied or stringified into output.
 *  - The operational DTO/mapper is NOT modified; its non-exported coercers / leaf mappers
 *    are re-implemented here locally with identical semantics (only `mapQuoteToOperational`
 *    and `RawOperationalQuote` are imported), so shared fields serialize identically.
 *  - Source object is never mutated; every returned object/array is freshly constructed.
 */

import { mapQuoteToOperational, RawOperationalQuote } from './quote-operational.mapper';
import {
  OperationalHotelCategory,
  OperationalItemActivity,
  OperationalItemEntranceFee,
  OperationalItemHotel,
  OperationalItemService,
  OperationalItemTouringRoute,
  OperationalMatchedDiscriminators,
  OperationalPlace,
  OperationalRoomCategory,
  OperationalServiceType,
  OperationalTouringRouteStop,
  OperationalTransportServiceType,
  OperationalVehicle,
  OperationalVehicleRoute,
} from './quote-operational.dto';
import {
  FinanceBookingRef,
  FinanceContractRef,
  FinanceDayItem,
  FinanceHotelFactSheet,
  FinanceHotelOption,
  FinanceHotelOptionHotel,
  FinanceItemAppliedVehicleRate,
  FinanceItemTouringRoutePricing,
  FinanceItineraryDay,
  FinancePackageMatrixRow,
  FinancePromotionExplanationItem,
  FinanceQuoteDetail,
  FinanceQuoteItem,
  FinanceQuoteOption,
  FinanceSupplierRef,
} from './quote-finance-detail.dto';

// ---------------------------------------------------------------------------
// Raw input structural types (describe ONLY the fields the mapper reads). All
// optional/nullable so any richer hydrated row is assignable. `unknown` appears ONLY
// on the three arbitrary-JSON fields, each narrowed by a private parser below.
// ---------------------------------------------------------------------------

type RawDateish = Date | string | null | undefined;

interface RawHotel { id?: string | null; name?: string | null; city?: string | null; category?: string | null; preferenceRank?: number | null; }
interface RawRoomCategory { id?: string | null; name?: string | null; }
interface RawActivity { id?: string | null; name?: string | null; }
interface RawEntranceFee { siteName?: string | null; }
interface RawServiceType { code?: string | null; name?: string | null; }
interface RawService { name?: string | null; serviceType?: RawServiceType | null; }
interface RawStop { id?: string | null; order?: number | null; city?: string | null; location?: string | null; notes?: string | null; }
interface RawTouringRoute { name?: string | null; mainDestinations?: string | null; stops?: RawStop[] | null; }
interface RawPlace { city?: string | null; }
interface RawRoute { fromPlace?: RawPlace | null; toPlace?: RawPlace | null; }
interface RawVehicle { name?: string | null; vehicleClass?: string | null; }
interface RawSupplier { name?: string | null; }
interface RawTransportServiceType { code?: string | null; name?: string | null; }
interface RawAppliedVehicleRate { routeName?: string | null; route?: RawRoute | null; vehicle?: RawVehicle | null; serviceType?: RawTransportServiceType | null; supplier?: RawSupplier | null; }
interface RawTouringRoutePricing { vehicle?: RawVehicle | null; transportServiceType?: RawTransportServiceType | null; supplier?: RawSupplier | null; }
interface RawHotelCategory { id?: string | null; name?: string | null; }
interface RawMatchedDiscriminators { roomCategoryId?: string | null; mealPlan?: string | null; mealPlanCode?: string | null; occupancyType?: string | null; seasonName?: string | null; serviceDate?: string | null; optionId?: string | null; }
interface FinanceRawContract { name?: string | null; }

interface FinanceRawItem {
  id?: string | null; quoteId?: string | null; optionId?: string | null; serviceId?: string | null;
  activityId?: string | null; entranceFeeId?: string | null; itineraryId?: string | null;
  packageTemplateId?: string | null; packageTemplateDayId?: string | null; packageTemplateComponentId?: string | null;
  excursionTemplateId?: string | null; excursionTemplateComponentId?: string | null; excursionTemplateComponentOptional?: boolean | null;
  quantity?: number | null; paxCount?: number | null; participantCount?: number | null; adultCount?: number | null;
  childCount?: number | null; roomCount?: number | null; nightCount?: number | null; dayCount?: number | null;
  sellPrice?: number | null; totalSell?: number | null; sortOrder?: number | null; createdAt?: RawDateish; updatedAt?: RawDateish;
  jordanPassCovered?: boolean | null; currency?: string | null; quoteCurrency?: string | null; customServiceName?: string | null;
  transportLabel?: string | null; standaloneTransfer?: boolean | null; guideType?: string | null; guideDuration?: string | null;
  guideOvernight?: boolean | null; serviceDate?: RawDateish; startTime?: string | null; pickupTime?: string | null;
  pickupLocation?: string | null; meetingPoint?: string | null; reconfirmationRequired?: boolean | null; reconfirmationDueAt?: RawDateish;
  hotelId?: string | null; roomCategoryId?: string | null; seasonName?: string | null; mealPlan?: string | null; occupancyType?: string | null;
  touringRouteId?: string | null; externalPackageCountry?: string | null; externalPackageName?: string | null;
  externalStartDay?: number | null; externalEndDay?: number | null; externalStartDate?: RawDateish; externalEndDate?: RawDateish;
  externalPricingBasis?: string | null; externalIncludes?: string | null; externalExcludes?: string | null;
  externalHotelsOrSimilar?: string | null; externalClientDescription?: string | null;
  totalCost?: number | null; baseCost?: number | null; costBaseAmount?: number | null; overrideCost?: number | null;
  useOverride?: boolean | null; overrideReason?: string | null; markupPercent?: number | null; markupAmount?: number | null;
  jordanPassSavingsJod?: number | null; pricingDescription?: string | null; baseSell?: number | null;
  externalNetCost?: number | null; externalSupplierName?: string | null; externalInternalNotes?: string | null;
  externalPackageSingleSupplement?: number | null;
  externalPackagePricingMatrixJson?: unknown;   // JSON boundary → parseFinanceMatrix
  promotionExplanation?: unknown;                // JSON boundary → parseFinancePromotion
  contract?: FinanceRawContract | null;
  hotel?: RawHotel | null; roomCategory?: RawRoomCategory | null; activity?: RawActivity | null; entranceFee?: RawEntranceFee | null;
  service?: RawService | null; touringRoute?: RawTouringRoute | null;
  appliedVehicleRate?: RawAppliedVehicleRate | null; touringRoutePricing?: RawTouringRoutePricing | null;
}
interface FinanceRawDayItem { id?: string | null; dayId?: string | null; quoteServiceId?: string | null; sortOrder?: number | null; notes?: string | null; isActive?: boolean | null; quoteService?: FinanceRawItem | null; }
interface FinanceRawDay {
  id?: string | null; quoteId?: string | null; packageTemplateId?: string | null; packageTemplateDayId?: string | null;
  dayNumber?: number | null; title?: string | null; notes?: string | null; notesLanguage?: string | null; country?: string | null;
  transportDayType?: string | null; vehicleRetained?: boolean | null; vehicleReleased?: boolean | null; inRetainedBlock?: boolean | null;
  overnightCity?: string | null; vehicleReturnsToBase?: boolean | null; sortOrder?: number | null; isActive?: boolean | null;
  createdAt?: RawDateish; updatedAt?: RawDateish; dayItems?: FinanceRawDayItem[] | null;
}
interface FinanceRawFactSheet { shortDescription?: string | null; highlightsJson?: unknown; amenitiesJson?: unknown; }
interface FinanceRawHotelOptionHotel { id?: string | null; name?: string | null; city?: string | null; category?: string | null; preferenceRank?: number | null; factSheet?: FinanceRawFactSheet | null; }
interface FinanceRawHotelOption {
  id?: string | null; quoteOptionId?: string | null; city?: string | null; hotelId?: string | null; roomCategoryId?: string | null;
  hotelNameSnapshot?: string | null; roomType?: string | null; mealPlan?: string | null; mealPlanCode?: string | null;
  nights?: number | null; isPrimary?: boolean | null; notes?: string | null; createdAt?: RawDateish; updatedAt?: RawDateish;
  hotel?: FinanceRawHotelOptionHotel | null; roomCategory?: RawRoomCategory | null; matchedPricedQuoteItemId?: string | null;
  pricingMatchStatus?: string | null; pricingMatchReason?: string | null; matchedDiscriminators?: RawMatchedDiscriminators | null;
}
interface FinanceRawOption {
  id?: string | null; quoteId?: string | null; kind?: string | null; name?: string | null; notes?: string | null;
  pricingMode?: string | null; hotelCategoryId?: string | null; createdAt?: RawDateish; updatedAt?: RawDateish;
  totalPrice?: number | null; totalSell?: number | null; pricePerPax?: number | null;
  totalCost?: number | null; profit?: number | null; packageMarginPercent?: number | null;
  hotelCategory?: RawHotelCategory | null; hotelOptions?: FinanceRawHotelOption[] | null; quoteItems?: FinanceRawItem[] | null;
}
interface FinanceRawBooking { id?: string | null; status?: string | null; }

/**
 * Structural input contract for the finance mapper. Extends the exported
 * RawOperationalQuote (so `mapQuoteToOperational(raw)` type-checks) and overrides the
 * cost-bearing branches with the finance raw shapes plus the quote-level totalCost.
 */
export interface FinanceRawQuote extends RawOperationalQuote {
  totalCost?: number | null;
  quoteItineraryDays?: FinanceRawDay[] | null;
  quoteItems?: FinanceRawItem[] | null;
  quoteOptions?: FinanceRawOption[] | null;
  booking?: FinanceRawBooking | null;
}

// ---------------------------------------------------------------------------
// Primitive coercers (local; identical semantics to the operational mapper)
// ---------------------------------------------------------------------------
function isoOrNull(v: RawDateish): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return typeof v === 'string' ? v : null;
}
function isoString(v: RawDateish): string { return isoOrNull(v) ?? ''; }
function numOrNull(v: number | null | undefined): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function numOr(v: number | null | undefined, fallback: number): number { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }
function strOrNull(v: string | null | undefined): string | null { return typeof v === 'string' ? v : null; }
function strOr(v: string | null | undefined, fallback: string): string { return typeof v === 'string' ? v : fallback; }
function boolOrNull(v: boolean | null | undefined): boolean | null { return typeof v === 'boolean' ? v : null; }
function boolOf(v: boolean | null | undefined): boolean { return v === true; }

// ---------------------------------------------------------------------------
// Leaf / relation mappers (local; identical semantics to the operational mapper)
// ---------------------------------------------------------------------------
function toFinHotel(h: RawHotel | null | undefined): OperationalItemHotel | null {
  if (!h) return null;
  return { id: strOr(h.id, ''), name: strOr(h.name, ''), city: strOr(h.city, ''), category: strOr(h.category, ''), preferenceRank: numOrNull(h.preferenceRank) };
}
function toFinRoomCategory(r: RawRoomCategory | null | undefined): OperationalRoomCategory | null {
  if (!r) return null;
  return { id: strOr(r.id, ''), name: strOr(r.name, '') };
}
function toFinActivity(a: RawActivity | null | undefined): OperationalItemActivity | null {
  if (!a) return null;
  return { id: strOr(a.id, ''), name: strOr(a.name, '') };
}
function toFinEntranceFee(e: RawEntranceFee | null | undefined): OperationalItemEntranceFee | null {
  if (!e) return null;
  return { siteName: strOr(e.siteName, '') };
}
function toFinServiceType(t: RawServiceType | null | undefined): OperationalServiceType {
  return { code: strOrNull(t?.code), name: strOr(t?.name, '') };
}
function toFinService(s: RawService | null | undefined): OperationalItemService | null {
  if (!s) return null;
  return { name: strOr(s.name, ''), serviceType: toFinServiceType(s.serviceType) };
}
function toFinStop(s: RawStop): OperationalTouringRouteStop {
  return { id: strOr(s.id, ''), order: numOr(s.order, 0), city: strOr(s.city, ''), location: strOrNull(s.location), notes: strOrNull(s.notes) };
}
function toFinTouringRoute(t: RawTouringRoute | null | undefined): OperationalItemTouringRoute | null {
  if (!t) return null;
  return { name: strOr(t.name, ''), mainDestinations: strOrNull(t.mainDestinations), stops: (t.stops ?? []).map(toFinStop) };
}
function toFinPlace(p: RawPlace | null | undefined): OperationalPlace | null {
  if (!p) return null;
  return { city: strOr(p.city, '') };
}
function toFinRoute(r: RawRoute | null | undefined): OperationalVehicleRoute | null {
  if (!r) return null;
  return { fromPlace: toFinPlace(r.fromPlace), toPlace: toFinPlace(r.toPlace) };
}
function toFinVehicle(v: RawVehicle | null | undefined): OperationalVehicle {
  return { name: strOr(v?.name, ''), vehicleClass: strOr(v?.vehicleClass, '') };
}
function toFinTransportServiceType(t: RawTransportServiceType | null | undefined): OperationalTransportServiceType {
  return { code: strOr(t?.code, ''), name: strOr(t?.name, '') };
}
function toFinHotelCategory(c: RawHotelCategory | null | undefined): OperationalHotelCategory | null {
  if (!c) return null;
  return { id: strOr(c.id, ''), name: strOr(c.name, '') };
}
function toFinMatchedDiscriminators(m: RawMatchedDiscriminators | null | undefined): OperationalMatchedDiscriminators | null {
  if (!m) return null;
  return {
    roomCategoryId: strOrNull(m.roomCategoryId), mealPlan: strOrNull(m.mealPlan), mealPlanCode: strOrNull(m.mealPlanCode),
    occupancyType: strOrNull(m.occupancyType), seasonName: strOrNull(m.seasonName), serviceDate: strOrNull(m.serviceDate), optionId: strOrNull(m.optionId),
  };
}
function normalizeMatchStatus(v: string | null | undefined): 'matched' | 'ambiguous' | 'none' {
  return v === 'matched' || v === 'ambiguous' ? v : 'none';
}
function normalizeMatchReason(v: string | null | undefined): FinanceHotelOption['pricingMatchReason'] {
  switch (v) {
    case 'direct_option_item_match':
    case 'narrowed_by_room_meal_occupancy_season_date':
    case 'ambiguous_duplicate_candidates':
    case 'no_contract_linked':
    case 'missing_discriminator':
      return v;
    default:
      return 'no_priced_item_for_option';
  }
}

// ---------------------------------------------------------------------------
// Private arbitrary-JSON parsers / type guards (the ONLY `unknown` boundary).
// Every parser returns newly constructed literal objects/arrays; unexpected keys and
// malformed structures fail closed; no unknown property/value is copied or stringified.
// ---------------------------------------------------------------------------
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function hasOnlyAllowedKeys(o: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  for (const k of Object.keys(o)) {
    if (!allowed.has(k)) return false;
  }
  return true;
}
function numFromU(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function strFromU(v: unknown): string | null { return typeof v === 'string' ? v : null; }

// externalPackagePricingMatrixJson: producer writes a bare Row[] of exactly these keys
// (`id` tolerated on input, never emitted). Rows with any other key are DROPPED.
const MATRIX_INPUT_KEYS: ReadonlySet<string> = new Set([
  'id', 'label', 'paxFrom', 'paxTo', 'freePax', 'costPerPerson', 'sellPerPerson', 'notes',
]);
function parseFinanceMatrix(v: unknown): FinancePackageMatrixRow[] | null {
  let src: unknown[];
  if (Array.isArray(v)) src = v;
  else if (isRecord(v) && Array.isArray(v.rows)) src = v.rows;
  else return null;
  const out: FinancePackageMatrixRow[] = [];
  for (const r of src) {
    if (!isRecord(r)) continue;
    if (!hasOnlyAllowedKeys(r, MATRIX_INPUT_KEYS)) continue;
    out.push({
      label: strFromU(r.label) ?? '',
      paxFrom: numFromU(r.paxFrom),
      paxTo: numFromU(r.paxTo),
      freePax: numFromU(r.freePax),
      costPerPerson: numFromU(r.costPerPerson),
      sellPerPerson: numFromU(r.sellPerPerson),
      notes: strFromU(r.notes),
    });
  }
  return out;
}

// promotionExplanation: string arm passes through; object arm accepts exactly these six
// keys (name required); rows with any other key are DROPPED.
const PROMO_INPUT_KEYS: ReadonlySet<string> = new Set(['id', 'name', 'effect', 'type', 'minStay', 'boardBasis']);
function parseFinancePromotion(v: unknown): FinancePromotionExplanationItem[] | null {
  if (!Array.isArray(v)) return null;
  const out: FinancePromotionExplanationItem[] = [];
  for (const e of v) {
    if (typeof e === 'string') { out.push(e); continue; }
    if (!isRecord(e)) continue;
    if (!hasOnlyAllowedKeys(e, PROMO_INPUT_KEYS)) continue;
    if (typeof e.name !== 'string') continue;
    const minStay = (typeof e.minStay === 'number' && Number.isFinite(e.minStay)) || typeof e.minStay === 'string' ? e.minStay : null;
    out.push({
      id: strFromU(e.id),
      name: e.name,
      effect: strFromU(e.effect),
      type: strFromU(e.type),
      minStay,
      boardBasis: strFromU(e.boardBasis),
    });
  }
  return out;
}

// fact-sheet highlights/amenities: accept ONLY a literal string[]; every other shape
// (object/scalar/mixed array) → [] (fail closed). No object key/value can become an
// output string. Returns a NEW array of trimmed, non-empty string primitives.
function parseFactSheetStringList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  for (const el of v) {
    if (typeof el !== 'string') return [];
  }
  const out: string[] = [];
  for (const el of v as string[]) {
    const t = el.trim();
    if (t) out.push(t);
  }
  return out.slice(0, max);
}

// ---------------------------------------------------------------------------
// Finance leaf builders
// ---------------------------------------------------------------------------
function financeContractRef(raw: FinanceRawContract | null | undefined): FinanceContractRef | null {
  if (!raw) return null;
  return { name: strOr(raw.name, '') };
}
function financeSupplierRef(raw: RawSupplier | null | undefined): FinanceSupplierRef | null {
  if (!raw) return null;
  return { name: strOr(raw.name, '') };
}
function financeFactSheet(raw: FinanceRawFactSheet | null | undefined): FinanceHotelFactSheet | null {
  if (!raw) return null;
  return {
    shortDescription: strOrNull(raw.shortDescription),
    highlights: parseFactSheetStringList(raw.highlightsJson, 4),
    amenities: parseFactSheetStringList(raw.amenitiesJson, 6),
  };
}
function financeAppliedVehicleRate(raw: RawAppliedVehicleRate | null | undefined): FinanceItemAppliedVehicleRate | null {
  if (!raw) return null;
  return {
    routeName: strOrNull(raw.routeName),
    route: toFinRoute(raw.route),
    vehicle: toFinVehicle(raw.vehicle),
    serviceType: toFinTransportServiceType(raw.serviceType),
    supplier: financeSupplierRef(raw.supplier),
  };
}
function financeTouringRoutePricing(raw: RawTouringRoutePricing | null | undefined): FinanceItemTouringRoutePricing | null {
  if (!raw) return null;
  return {
    vehicle: toFinVehicle(raw.vehicle),
    transportServiceType: toFinTransportServiceType(raw.transportServiceType),
    supplier: financeSupplierRef(raw.supplier),
  };
}

// ---------------------------------------------------------------------------
// Finance item / day / option builders
// ---------------------------------------------------------------------------
function toFinanceQuoteItem(it: FinanceRawItem): FinanceQuoteItem {
  return {
    id: strOr(it.id, ''), quoteId: strOr(it.quoteId, ''), optionId: strOrNull(it.optionId),
    serviceId: strOrNull(it.serviceId), activityId: strOrNull(it.activityId), entranceFeeId: strOrNull(it.entranceFeeId),
    itineraryId: strOrNull(it.itineraryId), packageTemplateId: strOrNull(it.packageTemplateId),
    packageTemplateDayId: strOrNull(it.packageTemplateDayId), packageTemplateComponentId: strOrNull(it.packageTemplateComponentId),
    excursionTemplateId: strOrNull(it.excursionTemplateId), excursionTemplateComponentId: strOrNull(it.excursionTemplateComponentId),
    excursionTemplateComponentOptional: boolOrNull(it.excursionTemplateComponentOptional),
    quantity: numOr(it.quantity, 0), paxCount: numOr(it.paxCount, 0), participantCount: numOrNull(it.participantCount),
    adultCount: numOrNull(it.adultCount), childCount: numOrNull(it.childCount), roomCount: numOrNull(it.roomCount),
    nightCount: numOrNull(it.nightCount), dayCount: numOrNull(it.dayCount), sellPrice: numOrNull(it.sellPrice),
    totalSell: numOr(it.totalSell, 0), sortOrder: numOr(it.sortOrder, 0), createdAt: isoString(it.createdAt), updatedAt: isoString(it.updatedAt),
    jordanPassCovered: boolOf(it.jordanPassCovered), currency: strOr(it.currency, ''), quoteCurrency: strOr(it.quoteCurrency, ''),
    customServiceName: strOrNull(it.customServiceName), transportLabel: strOrNull(it.transportLabel), standaloneTransfer: boolOf(it.standaloneTransfer),
    guideType: strOrNull(it.guideType), guideDuration: strOrNull(it.guideDuration), guideOvernight: boolOrNull(it.guideOvernight),
    serviceDate: isoOrNull(it.serviceDate), startTime: strOrNull(it.startTime), pickupTime: strOrNull(it.pickupTime),
    pickupLocation: strOrNull(it.pickupLocation), meetingPoint: strOrNull(it.meetingPoint), reconfirmationRequired: boolOf(it.reconfirmationRequired),
    reconfirmationDueAt: isoOrNull(it.reconfirmationDueAt), hotelId: strOrNull(it.hotelId), roomCategoryId: strOrNull(it.roomCategoryId),
    seasonName: strOrNull(it.seasonName), mealPlan: strOrNull(it.mealPlan), occupancyType: strOrNull(it.occupancyType),
    touringRouteId: strOrNull(it.touringRouteId), externalPackageCountry: strOrNull(it.externalPackageCountry),
    externalPackageName: strOrNull(it.externalPackageName), externalStartDay: numOrNull(it.externalStartDay), externalEndDay: numOrNull(it.externalEndDay),
    externalStartDate: isoOrNull(it.externalStartDate), externalEndDate: isoOrNull(it.externalEndDate), externalPricingBasis: strOrNull(it.externalPricingBasis),
    externalIncludes: strOrNull(it.externalIncludes), externalExcludes: strOrNull(it.externalExcludes),
    externalHotelsOrSimilar: strOrNull(it.externalHotelsOrSimilar), externalClientDescription: strOrNull(it.externalClientDescription),
    totalCost: numOr(it.totalCost, 0), baseCost: numOr(it.baseCost, 0), costBaseAmount: numOr(it.costBaseAmount, 0),
    overrideCost: numOrNull(it.overrideCost), useOverride: boolOf(it.useOverride), overrideReason: strOrNull(it.overrideReason),
    markupPercent: numOr(it.markupPercent, 0), markupAmount: numOrNull(it.markupAmount), jordanPassSavingsJod: numOr(it.jordanPassSavingsJod, 0),
    pricingDescription: strOrNull(it.pricingDescription), baseSell: numOrNull(it.baseSell), externalNetCost: numOrNull(it.externalNetCost),
    externalSupplierName: strOrNull(it.externalSupplierName), externalInternalNotes: strOrNull(it.externalInternalNotes),
    externalPackageSingleSupplement: numOrNull(it.externalPackageSingleSupplement),
    externalPackagePricingMatrix: parseFinanceMatrix(it.externalPackagePricingMatrixJson),
    promotionExplanation: parseFinancePromotion(it.promotionExplanation),
    contract: financeContractRef(it.contract),
    hotel: toFinHotel(it.hotel), roomCategory: toFinRoomCategory(it.roomCategory),
    activity: toFinActivity(it.activity), entranceFee: toFinEntranceFee(it.entranceFee),
    service: toFinService(it.service), touringRoute: toFinTouringRoute(it.touringRoute),
    appliedVehicleRate: financeAppliedVehicleRate(it.appliedVehicleRate),
    touringRoutePricing: financeTouringRoutePricing(it.touringRoutePricing),
  };
}
function toFinanceDayItem(di: FinanceRawDayItem): FinanceDayItem {
  return {
    id: strOr(di.id, ''), dayId: strOr(di.dayId, ''), quoteServiceId: strOr(di.quoteServiceId, ''),
    sortOrder: numOr(di.sortOrder, 0), notes: strOrNull(di.notes), isActive: boolOf(di.isActive),
    quoteService: toFinanceQuoteItem(di.quoteService ?? {}),
  };
}
function toFinanceDay(d: FinanceRawDay): FinanceItineraryDay {
  return {
    id: strOr(d.id, ''), quoteId: strOr(d.quoteId, ''), packageTemplateId: strOrNull(d.packageTemplateId),
    packageTemplateDayId: strOrNull(d.packageTemplateDayId), dayNumber: numOr(d.dayNumber, 0), title: strOr(d.title, ''),
    notes: strOrNull(d.notes), notesLanguage: strOrNull(d.notesLanguage), country: strOrNull(d.country),
    transportDayType: strOrNull(d.transportDayType), vehicleRetained: boolOrNull(d.vehicleRetained), vehicleReleased: boolOrNull(d.vehicleReleased),
    inRetainedBlock: boolOrNull(d.inRetainedBlock), overnightCity: strOrNull(d.overnightCity), vehicleReturnsToBase: boolOrNull(d.vehicleReturnsToBase),
    sortOrder: numOr(d.sortOrder, 0), isActive: boolOf(d.isActive), createdAt: isoString(d.createdAt), updatedAt: isoString(d.updatedAt),
    dayItems: (d.dayItems ?? []).map(toFinanceDayItem),
  };
}
function toFinanceHotelOptionHotel(h: FinanceRawHotelOptionHotel | null | undefined): FinanceHotelOptionHotel | null {
  if (!h) return null;
  return {
    id: strOr(h.id, ''), name: strOr(h.name, ''), city: strOr(h.city, ''), category: strOr(h.category, ''),
    preferenceRank: numOrNull(h.preferenceRank), factSheet: financeFactSheet(h.factSheet),
  };
}
function toFinanceHotelOption(ho: FinanceRawHotelOption): FinanceHotelOption {
  return {
    id: strOr(ho.id, ''), quoteOptionId: strOr(ho.quoteOptionId, ''), city: strOr(ho.city, ''), hotelId: strOrNull(ho.hotelId),
    roomCategoryId: strOrNull(ho.roomCategoryId), hotelNameSnapshot: strOr(ho.hotelNameSnapshot, ''), roomType: strOr(ho.roomType, ''),
    mealPlan: strOrNull(ho.mealPlan), mealPlanCode: strOrNull(ho.mealPlanCode), nights: numOr(ho.nights, 0), isPrimary: boolOf(ho.isPrimary),
    notes: strOrNull(ho.notes), createdAt: isoString(ho.createdAt), updatedAt: isoString(ho.updatedAt),
    hotel: toFinanceHotelOptionHotel(ho.hotel), roomCategory: toFinRoomCategory(ho.roomCategory),
    matchedPricedQuoteItemId: strOrNull(ho.matchedPricedQuoteItemId), pricingMatchStatus: normalizeMatchStatus(ho.pricingMatchStatus),
    pricingMatchReason: normalizeMatchReason(ho.pricingMatchReason), matchedDiscriminators: toFinMatchedDiscriminators(ho.matchedDiscriminators),
  };
}
function toFinanceOption(opt: FinanceRawOption): FinanceQuoteOption {
  return {
    id: strOr(opt.id, ''), quoteId: strOr(opt.quoteId, ''), kind: strOr(opt.kind, ''), name: strOr(opt.name, ''), notes: strOrNull(opt.notes),
    pricingMode: strOr(opt.pricingMode, ''), hotelCategoryId: strOrNull(opt.hotelCategoryId), createdAt: isoString(opt.createdAt), updatedAt: isoString(opt.updatedAt),
    totalPrice: numOr(opt.totalPrice, 0), totalSell: numOr(opt.totalSell, 0), pricePerPax: numOr(opt.pricePerPax, 0),
    totalCost: numOr(opt.totalCost, 0), profit: numOr(opt.profit, 0), packageMarginPercent: numOrNull(opt.packageMarginPercent),
    hotelCategory: toFinHotelCategory(opt.hotelCategory),
    hotelOptions: (opt.hotelOptions ?? []).map(toFinanceHotelOption),
    quoteItems: (opt.quoteItems ?? []).map(toFinanceQuoteItem),
  };
}
function toFinanceBookingRef(b: FinanceRawBooking | null | undefined): FinanceBookingRef | null {
  if (!b) return null;
  return { id: strOr(b.id, ''), status: strOr(b.status, '') };
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export function mapQuoteToFinanceDetail(raw: FinanceRawQuote): FinanceQuoteDetail {
  const op = mapQuoteToOperational(raw);
  return {
    // sell-side / operational fields — taken from the already-safe operational output
    id: op.id, quoteType: op.quoteType, jordanPassType: op.jordanPassType, bookingType: op.bookingType,
    title: op.title, description: op.description, quoteNumber: op.quoteNumber, quoteCurrency: op.quoteCurrency,
    proposalLanguage: op.proposalLanguage, status: op.status, createdAt: op.createdAt, updatedAt: op.updatedAt,
    adults: op.adults, children: op.children, roomCount: op.roomCount, nightCount: op.nightCount,
    travelStartDate: op.travelStartDate, validUntil: op.validUntil, sentAt: op.sentAt, acceptedAt: op.acceptedAt,
    revisionNumber: op.revisionNumber, revisedFromId: op.revisedFromId, acceptedVersionId: op.acceptedVersionId,
    clientChangeRequestMessage: op.clientChangeRequestMessage, inclusionsText: op.inclusionsText,
    exclusionsText: op.exclusionsText, termsNotesText: op.termsNotesText,
    totalSell: op.totalSell, totalPrice: op.totalPrice, pricePerPax: op.pricePerPax, singleSupplement: op.singleSupplement,
    fixedPricePerPerson: op.fixedPricePerPerson, pricingType: op.pricingType, pricingMode: op.pricingMode,
    publicEnabled: op.publicEnabled, isLatestRevision: op.isLatestRevision,
    company: op.company, contact: op.contact, agent: op.agent,
    itineraries: op.itineraries, passengers: op.passengers, pricingSlabs: op.pricingSlabs, scenarios: op.scenarios,
    invoice: op.invoice, currentPricing: op.currentPricing, priceComputation: op.priceComputation,
    workflowDiagnostics: op.workflowDiagnostics, convertBlockers: op.convertBlockers,
    // finance cost-bearing branches — rebuilt from the raw row
    totalCost: numOr(raw.totalCost, 0),
    quoteItineraryDays: (raw.quoteItineraryDays ?? []).map(toFinanceDay),
    quoteItems: (raw.quoteItems ?? []).map(toFinanceQuoteItem),
    quoteOptions: (raw.quoteOptions ?? []).map(toFinanceOption),
    booking: toFinanceBookingRef(raw.booking),
  };
}
