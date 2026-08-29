/**
 * CP-N3b2a — Operational quote-detail mapper (READ-ONLY, additive).
 *
 * Projects the raw hydrated quote (the object returned by
 * QuotesService.findOne / loadQuoteState) into the closed {@link OperationalQuoteDetail}
 * allowlist for `GET /quotes/:id/operational`.
 *
 * Design invariants:
 *  - EXPLICIT PROPERTY ASSIGNMENT ONLY. No `...spread`, no `Object.assign`, no JSON
 *    clone, no generic recursive sanitizer. Every emitted key is written by name, so
 *    a newly added Prisma column can never leak — it is invisible until added here.
 *  - Buy-side cost/margin/markup/FX/tax-fee/override/internal-note/supplier-identity/
 *    contract-identity/rate/token/snapshot/arbitrary-JSON fields are NEVER read into
 *    the output. Provenance STATE is carried only by the two non-identifying
 *    sentinels (contract `{}`|null, supplier `{ name: "Assigned" }`|null).
 *  - Pricing display is RE-DERIVED via `computePriceResult` with `totalCost: null`
 *    and cost-free rebuilt slabs, so no cost total / slabLines / contextLines / error
 *    can be produced; only the sell-side allowlist of the result is copied.
 *  - Identical output for every authorized role (no PII / finance branch). Passenger
 *    projection is exactly { id, firstName, lastName }.
 */

import {
  QuotePricingService,
  QuotePricingSlabValue,
  PriceComputationResult,
} from './quote-pricing.service';
import {
  OperationalAgent,
  OperationalBookingRef,
  OperationalCompany,
  OperationalContact,
  OperationalContractPresence,
  OperationalConvertBlocker,
  OperationalCurrentMatchedSlab,
  OperationalCurrentPricing,
  OperationalDayItem,
  OperationalFoc,
  OperationalGalleryImage,
  OperationalHotelCategory,
  OperationalHotelOption,
  OperationalInvoice,
  OperationalItemActivity,
  OperationalItemAppliedVehicleRate,
  OperationalItemEntranceFee,
  OperationalItemHotel,
  OperationalItemService,
  OperationalItemTouringRoute,
  OperationalItemTouringRoutePricing,
  OperationalItinerary,
  OperationalItineraryDay,
  OperationalItineraryImage,
  OperationalMatchedDiscriminators,
  OperationalPlace,
  OperationalPriceComputation,
  OperationalPricingDisplay,
  OperationalPricingSlab,
  OperationalPricingTotals,
  OperationalQuoteDetail,
  OperationalQuoteItem,
  OperationalQuoteOption,
  OperationalRoomCategory,
  OperationalScenario,
  OperationalServiceType,
  OperationalSupplierRef,
  OperationalTouringRouteStop,
  OperationalTransportServiceType,
  OperationalVehicle,
  OperationalVehicleRoute,
  OperationalWorkflowDiagnostic,
  OperationalComputedMatchedSlab,
  OperationalPassenger,
} from './quote-operational.dto';

// ---------------------------------------------------------------------------
// Raw input structural types — describe ONLY the fields the mapper reads. All
// optional / nullable / permissive, so any richer hydrated shape is assignable.
// Buy-side fields are intentionally NOT declared here — they are never read.
// ---------------------------------------------------------------------------

type RawDateish = Date | string | null | undefined;

interface RawCompany {
  id?: string | null;
  name?: string | null;
}
interface RawContact {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}
interface RawAgent {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}
interface RawServiceType {
  code?: string | null;
  name?: string | null;
}
interface RawService {
  name?: string | null;
  serviceType?: RawServiceType | null;
}
interface RawHotel {
  id?: string | null;
  name?: string | null;
  city?: string | null;
  category?: string | null;
  preferenceRank?: number | null;
}
interface RawRoomCategory {
  id?: string | null;
  name?: string | null;
}
interface RawActivity {
  id?: string | null;
  name?: string | null;
}
interface RawEntranceFee {
  siteName?: string | null;
}
interface RawStop {
  id?: string | null;
  order?: number | null;
  city?: string | null;
  location?: string | null;
  notes?: string | null;
}
interface RawTouringRoute {
  name?: string | null;
  mainDestinations?: string | null;
  stops?: RawStop[] | null;
}
interface RawPlace {
  city?: string | null;
}
interface RawRoute {
  fromPlace?: RawPlace | null;
  toPlace?: RawPlace | null;
}
interface RawVehicle {
  name?: string | null;
  vehicleClass?: string | null;
}
interface RawSupplier {
  name?: string | null;
}
interface RawTransportServiceType {
  code?: string | null;
  name?: string | null;
}
interface RawAppliedVehicleRate {
  routeName?: string | null;
  supplierId?: string | null;
  route?: RawRoute | null;
  vehicle?: RawVehicle | null;
  serviceType?: RawTransportServiceType | null;
  supplier?: RawSupplier | null;
}
interface RawTouringRoutePricing {
  supplierId?: string | null;
  vehicle?: RawVehicle | null;
  transportServiceType?: RawTransportServiceType | null;
  supplier?: RawSupplier | null;
}
interface RawItem {
  id?: string | null;
  quoteId?: string | null;
  optionId?: string | null;
  serviceId?: string | null;
  activityId?: string | null;
  entranceFeeId?: string | null;
  itineraryId?: string | null;
  packageTemplateId?: string | null;
  packageTemplateDayId?: string | null;
  packageTemplateComponentId?: string | null;
  excursionTemplateId?: string | null;
  excursionTemplateComponentId?: string | null;
  excursionTemplateComponentOptional?: boolean | null;
  quantity?: number | null;
  paxCount?: number | null;
  participantCount?: number | null;
  adultCount?: number | null;
  childCount?: number | null;
  roomCount?: number | null;
  nightCount?: number | null;
  dayCount?: number | null;
  sellPrice?: number | null;
  totalSell?: number | null;
  sortOrder?: number | null;
  createdAt?: RawDateish;
  updatedAt?: RawDateish;
  jordanPassCovered?: boolean | null;
  currency?: string | null;
  quoteCurrency?: string | null;
  customServiceName?: string | null;
  transportLabel?: string | null;
  standaloneTransfer?: boolean | null;
  guideType?: string | null;
  guideDuration?: string | null;
  guideOvernight?: boolean | null;
  serviceDate?: RawDateish;
  startTime?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  meetingPoint?: string | null;
  reconfirmationRequired?: boolean | null;
  reconfirmationDueAt?: RawDateish;
  hotelId?: string | null;
  contractId?: string | null;
  roomCategoryId?: string | null;
  seasonName?: string | null;
  mealPlan?: string | null;
  occupancyType?: string | null;
  touringRouteId?: string | null;
  externalPackageCountry?: string | null;
  externalPackageName?: string | null;
  externalStartDay?: number | null;
  externalEndDay?: number | null;
  externalStartDate?: RawDateish;
  externalEndDate?: RawDateish;
  externalPricingBasis?: string | null;
  externalIncludes?: string | null;
  externalExcludes?: string | null;
  externalHotelsOrSimilar?: string | null;
  externalClientDescription?: string | null;
  hotel?: RawHotel | null;
  roomCategory?: RawRoomCategory | null;
  activity?: RawActivity | null;
  entranceFee?: RawEntranceFee | null;
  service?: RawService | null;
  touringRoute?: RawTouringRoute | null;
  appliedVehicleRate?: RawAppliedVehicleRate | null;
  touringRoutePricing?: RawTouringRoutePricing | null;
}
interface RawDayItem {
  id?: string | null;
  dayId?: string | null;
  quoteServiceId?: string | null;
  sortOrder?: number | null;
  notes?: string | null;
  isActive?: boolean | null;
  quoteService?: RawItem | null;
}
interface RawDay {
  id?: string | null;
  quoteId?: string | null;
  packageTemplateId?: string | null;
  packageTemplateDayId?: string | null;
  dayNumber?: number | null;
  title?: string | null;
  notes?: string | null;
  notesLanguage?: string | null;
  country?: string | null;
  transportDayType?: string | null;
  vehicleRetained?: boolean | null;
  vehicleReleased?: boolean | null;
  inRetainedBlock?: boolean | null;
  overnightCity?: string | null;
  vehicleReturnsToBase?: boolean | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
  createdAt?: RawDateish;
  updatedAt?: RawDateish;
  dayItems?: RawDayItem[] | null;
}
interface RawGalleryImage {
  id?: string | null;
  imageUrl?: string | null;
  title?: string | null;
}
interface RawItineraryImage {
  id?: string | null;
  itineraryId?: string | null;
  galleryImageId?: string | null;
  sortOrder?: number | null;
  galleryImage?: RawGalleryImage | null;
}
interface RawItinerary {
  id?: string | null;
  quoteId?: string | null;
  dayNumber?: number | null;
  title?: string | null;
  description?: string | null;
  images?: RawItineraryImage[] | null;
}
interface RawHotelCategory {
  id?: string | null;
  name?: string | null;
}
interface RawMatchedDiscriminators {
  roomCategoryId?: string | null;
  mealPlan?: string | null;
  mealPlanCode?: string | null;
  occupancyType?: string | null;
  seasonName?: string | null;
  serviceDate?: string | null;
  optionId?: string | null;
}
interface RawHotelOption {
  id?: string | null;
  quoteOptionId?: string | null;
  city?: string | null;
  hotelId?: string | null;
  roomCategoryId?: string | null;
  hotelNameSnapshot?: string | null;
  roomType?: string | null;
  mealPlan?: string | null;
  mealPlanCode?: string | null;
  nights?: number | null;
  isPrimary?: boolean | null;
  notes?: string | null;
  createdAt?: RawDateish;
  updatedAt?: RawDateish;
  hotel?: RawHotel | null;
  roomCategory?: RawRoomCategory | null;
  matchedPricedQuoteItemId?: string | null;
  pricingMatchStatus?: string | null;
  pricingMatchReason?: string | null;
  matchedDiscriminators?: RawMatchedDiscriminators | null;
}
interface RawOption {
  id?: string | null;
  quoteId?: string | null;
  kind?: string | null;
  name?: string | null;
  notes?: string | null;
  pricingMode?: string | null;
  hotelCategoryId?: string | null;
  createdAt?: RawDateish;
  updatedAt?: RawDateish;
  totalPrice?: number | null;
  totalSell?: number | null;
  pricePerPax?: number | null;
  hotelCategory?: RawHotelCategory | null;
  hotelOptions?: RawHotelOption[] | null;
  quoteItems?: RawItem[] | null;
}
interface RawPassenger {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}
interface RawSlab {
  id?: string | null;
  minPax?: number | null;
  maxPax?: number | null;
  price?: number | null;
  actualPax?: number | null;
  focPax?: number | null;
  payingPax?: number | null;
  totalSell?: number | null;
  pricePerPayingPax?: number | null;
  pricePerActualPax?: number | null;
}
interface RawScenario {
  id?: string | null;
  paxCount?: number | null;
  totalSell?: number | null;
  pricePerPax?: number | null;
}
interface RawInvoice {
  id?: string | null;
  totalAmount?: number | null;
  currency?: string | null;
  status?: string | null;
  dueDate?: RawDateish;
}
interface RawBooking {
  id?: string | null;
}

export interface RawOperationalQuote {
  id?: string | null;
  quoteType?: string | null;
  jordanPassType?: string | null;
  bookingType?: string | null;
  title?: string | null;
  description?: string | null;
  quoteNumber?: string | null;
  quoteCurrency?: string | null;
  proposalLanguage?: string | null;
  status?: string | null;
  createdAt?: RawDateish;
  updatedAt?: RawDateish;
  adults?: number | null;
  children?: number | null;
  roomCount?: number | null;
  nightCount?: number | null;
  travelStartDate?: RawDateish;
  validUntil?: RawDateish;
  sentAt?: RawDateish;
  acceptedAt?: RawDateish;
  revisionNumber?: number | null;
  revisedFromId?: string | null;
  acceptedVersionId?: string | null;
  clientChangeRequestMessage?: string | null;
  inclusionsText?: string | null;
  exclusionsText?: string | null;
  termsNotesText?: string | null;
  totalSell?: number | null;
  totalPrice?: number | null;
  pricePerPax?: number | null;
  singleSupplement?: number | null;
  fixedPricePerPerson?: number | null;
  pricingType?: string;
  pricingMode?: string | null;
  publicEnabled?: boolean | null;
  isLatestRevision?: boolean | null;
  focType?: string | null;
  focRatio?: number | null;
  focCount?: number | null;
  focRoomType?: string | null;
  company?: RawCompany | null;
  contact?: RawContact | null;
  agent?: RawAgent | null;
  quoteItineraryDays?: RawDay[] | null;
  itineraries?: RawItinerary[] | null;
  quoteItems?: RawItem[] | null;
  quoteOptions?: RawOption[] | null;
  passengers?: RawPassenger[] | null;
  pricingSlabs?: RawSlab[] | null;
  scenarios?: RawScenario[] | null;
  invoice?: RawInvoice | null;
  booking?: RawBooking | null;
}

// ---------------------------------------------------------------------------
// Primitive coercers
// ---------------------------------------------------------------------------

function isoOrNull(v: RawDateish): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return typeof v === 'string' ? v : null;
}
function isoString(v: RawDateish): string {
  return isoOrNull(v) ?? '';
}
function numOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function numOr(v: number | null | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strOrNull(v: string | null | undefined): string | null {
  return typeof v === 'string' ? v : null;
}
function strOr(v: string | null | undefined, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}
function boolOrNull(v: boolean | null | undefined): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function boolOf(v: boolean | null | undefined): boolean {
  return v === true;
}

// ---------------------------------------------------------------------------
// Non-identifying provenance sentinels
// ---------------------------------------------------------------------------

/** A linked contract exists -> {} (truthy) else null. Never a name / id / rate. */
function contractPresence(hasContract: boolean): OperationalContractPresence | null {
  return hasContract ? {} : null;
}

/** True only for a clearly assigned, non-blank, non-"unassigned" supplier name. */
function isAssignedSupplierName(name: string | null | undefined): boolean {
  if (typeof name !== 'string') return false;
  const n = name.trim().toLowerCase();
  return n !== '' && n !== 'unassigned';
}

/** A supplier is assigned -> { name: "Assigned" } else null. Never the real name / id. */
function supplierRef(assigned: boolean): OperationalSupplierRef | null {
  return assigned ? { name: 'Assigned' } : null;
}

// ---------------------------------------------------------------------------
// Leaf / relation mappers (explicit assignment only)
// ---------------------------------------------------------------------------

function toOperationalCompany(c: RawCompany | null | undefined): OperationalCompany | null {
  if (!c) return null;
  return { id: strOr(c.id, ''), name: strOr(c.name, '') };
}
function toOperationalContact(c: RawContact | null | undefined): OperationalContact | null {
  if (!c) return null;
  return { id: strOr(c.id, ''), firstName: strOr(c.firstName, ''), lastName: strOr(c.lastName, '') };
}
function toOperationalAgent(a: RawAgent | null | undefined): OperationalAgent | null {
  if (!a) return null;
  return { id: strOr(a.id, ''), firstName: strOr(a.firstName, ''), lastName: strOr(a.lastName, '') };
}
function toOperationalHotel(h: RawHotel | null | undefined): OperationalItemHotel | null {
  if (!h) return null;
  return {
    id: strOr(h.id, ''),
    name: strOr(h.name, ''),
    city: strOr(h.city, ''),
    category: strOr(h.category, ''),
    preferenceRank: numOrNull(h.preferenceRank),
  };
}
function toOperationalRoomCategory(r: RawRoomCategory | null | undefined): OperationalRoomCategory | null {
  if (!r) return null;
  return { id: strOr(r.id, ''), name: strOr(r.name, '') };
}
function toOperationalActivity(a: RawActivity | null | undefined): OperationalItemActivity | null {
  if (!a) return null;
  return { id: strOr(a.id, ''), name: strOr(a.name, '') };
}
function toOperationalEntranceFee(e: RawEntranceFee | null | undefined): OperationalItemEntranceFee | null {
  if (!e) return null;
  return { siteName: strOr(e.siteName, '') };
}
function toOperationalServiceType(t: RawServiceType | null | undefined): OperationalServiceType {
  return { code: strOrNull(t?.code), name: strOr(t?.name, '') };
}
function toOperationalService(s: RawService | null | undefined): OperationalItemService | null {
  if (!s) return null;
  return { name: strOr(s.name, ''), serviceType: toOperationalServiceType(s.serviceType) };
}
function toOperationalStop(s: RawStop): OperationalTouringRouteStop {
  return {
    id: strOr(s.id, ''),
    order: numOr(s.order, 0),
    city: strOr(s.city, ''),
    location: strOrNull(s.location),
    notes: strOrNull(s.notes),
  };
}
function toOperationalTouringRoute(t: RawTouringRoute | null | undefined): OperationalItemTouringRoute | null {
  if (!t) return null;
  return {
    name: strOr(t.name, ''),
    mainDestinations: strOrNull(t.mainDestinations),
    stops: (t.stops ?? []).map(toOperationalStop),
  };
}
function toOperationalPlace(p: RawPlace | null | undefined): OperationalPlace | null {
  if (!p) return null;
  return { city: strOr(p.city, '') };
}
function toOperationalRoute(r: RawRoute | null | undefined): OperationalVehicleRoute | null {
  if (!r) return null;
  return { fromPlace: toOperationalPlace(r.fromPlace), toPlace: toOperationalPlace(r.toPlace) };
}
function toOperationalVehicle(v: RawVehicle | null | undefined): OperationalVehicle {
  return { name: strOr(v?.name, ''), vehicleClass: strOr(v?.vehicleClass, '') };
}
function toOperationalTransportServiceType(
  t: RawTransportServiceType | null | undefined,
): OperationalTransportServiceType {
  return { code: strOr(t?.code, ''), name: strOr(t?.name, '') };
}
function toOperationalAppliedVehicleRate(
  r: RawAppliedVehicleRate | null | undefined,
): OperationalItemAppliedVehicleRate | null {
  if (!r) return null;
  return {
    routeName: strOrNull(r.routeName),
    route: toOperationalRoute(r.route),
    vehicle: toOperationalVehicle(r.vehicle),
    serviceType: toOperationalTransportServiceType(r.serviceType),
    supplier: supplierRef(isAssignedSupplierName(r.supplier?.name) || r.supplierId != null),
  };
}
function toOperationalTouringRoutePricing(
  p: RawTouringRoutePricing | null | undefined,
): OperationalItemTouringRoutePricing | null {
  if (!p) return null;
  return {
    vehicle: toOperationalVehicle(p.vehicle),
    transportServiceType: toOperationalTransportServiceType(p.transportServiceType),
    supplier: supplierRef(isAssignedSupplierName(p.supplier?.name) || p.supplierId != null),
  };
}

function toOperationalQuoteItem(it: RawItem): OperationalQuoteItem {
  return {
    id: strOr(it.id, ''),
    quoteId: strOr(it.quoteId, ''),
    optionId: strOrNull(it.optionId),
    serviceId: strOrNull(it.serviceId),
    activityId: strOrNull(it.activityId),
    entranceFeeId: strOrNull(it.entranceFeeId),
    itineraryId: strOrNull(it.itineraryId),
    packageTemplateId: strOrNull(it.packageTemplateId),
    packageTemplateDayId: strOrNull(it.packageTemplateDayId),
    packageTemplateComponentId: strOrNull(it.packageTemplateComponentId),
    excursionTemplateId: strOrNull(it.excursionTemplateId),
    excursionTemplateComponentId: strOrNull(it.excursionTemplateComponentId),
    excursionTemplateComponentOptional: boolOrNull(it.excursionTemplateComponentOptional),
    quantity: numOr(it.quantity, 0),
    paxCount: numOr(it.paxCount, 0),
    participantCount: numOrNull(it.participantCount),
    adultCount: numOrNull(it.adultCount),
    childCount: numOrNull(it.childCount),
    roomCount: numOrNull(it.roomCount),
    nightCount: numOrNull(it.nightCount),
    dayCount: numOrNull(it.dayCount),
    sellPrice: numOrNull(it.sellPrice),
    totalSell: numOr(it.totalSell, 0),
    sortOrder: numOr(it.sortOrder, 0),
    createdAt: isoString(it.createdAt),
    updatedAt: isoString(it.updatedAt),
    jordanPassCovered: boolOf(it.jordanPassCovered),
    currency: strOr(it.currency, ''),
    quoteCurrency: strOr(it.quoteCurrency, ''),
    customServiceName: strOrNull(it.customServiceName),
    transportLabel: strOrNull(it.transportLabel),
    standaloneTransfer: boolOf(it.standaloneTransfer),
    guideType: strOrNull(it.guideType),
    guideDuration: strOrNull(it.guideDuration),
    guideOvernight: boolOrNull(it.guideOvernight),
    serviceDate: isoOrNull(it.serviceDate),
    startTime: strOrNull(it.startTime),
    pickupTime: strOrNull(it.pickupTime),
    pickupLocation: strOrNull(it.pickupLocation),
    meetingPoint: strOrNull(it.meetingPoint),
    reconfirmationRequired: boolOf(it.reconfirmationRequired),
    reconfirmationDueAt: isoOrNull(it.reconfirmationDueAt),
    hotelId: strOrNull(it.hotelId),
    roomCategoryId: strOrNull(it.roomCategoryId),
    seasonName: strOrNull(it.seasonName),
    mealPlan: strOrNull(it.mealPlan),
    occupancyType: strOrNull(it.occupancyType),
    touringRouteId: strOrNull(it.touringRouteId),
    externalPackageCountry: strOrNull(it.externalPackageCountry),
    externalPackageName: strOrNull(it.externalPackageName),
    externalStartDay: numOrNull(it.externalStartDay),
    externalEndDay: numOrNull(it.externalEndDay),
    externalStartDate: isoOrNull(it.externalStartDate),
    externalEndDate: isoOrNull(it.externalEndDate),
    externalPricingBasis: strOrNull(it.externalPricingBasis),
    externalIncludes: strOrNull(it.externalIncludes),
    externalExcludes: strOrNull(it.externalExcludes),
    externalHotelsOrSimilar: strOrNull(it.externalHotelsOrSimilar),
    externalClientDescription: strOrNull(it.externalClientDescription),
    contract: contractPresence(it.contractId != null),
    hotel: toOperationalHotel(it.hotel),
    roomCategory: toOperationalRoomCategory(it.roomCategory),
    activity: toOperationalActivity(it.activity),
    entranceFee: toOperationalEntranceFee(it.entranceFee),
    service: toOperationalService(it.service),
    touringRoute: toOperationalTouringRoute(it.touringRoute),
    appliedVehicleRate: toOperationalAppliedVehicleRate(it.appliedVehicleRate),
    touringRoutePricing: toOperationalTouringRoutePricing(it.touringRoutePricing),
  };
}

function toOperationalDayItem(di: RawDayItem): OperationalDayItem {
  return {
    id: strOr(di.id, ''),
    dayId: strOr(di.dayId, ''),
    quoteServiceId: strOr(di.quoteServiceId, ''),
    sortOrder: numOr(di.sortOrder, 0),
    notes: strOrNull(di.notes),
    isActive: boolOf(di.isActive),
    quoteService: toOperationalQuoteItem(di.quoteService ?? {}),
  };
}

function toOperationalDay(d: RawDay): OperationalItineraryDay {
  return {
    id: strOr(d.id, ''),
    quoteId: strOr(d.quoteId, ''),
    packageTemplateId: strOrNull(d.packageTemplateId),
    packageTemplateDayId: strOrNull(d.packageTemplateDayId),
    dayNumber: numOr(d.dayNumber, 0),
    title: strOr(d.title, ''),
    notes: strOrNull(d.notes),
    notesLanguage: strOrNull(d.notesLanguage),
    country: strOrNull(d.country),
    transportDayType: strOrNull(d.transportDayType),
    vehicleRetained: boolOrNull(d.vehicleRetained),
    vehicleReleased: boolOrNull(d.vehicleReleased),
    inRetainedBlock: boolOrNull(d.inRetainedBlock),
    overnightCity: strOrNull(d.overnightCity),
    vehicleReturnsToBase: boolOrNull(d.vehicleReturnsToBase),
    sortOrder: numOr(d.sortOrder, 0),
    isActive: boolOf(d.isActive),
    createdAt: isoString(d.createdAt),
    updatedAt: isoString(d.updatedAt),
    dayItems: (d.dayItems ?? []).map(toOperationalDayItem),
  };
}

function toOperationalGalleryImage(g: RawGalleryImage | null | undefined): OperationalGalleryImage | null {
  if (!g) return null;
  return { id: strOr(g.id, ''), imageUrl: strOr(g.imageUrl, ''), title: strOr(g.title, '') };
}
function toOperationalItineraryImage(img: RawItineraryImage): OperationalItineraryImage {
  return {
    id: strOr(img.id, ''),
    itineraryId: strOr(img.itineraryId, ''),
    galleryImageId: strOr(img.galleryImageId, ''),
    sortOrder: numOr(img.sortOrder, 0),
    galleryImage: toOperationalGalleryImage(img.galleryImage),
  };
}
function toOperationalItinerary(i: RawItinerary): OperationalItinerary {
  return {
    id: strOr(i.id, ''),
    quoteId: strOr(i.quoteId, ''),
    dayNumber: numOr(i.dayNumber, 0),
    title: strOr(i.title, ''),
    description: strOrNull(i.description),
    images: (i.images ?? []).map(toOperationalItineraryImage),
  };
}

function toOperationalHotelCategory(c: RawHotelCategory | null | undefined): OperationalHotelCategory | null {
  if (!c) return null;
  return { id: strOr(c.id, ''), name: strOr(c.name, '') };
}
function toOperationalMatchedDiscriminators(
  m: RawMatchedDiscriminators | null | undefined,
): OperationalMatchedDiscriminators | null {
  if (!m) return null;
  return {
    roomCategoryId: strOrNull(m.roomCategoryId),
    mealPlan: strOrNull(m.mealPlan),
    mealPlanCode: strOrNull(m.mealPlanCode),
    occupancyType: strOrNull(m.occupancyType),
    seasonName: strOrNull(m.seasonName),
    serviceDate: strOrNull(m.serviceDate),
    optionId: strOrNull(m.optionId),
  };
}
function normalizeMatchStatus(v: string | null | undefined): 'matched' | 'ambiguous' | 'none' {
  return v === 'matched' || v === 'ambiguous' ? v : 'none';
}
function normalizeMatchReason(v: string | null | undefined): OperationalHotelOption['pricingMatchReason'] {
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
function toOperationalHotelOption(ho: RawHotelOption): OperationalHotelOption {
  return {
    id: strOr(ho.id, ''),
    quoteOptionId: strOr(ho.quoteOptionId, ''),
    city: strOr(ho.city, ''),
    hotelId: strOrNull(ho.hotelId),
    roomCategoryId: strOrNull(ho.roomCategoryId),
    hotelNameSnapshot: strOr(ho.hotelNameSnapshot, ''),
    roomType: strOr(ho.roomType, ''),
    mealPlan: strOrNull(ho.mealPlan),
    mealPlanCode: strOrNull(ho.mealPlanCode),
    nights: numOr(ho.nights, 0),
    isPrimary: boolOf(ho.isPrimary),
    notes: strOrNull(ho.notes),
    createdAt: isoString(ho.createdAt),
    updatedAt: isoString(ho.updatedAt),
    hotel: toOperationalHotel(ho.hotel),
    roomCategory: toOperationalRoomCategory(ho.roomCategory),
    matchedPricedQuoteItemId: strOrNull(ho.matchedPricedQuoteItemId),
    pricingMatchStatus: normalizeMatchStatus(ho.pricingMatchStatus),
    pricingMatchReason: normalizeMatchReason(ho.pricingMatchReason),
    matchedDiscriminators: toOperationalMatchedDiscriminators(ho.matchedDiscriminators),
  };
}
function toOperationalOption(opt: RawOption): OperationalQuoteOption {
  return {
    id: strOr(opt.id, ''),
    quoteId: strOr(opt.quoteId, ''),
    kind: strOr(opt.kind, ''),
    name: strOr(opt.name, ''),
    notes: strOrNull(opt.notes),
    pricingMode: strOr(opt.pricingMode, ''),
    hotelCategoryId: strOrNull(opt.hotelCategoryId),
    createdAt: isoString(opt.createdAt),
    updatedAt: isoString(opt.updatedAt),
    totalPrice: numOr(opt.totalPrice, 0),
    totalSell: numOr(opt.totalSell, 0),
    pricePerPax: numOr(opt.pricePerPax, 0),
    hotelCategory: toOperationalHotelCategory(opt.hotelCategory),
    hotelOptions: (opt.hotelOptions ?? []).map(toOperationalHotelOption),
    quoteItems: (opt.quoteItems ?? []).map(toOperationalQuoteItem),
  };
}

function toOperationalPassenger(p: RawPassenger): OperationalPassenger {
  return { id: strOr(p.id, ''), firstName: strOr(p.firstName, ''), lastName: strOr(p.lastName, '') };
}
function toOperationalPricingSlab(s: RawSlab): OperationalPricingSlab {
  return {
    id: strOr(s.id, ''),
    minPax: numOr(s.minPax, 0),
    maxPax: numOrNull(s.maxPax),
    price: numOr(s.price, 0),
    actualPax: numOr(s.actualPax, 0),
    focPax: numOr(s.focPax, 0),
    payingPax: numOr(s.payingPax, 0),
    totalSell: numOr(s.totalSell, 0),
    pricePerPayingPax: numOr(s.pricePerPayingPax, 0),
    pricePerActualPax: numOrNull(s.pricePerActualPax),
  };
}
function toOperationalScenario(s: RawScenario): OperationalScenario {
  return {
    id: strOr(s.id, ''),
    paxCount: numOr(s.paxCount, 0),
    totalSell: numOr(s.totalSell, 0),
    pricePerPax: numOr(s.pricePerPax, 0),
  };
}
function toOperationalInvoice(i: RawInvoice | null | undefined): OperationalInvoice | null {
  if (!i) return null;
  return {
    id: strOr(i.id, ''),
    totalAmount: numOr(i.totalAmount, 0),
    currency: strOr(i.currency, ''),
    status: strOr(i.status, ''),
    dueDate: isoOrNull(i.dueDate),
  };
}
function toOperationalBookingRef(b: RawBooking | null | undefined): OperationalBookingRef | null {
  if (!b) return null;
  return { id: strOr(b.id, '') };
}

// ---------------------------------------------------------------------------
// Workflow diagnostics / convert blockers — recomputed cost-free from the raw
// items so no cost total rides in persistedOperationalFields.
// ---------------------------------------------------------------------------

const WORKFLOW_MISSING_QUANTITY = 'quantity';
const WORKFLOW_MISSING_PAX = 'pax count';
const WORKFLOW_MISSING_PRICING = 'cost/sell pricing';

function toOperationalWorkflowDiagnostic(it: RawItem, index: number): OperationalWorkflowDiagnostic {
  const missing: string[] = [];
  const quantity = Math.max(0, numOr(it.quantity, 0));
  const paxCount = Math.max(0, numOr(it.paxCount, 0));
  const hasSell = numOr(it.totalSell, 0) > 0;
  if (quantity <= 0) missing.push(WORKFLOW_MISSING_QUANTITY);
  if (paxCount <= 0) missing.push(WORKFLOW_MISSING_PAX);
  if (!hasSell) missing.push(WORKFLOW_MISSING_PRICING);
  return {
    itemId: strOrNull(it.id),
    itemName: strOr(it.service?.name, `item ${index + 1}`),
    missingWorkflowFields: missing,
    persistedOperationalFields: {
      serviceDate: isoOrNull(it.serviceDate),
      itineraryId: strOrNull(it.itineraryId),
      startTime: strOrNull(it.startTime),
      pickupTime: strOrNull(it.pickupTime),
      pickupLocation: strOrNull(it.pickupLocation),
      meetingPoint: strOrNull(it.meetingPoint),
      participantCount: numOrNull(it.participantCount),
      adultCount: numOrNull(it.adultCount),
      childCount: numOrNull(it.childCount),
      paxCount: numOrNull(it.paxCount),
      reconfirmationRequired: boolOrNull(it.reconfirmationRequired),
      reconfirmationDueAt: isoOrNull(it.reconfirmationDueAt),
      totalSell: numOrNull(it.totalSell),
    },
  };
}

function toOperationalConvertBlocker(diag: OperationalWorkflowDiagnostic): OperationalConvertBlocker {
  const active = diag.missingWorkflowFields.length > 0;
  return {
    blockerType: 'workflow-fields',
    source: 'Quote Item Workflow',
    active,
    itemId: diag.itemId,
    itemName: diag.itemName,
    reason: active
      ? `Missing workflow fields: ${diag.missingWorkflowFields.join(', ')}.`
      : 'Workflow fields are complete.',
  };
}

// ---------------------------------------------------------------------------
// Pricing display — RE-DERIVED cost-free.
// ---------------------------------------------------------------------------

const operationalPricingService = new QuotePricingService();

/** Rebuild the pricing slabs WITHOUT totalCost and WITHOUT notes for the compute call. */
function toCostFreeSlabInput(s: RawSlab): QuotePricingSlabValue {
  return {
    minPax: numOr(s.minPax, 0),
    maxPax: s.maxPax == null ? null : numOr(s.maxPax, 0),
    price: numOr(s.price, 0),
    focPax: numOrNull(s.focPax) ?? undefined,
    actualPax: numOrNull(s.actualPax) ?? undefined,
    payingPax: numOrNull(s.payingPax) ?? undefined,
    pricePerPayingPax: numOrNull(s.pricePerPayingPax) ?? undefined,
    pricePerActualPax: numOrNull(s.pricePerActualPax),
    totalSell: numOrNull(s.totalSell) ?? undefined,
  };
}

function deriveCostFreePriceComputation(quote: RawOperationalQuote): PriceComputationResult | null {
  if (quote.pricingType === undefined) return null;
  const costFreeSlabs = (quote.pricingSlabs ?? []).map(toCostFreeSlabInput);
  return operationalPricingService.computePriceResult({
    pricingMode: quote.pricingMode ?? undefined,
    pricingType: quote.pricingType,
    pricingSlabs: costFreeSlabs,
    totalCost: null,
    adults: numOr(quote.adults, 0),
    children: numOr(quote.children, 0),
    totalSell: numOrNull(quote.totalSell),
    pricePerPax: numOrNull(quote.pricePerPax),
    fixedPricePerPerson: numOrNull(quote.fixedPricePerPerson),
    singleSupplement: numOrNull(quote.singleSupplement),
    focType: quote.focType ?? undefined,
    focRatio: quote.focRatio ?? undefined,
    focCount: quote.focCount ?? undefined,
    focRoomType: quote.focRoomType ?? undefined,
    currency: quote.quoteCurrency ?? undefined,
  });
}

function toOperationalFoc(pc: PriceComputationResult): OperationalFoc {
  const f = pc.foc;
  return {
    focType: strOr(f?.focType, 'none'),
    focRatio: numOrNull(f?.focRatio),
    focCount: numOrNull(f?.focCount),
    focRoomType: strOrNull(f?.focRoomType),
    resolvedFocCount: numOr(f?.resolvedFocCount, 0),
    resolvedFocRoomType: strOrNull(f?.resolvedFocRoomType),
    note: strOrNull(f?.note),
  };
}
function toOperationalPricingDisplay(pc: PriceComputationResult): OperationalPricingDisplay {
  return {
    summaryLabel: strOr(pc.display.summaryLabel, ''),
    summaryValue: strOrNull(pc.display.summaryValue),
    pricingText: strOrNull(pc.display.pricingText),
    focText: strOrNull(pc.display.focText),
    singleSupplementText: strOrNull(pc.display.singleSupplementText),
  };
}
function toOperationalPricingTotals(pc: PriceComputationResult): OperationalPricingTotals {
  const t = pc.totals;
  return {
    pricePerPayingPax: numOrNull(t?.pricePerPayingPax),
    pricePerActualPax: numOrNull(t?.pricePerActualPax),
    totalPrice: numOrNull(t?.totalPrice),
    totalSell: numOrNull(t?.totalSell),
    actualPax: numOrNull(t?.actualPax),
    focPax: numOrNull(t?.focPax),
    payingPax: numOrNull(t?.payingPax),
    focCount: numOrNull(t?.focCount),
    payablePax: numOrNull(t?.payablePax),
    singleSupplement: numOrNull(t?.singleSupplement),
  };
}
function toOperationalComputedMatchedSlab(pc: PriceComputationResult): OperationalComputedMatchedSlab | null {
  const m = pc.matchedSlab;
  if (!m) return null;
  return {
    minPax: numOr(m.minPax, 0),
    maxPax: m.maxPax == null ? null : numOr(m.maxPax, 0),
    pricePerPayingPax: numOr(m.pricePerPayingPax, 0),
    label: strOr(m.label, ''),
    actualPax: numOr(m.actualPax, 0),
    focPax: numOr(m.focPax, 0),
    payingPax: numOr(m.payingPax, 0),
    totalSell: numOrNull(m.totalSell),
    pricePerActualPax: numOrNull(m.pricePerActualPax),
  };
}
function toOperationalPriceComputation(pc: PriceComputationResult | null): OperationalPriceComputation | null {
  if (pc === null) return null;
  return {
    status: pc.status,
    mode: strOr(pc.mode, ''),
    requestedPax: numOr(pc.requestedPax, 0),
    matchedSlab: toOperationalComputedMatchedSlab(pc),
    totals: toOperationalPricingTotals(pc),
    display: toOperationalPricingDisplay(pc),
    warnings: (pc.warnings ?? []).map((w) => strOr(w, '')),
    foc: toOperationalFoc(pc),
  };
}
function toOperationalCurrentPricing(pc: PriceComputationResult | null): OperationalCurrentPricing | null {
  if (pc === null) return null;
  const m = pc.matchedSlab;
  const matchedSlab: OperationalCurrentMatchedSlab | null = m
    ? {
        minPax: numOr(m.minPax, 0),
        maxPax: numOr(m.maxPax, numOr(m.minPax, 0)),
        price: numOr(m.pricePerPayingPax, 0),
        label: strOr(m.label, ''),
        actualPax: numOr(m.actualPax, 0),
        focPax: numOr(m.focPax, 0),
        payingPax: numOr(m.payingPax, 0),
        totalSell: numOrNull(m.totalSell),
        pricePerPayingPax: numOr(m.pricePerPayingPax, 0),
        pricePerActualPax: numOrNull(m.pricePerActualPax),
      }
    : null;
  return {
    pricingType: strOr(pc.mode, ''),
    pricingMode: pc.mode === 'group' ? 'SLAB' : 'FIXED',
    paxCount: numOr(pc.requestedPax, 0),
    isAvailable: pc.status === 'ok',
    label: strOr(pc.display.summaryLabel, ''),
    value: numOrNull(pc.totals?.pricePerPayingPax) ?? numOrNull(pc.totals?.totalPrice),
    message: strOrNull(pc.warnings?.[0]),
    matchedSlab,
  };
}

// ---------------------------------------------------------------------------
// Root mapper
// ---------------------------------------------------------------------------

export function mapQuoteToOperational(quote: RawOperationalQuote): OperationalQuoteDetail {
  const rawItems = quote.quoteItems ?? [];
  const priceComputation = deriveCostFreePriceComputation(quote);
  const workflowDiagnostics = rawItems.map((it, index) => toOperationalWorkflowDiagnostic(it, index));
  const convertBlockers = workflowDiagnostics.map(toOperationalConvertBlocker);

  return {
    id: strOr(quote.id, ''),
    quoteType: strOr(quote.quoteType, ''),
    jordanPassType: strOr(quote.jordanPassType, ''),
    bookingType: strOr(quote.bookingType, ''),
    title: strOr(quote.title, ''),
    description: strOrNull(quote.description),
    quoteNumber: strOrNull(quote.quoteNumber),
    quoteCurrency: strOr(quote.quoteCurrency, ''),
    proposalLanguage: strOr(quote.proposalLanguage, ''),
    status: strOr(quote.status, ''),
    createdAt: isoString(quote.createdAt),
    updatedAt: isoString(quote.updatedAt),
    adults: numOr(quote.adults, 0),
    children: numOr(quote.children, 0),
    roomCount: numOr(quote.roomCount, 0),
    nightCount: numOr(quote.nightCount, 0),
    travelStartDate: isoOrNull(quote.travelStartDate),
    validUntil: isoOrNull(quote.validUntil),
    sentAt: isoOrNull(quote.sentAt),
    acceptedAt: isoOrNull(quote.acceptedAt),
    revisionNumber: numOr(quote.revisionNumber, 0),
    revisedFromId: strOrNull(quote.revisedFromId),
    acceptedVersionId: strOrNull(quote.acceptedVersionId),
    clientChangeRequestMessage: strOrNull(quote.clientChangeRequestMessage),
    inclusionsText: strOrNull(quote.inclusionsText),
    exclusionsText: strOrNull(quote.exclusionsText),
    termsNotesText: strOrNull(quote.termsNotesText),
    totalSell: numOr(quote.totalSell, 0),
    totalPrice: numOr(quote.totalPrice, 0),
    pricePerPax: numOr(quote.pricePerPax, 0),
    singleSupplement: numOrNull(quote.singleSupplement),
    fixedPricePerPerson: numOr(quote.fixedPricePerPerson, 0),
    pricingType: strOr(quote.pricingType, ''),
    pricingMode: strOr(quote.pricingMode, ''),
    publicEnabled: boolOf(quote.publicEnabled),
    isLatestRevision: boolOf(quote.isLatestRevision),
    company: toOperationalCompany(quote.company),
    contact: toOperationalContact(quote.contact),
    agent: toOperationalAgent(quote.agent),
    quoteItineraryDays: (quote.quoteItineraryDays ?? []).map(toOperationalDay),
    itineraries: (quote.itineraries ?? []).map(toOperationalItinerary),
    quoteItems: rawItems.map(toOperationalQuoteItem),
    quoteOptions: (quote.quoteOptions ?? []).map(toOperationalOption),
    passengers: (quote.passengers ?? []).map(toOperationalPassenger),
    pricingSlabs: (quote.pricingSlabs ?? []).map(toOperationalPricingSlab),
    scenarios: (quote.scenarios ?? []).map(toOperationalScenario),
    invoice: toOperationalInvoice(quote.invoice),
    booking: toOperationalBookingRef(quote.booking),
    currentPricing: toOperationalCurrentPricing(priceComputation),
    priceComputation: toOperationalPriceComputation(priceComputation),
    workflowDiagnostics,
    convertBlockers,
  };
}
