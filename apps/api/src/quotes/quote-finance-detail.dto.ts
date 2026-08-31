/**
 * CP-N3b2c2a — Finance quote-detail DTO (READ-ONLY output contract).
 *
 * The exact, closed allowlist serialized by `GET /quotes/:id/finance-detail`. It is a
 * COST-VISIBLE projection of the raw quote for admin / super_admin / finance, and is
 * IDENTICAL for every authorized role — there is NO role-dependent branch and NO PII
 * variant. Passenger projection stays name-only { id, firstName, lastName }; booking is
 * exactly { id, status }.
 *
 * Relative to the operational DTO it ADDS the finance cost / margin / override /
 * internal-pricing fields, un-sentinels supplier + contract IDENTITY (real names), and
 * replaces the two arbitrary-JSON fields with typed, fail-closed structures
 * (FinancePackageMatrixRow[], FinancePromotionExplanationItem[]) plus a string-list-only
 * hotel fact sheet. It NEVER exposes accessToken / publicToken / any *SnapshotJson /
 * arbitrary Json / passenger PII beyond name / contact-agent email-phone / FX /
 * ratePolicies / raw supplier|contract|rate relation objects / capability URLs.
 *
 * The companion mapper builds every object by explicit property assignment (no spread /
 * Object.assign / JSON clone / recursive scrubber), so a newly added Prisma column is
 * invisible here until it is explicitly added.
 */

import {
  OperationalAgent,
  OperationalCompany,
  OperationalContact,
  OperationalConvertBlocker,
  OperationalCurrentPricing,
  OperationalHotelCategory,
  OperationalInvoice,
  OperationalItemActivity,
  OperationalItemEntranceFee,
  OperationalItemHotel,
  OperationalItemService,
  OperationalItemTouringRoute,
  OperationalItinerary,
  OperationalMatchedDiscriminators,
  OperationalPassenger,
  OperationalPriceComputation,
  OperationalPricingSlab,
  OperationalRoomCategory,
  OperationalScenario,
  OperationalTransportServiceType,
  OperationalVehicle,
  OperationalVehicleRoute,
  OperationalWorkflowDiagnostic,
} from './quote-operational.dto';

/** Real linked-contract identity (replaces the operational {}-presence sentinel). */
export interface FinanceContractRef {
  name: string;
}

/** Real supplier identity (replaces the operational { name: 'Assigned' } sentinel). */
export interface FinanceSupplierRef {
  name: string;
}

/**
 * Hotel fact sheet: string lists ONLY. NEVER a flattened arbitrary object — the mapper
 * accepts only a literal string[] and fails closed to [] for every other shape, so no
 * object key/value (e.g. a structured highlights object's identity.email/phone) can ever
 * become an output string. imageGalleryJson is excluded (no consumer).
 */
export interface FinanceHotelFactSheet {
  shortDescription: string | null;
  highlights: string[];
  amenities: string[];
}

/**
 * Typed replacement for QuoteItem.externalPackagePricingMatrixJson (Json?). Each row is
 * built by literal assignment of exactly these keys; rows with unexpected keys or
 * malformed scalar types are dropped; the never-persisted `id` is never emitted.
 */
export interface FinancePackageMatrixRow {
  label: string;
  paxFrom: number | null;
  paxTo: number | null;
  freePax: number | null;
  costPerPerson: number | null;
  sellPerPerson: number | null;
  notes: string | null;
}

/**
 * Typed replacement for item.promotionExplanation (server-attached, arbitrary). Union
 * mirrors the sole consumer type; the object arm is built by literal assignment of
 * exactly these six keys (rows with unexpected keys are dropped).
 */
export type FinancePromotionExplanationItem =
  | string
  | {
      id: string | null;
      name: string;
      effect: string | null;
      type: string | null;
      minStay: string | number | null;
      boardBasis: string | null;
    };

export interface FinanceItemAppliedVehicleRate {
  routeName: string | null;
  route: OperationalVehicleRoute | null;
  vehicle: OperationalVehicle;
  serviceType: OperationalTransportServiceType;
  supplier: FinanceSupplierRef | null;
}

export interface FinanceItemTouringRoutePricing {
  vehicle: OperationalVehicle;
  transportServiceType: OperationalTransportServiceType;
  supplier: FinanceSupplierRef | null;
}

export interface FinanceQuoteItem {
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
  // ---- FINANCE ADDS (cost / margin / override / internal pricing) ----
  totalCost: number;
  baseCost: number;
  costBaseAmount: number;
  overrideCost: number | null;
  useOverride: boolean;
  overrideReason: string | null;
  markupPercent: number;
  markupAmount: number | null;
  jordanPassSavingsJod: number;
  pricingDescription: string | null;
  baseSell: number | null;
  externalNetCost: number | null;
  externalSupplierName: string | null;
  externalInternalNotes: string | null;
  externalPackageSingleSupplement: number | null;
  externalPackagePricingMatrix: FinancePackageMatrixRow[] | null;
  promotionExplanation: FinancePromotionExplanationItem[] | null;
  // ---- un-sentinel of contract identity ----
  contract: FinanceContractRef | null;
  // ---- item relations (operational shapes reused, EXCEPT supplier un-sentinel) ----
  hotel: OperationalItemHotel | null;
  roomCategory: OperationalRoomCategory | null;
  activity: OperationalItemActivity | null;
  entranceFee: OperationalItemEntranceFee | null;
  service: OperationalItemService | null;
  touringRoute: OperationalItemTouringRoute | null;
  appliedVehicleRate: FinanceItemAppliedVehicleRate | null;
  touringRoutePricing: FinanceItemTouringRoutePricing | null;
}

export interface FinanceDayItem {
  id: string;
  dayId: string;
  quoteServiceId: string;
  sortOrder: number;
  notes: string | null;
  isActive: boolean;
  quoteService: FinanceQuoteItem;
}

export interface FinanceItineraryDay {
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
  dayItems: FinanceDayItem[];
}

export interface FinanceHotelOptionHotel {
  id: string;
  name: string;
  city: string;
  category: string;
  preferenceRank: number | null;
  factSheet: FinanceHotelFactSheet | null;
}

export interface FinanceHotelOption {
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
  hotel: FinanceHotelOptionHotel | null;
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

export interface FinanceQuoteOption {
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
  totalCost: number;
  profit: number;
  packageMarginPercent: number | null;
  hotelCategory: OperationalHotelCategory | null;
  hotelOptions: FinanceHotelOption[];
  quoteItems: FinanceQuoteItem[];
}

export interface FinanceBookingRef {
  id: string;
  status: string;
}

export interface FinanceQuoteDetail {
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
  totalCost: number;
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
  quoteItineraryDays: FinanceItineraryDay[];
  itineraries: OperationalItinerary[];
  quoteItems: FinanceQuoteItem[];
  quoteOptions: FinanceQuoteOption[];
  passengers: OperationalPassenger[];
  pricingSlabs: OperationalPricingSlab[];
  scenarios: OperationalScenario[];
  invoice: OperationalInvoice | null;
  booking: FinanceBookingRef | null;
  currentPricing: OperationalCurrentPricing | null;
  priceComputation: OperationalPriceComputation | null;
  workflowDiagnostics: OperationalWorkflowDiagnostic[];
  convertBlockers: OperationalConvertBlocker[];
}
