/**
 * CP-N3b2a — Operational quote-detail DTO (READ-ONLY output contract).
 *
 * The exact, closed allowlist serialized by `GET /quotes/:id/operational`. It is a
 * SELL-SIDE / OPERATIONAL projection of the raw quote for non-finance internal
 * roles (operations / viewer), and is IDENTICAL for every authorized role — there
 * is NO role-dependent branch, no finance/PII variant.
 *
 * It deliberately excludes every buy-side cost / margin / markup / FX / tax-fee
 * reconstruction input / override / internal-pricing-note / supplier-identity /
 * contract-identity / rate relation, every token / booking access-token / snapshot
 * / arbitrary JSON, and all passenger PII beyond { id, firstName, lastName }.
 *
 * Provenance state that non-finance surfaces still need is preserved through two
 * NON-IDENTIFYING sentinels only:
 *   - `contract`  : {} (a linked contract exists) or null — never a name/id/rate.
 *   - supplier ref: { name: "Assigned" } (a supplier is assigned) or null.
 *
 * The companion mapper builds every object below by explicit property assignment
 * (no spreads / Object.assign / JSON clone / recursive sanitizer), so a newly
 * added Prisma column is invisible here until it is explicitly added.
 */

/** Empty contract-presence marker. Serializes as {} (truthy => contracted) or null. */
export type OperationalContractPresence = Record<string, never>;

/** Assignment-truthful supplier reference. The mapped value is exactly this object or null. */
export type OperationalSupplierRef = { name: 'Assigned' };

export interface OperationalQuoteDetail {
  id: string;
  quoteType: string;
  jordanPassType: string;
  bookingType: string;
  title: string;
  description: string | null;
  quoteNumber: string | null;
  quoteCurrency: string;
  proposalLanguage: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  travelStartDate: string | null;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  revisionNumber: number;
  revisedFromId: string | null;
  acceptedVersionId: string | null;
  clientChangeRequestMessage: string | null;
  inclusionsText: string | null;
  exclusionsText: string | null;
  termsNotesText: string | null;
  totalSell: number;
  totalPrice: number;
  pricePerPax: number;
  singleSupplement: number | null;
  fixedPricePerPerson: number;
  pricingType: string;
  pricingMode: string;
  publicEnabled: boolean;
  isLatestRevision: boolean;
  company: OperationalCompany | null;
  contact: OperationalContact | null;
  agent: OperationalAgent | null;
  quoteItineraryDays: OperationalItineraryDay[];
  itineraries: OperationalItinerary[];
  quoteItems: OperationalQuoteItem[];
  quoteOptions: OperationalQuoteOption[];
  passengers: OperationalPassenger[];
  pricingSlabs: OperationalPricingSlab[];
  scenarios: OperationalScenario[];
  invoice: OperationalInvoice | null;
  booking: OperationalBookingRef | null;
  currentPricing: OperationalCurrentPricing | null;
  priceComputation: OperationalPriceComputation | null;
  workflowDiagnostics: OperationalWorkflowDiagnostic[];
  convertBlockers: OperationalConvertBlocker[];
}

export interface OperationalCompany {
  id: string;
  name: string;
}

export interface OperationalContact {
  id: string;
  firstName: string;
  lastName: string;
}

export interface OperationalAgent {
  id: string;
  firstName: string;
  lastName: string;
}

export interface OperationalItineraryDay {
  id: string;
  quoteId: string;
  packageTemplateId: string | null;
  packageTemplateDayId: string | null;
  dayNumber: number;
  title: string;
  notes: string | null;
  notesLanguage: string | null;
  country: string | null;
  transportDayType: string | null;
  vehicleRetained: boolean | null;
  vehicleReleased: boolean | null;
  inRetainedBlock: boolean | null;
  overnightCity: string | null;
  vehicleReturnsToBase: boolean | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  dayItems: OperationalDayItem[];
}

export interface OperationalDayItem {
  id: string;
  dayId: string;
  quoteServiceId: string;
  sortOrder: number;
  notes: string | null;
  isActive: boolean;
  quoteService: OperationalQuoteItem;
}

export interface OperationalItinerary {
  id: string;
  quoteId: string;
  dayNumber: number;
  title: string;
  description: string | null;
  images: OperationalItineraryImage[];
}

export interface OperationalItineraryImage {
  id: string;
  itineraryId: string;
  galleryImageId: string;
  sortOrder: number;
  galleryImage: OperationalGalleryImage | null;
}

export interface OperationalGalleryImage {
  id: string;
  imageUrl: string;
  title: string;
}

export interface OperationalQuoteItem {
  id: string;
  quoteId: string;
  optionId: string | null;
  serviceId: string | null;
  activityId: string | null;
  entranceFeeId: string | null;
  itineraryId: string | null;
  packageTemplateId: string | null;
  packageTemplateDayId: string | null;
  packageTemplateComponentId: string | null;
  excursionTemplateId: string | null;
  excursionTemplateComponentId: string | null;
  excursionTemplateComponentOptional: boolean | null;
  quantity: number;
  paxCount: number;
  participantCount: number | null;
  adultCount: number | null;
  childCount: number | null;
  roomCount: number | null;
  nightCount: number | null;
  dayCount: number | null;
  sellPrice: number | null;
  totalSell: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  jordanPassCovered: boolean;
  currency: string;
  quoteCurrency: string;
  customServiceName: string | null;
  transportLabel: string | null;
  standaloneTransfer: boolean;
  guideType: string | null;
  guideDuration: string | null;
  guideOvernight: boolean | null;
  serviceDate: string | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  reconfirmationRequired: boolean;
  reconfirmationDueAt: string | null;
  hotelId: string | null;
  roomCategoryId: string | null;
  seasonName: string | null;
  mealPlan: string | null;
  occupancyType: string | null;
  touringRouteId: string | null;
  externalPackageCountry: string | null;
  externalPackageName: string | null;
  externalStartDay: number | null;
  externalEndDay: number | null;
  externalStartDate: string | null;
  externalEndDate: string | null;
  externalPricingBasis: string | null;
  externalIncludes: string | null;
  externalExcludes: string | null;
  externalHotelsOrSimilar: string | null;
  externalClientDescription: string | null;
  contract: OperationalContractPresence | null;
  hotel: OperationalItemHotel | null;
  roomCategory: OperationalRoomCategory | null;
  activity: OperationalItemActivity | null;
  entranceFee: OperationalItemEntranceFee | null;
  service: OperationalItemService | null;
  touringRoute: OperationalItemTouringRoute | null;
  appliedVehicleRate: OperationalItemAppliedVehicleRate | null;
  touringRoutePricing: OperationalItemTouringRoutePricing | null;
}

export interface OperationalItemHotel {
  id: string;
  name: string;
  city: string;
  category: string;
  preferenceRank: number | null;
}

export interface OperationalRoomCategory {
  id: string;
  name: string;
}

export interface OperationalItemActivity {
  id: string;
  name: string;
}

export interface OperationalItemEntranceFee {
  siteName: string;
}

export interface OperationalItemService {
  name: string;
  serviceType: OperationalServiceType;
}

export interface OperationalServiceType {
  code: string | null;
  name: string;
}

export interface OperationalItemTouringRoute {
  name: string;
  mainDestinations: string | null;
  stops: OperationalTouringRouteStop[];
}

export interface OperationalTouringRouteStop {
  id: string;
  order: number;
  city: string;
  location: string | null;
  notes: string | null;
}

export interface OperationalItemAppliedVehicleRate {
  routeName: string | null;
  route: OperationalVehicleRoute | null;
  vehicle: OperationalVehicle;
  serviceType: OperationalTransportServiceType;
  supplier: OperationalSupplierRef | null;
}

export interface OperationalVehicleRoute {
  fromPlace: OperationalPlace | null;
  toPlace: OperationalPlace | null;
}

export interface OperationalPlace {
  city: string;
}

export interface OperationalVehicle {
  name: string;
  vehicleClass: string;
}

export interface OperationalTransportServiceType {
  code: string;
  name: string;
}

export interface OperationalItemTouringRoutePricing {
  vehicle: OperationalVehicle;
  transportServiceType: OperationalTransportServiceType;
  supplier: OperationalSupplierRef | null;
}

export interface OperationalQuoteOption {
  id: string;
  quoteId: string;
  kind: string;
  name: string;
  notes: string | null;
  pricingMode: string;
  hotelCategoryId: string | null;
  createdAt: string;
  updatedAt: string;
  totalPrice: number;
  totalSell: number;
  pricePerPax: number;
  hotelCategory: OperationalHotelCategory | null;
  hotelOptions: OperationalHotelOption[];
  quoteItems: OperationalQuoteItem[];
}

export interface OperationalHotelCategory {
  id: string;
  name: string;
}

export interface OperationalHotelOption {
  id: string;
  quoteOptionId: string;
  city: string;
  hotelId: string | null;
  roomCategoryId: string | null;
  hotelNameSnapshot: string;
  roomType: string;
  mealPlan: string | null;
  mealPlanCode: string | null;
  nights: number;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  hotel: OperationalItemHotel | null;
  roomCategory: OperationalRoomCategory | null;
  matchedPricedQuoteItemId: string | null;
  pricingMatchStatus: 'matched' | 'ambiguous' | 'none';
  pricingMatchReason:
    | 'direct_option_item_match'
    | 'narrowed_by_room_meal_occupancy_season_date'
    | 'ambiguous_duplicate_candidates'
    | 'no_priced_item_for_option'
    | 'no_contract_linked'
    | 'missing_discriminator';
  matchedDiscriminators: OperationalMatchedDiscriminators | null;
}

export interface OperationalMatchedDiscriminators {
  roomCategoryId: string | null;
  mealPlan: string | null;
  mealPlanCode: string | null;
  occupancyType: string | null;
  seasonName: string | null;
  serviceDate: string | null;
  optionId: string | null;
}

export interface OperationalPassenger {
  id: string;
  firstName: string;
  lastName: string;
}

export interface OperationalPricingSlab {
  id: string;
  minPax: number;
  maxPax: number | null;
  price: number;
  actualPax: number;
  focPax: number;
  payingPax: number;
  totalSell: number;
  pricePerPayingPax: number;
  pricePerActualPax: number | null;
}

export interface OperationalScenario {
  id: string;
  paxCount: number;
  totalSell: number;
  pricePerPax: number;
}

export interface OperationalInvoice {
  id: string;
  totalAmount: number;
  currency: string;
  status: string;
  dueDate: string | null;
}

export interface OperationalBookingRef {
  id: string;
}

export interface OperationalCurrentPricing {
  pricingType: string;
  pricingMode: string;
  paxCount: number;
  isAvailable: boolean;
  label: string;
  value: number | null;
  message: string | null;
  matchedSlab: OperationalCurrentMatchedSlab | null;
}

export interface OperationalCurrentMatchedSlab {
  minPax: number;
  maxPax: number;
  price: number;
  label: string;
  actualPax: number;
  focPax: number;
  payingPax: number;
  totalSell: number | null;
  pricePerPayingPax: number;
  pricePerActualPax: number | null;
}

export interface OperationalPriceComputation {
  status: 'ok' | 'missing_coverage' | 'invalid_config';
  mode: string;
  requestedPax: number;
  matchedSlab: OperationalComputedMatchedSlab | null;
  totals: OperationalPricingTotals;
  display: OperationalPricingDisplay;
  warnings: string[];
  foc: OperationalFoc;
}

export interface OperationalComputedMatchedSlab {
  minPax: number;
  maxPax: number | null;
  pricePerPayingPax: number;
  label: string;
  actualPax: number;
  focPax: number;
  payingPax: number;
  totalSell: number | null;
  pricePerActualPax: number | null;
}

export interface OperationalPricingTotals {
  pricePerPayingPax: number | null;
  pricePerActualPax: number | null;
  totalPrice: number | null;
  totalSell: number | null;
  actualPax: number | null;
  focPax: number | null;
  payingPax: number | null;
  focCount: number | null;
  payablePax: number | null;
  singleSupplement: number | null;
}

export interface OperationalPricingDisplay {
  summaryLabel: string;
  summaryValue: string | null;
  pricingText: string | null;
  focText: string | null;
  singleSupplementText: string | null;
}

export interface OperationalFoc {
  focType: string;
  focRatio: number | null;
  focCount: number | null;
  focRoomType: string | null;
  resolvedFocCount: number;
  resolvedFocRoomType: string | null;
  note: string | null;
}

export interface OperationalWorkflowDiagnostic {
  itemId: string | null;
  itemName: string;
  missingWorkflowFields: string[];
  persistedOperationalFields: OperationalPersistedFields;
}

export interface OperationalPersistedFields {
  serviceDate: string | null;
  itineraryId: string | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  participantCount: number | null;
  adultCount: number | null;
  childCount: number | null;
  paxCount: number | null;
  reconfirmationRequired: boolean | null;
  reconfirmationDueAt: string | null;
  totalSell: number | null;
}

export interface OperationalConvertBlocker {
  blockerType: string;
  source: string;
  active: boolean;
  itemId: string | null;
  itemName: string | null;
  reason: string;
}
