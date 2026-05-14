import { ProposalPricingViewModel } from './proposal-pricing';

export type ProposalV3QuoteItem = {
  id: string;
  itineraryId: string | null;
  serviceDate?: Date | string | null;
  startTime?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  meetingPoint?: string | null;
  participantCount?: number | null;
  occupancyType?: string | null;
  mealPlan?: string | null;
  pricingDescription?: string | null;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | string | null;
  ratePolicies?: unknown;
  supplements?: unknown;
  totalCost?: number | null;
  totalSell?: number | null;
  finalCost?: number | null;
  overrideCost?: number | null;
  overrideReason?: string | null;
  useOverride?: boolean | null;
  markupPercent?: number | null;
  markupAmount?: number | null;
  sellPrice?: number | null;
  salesTaxPercent?: number | null;
  salesTaxIncluded?: boolean | null;
  serviceChargePercent?: number | null;
  serviceChargeIncluded?: boolean | null;
  tourismFeeAmount?: number | null;
  tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
  externalPackageCountry?: string | null;
  externalSupplierName?: string | null;
  externalStartDay?: number | null;
  externalEndDay?: number | null;
  externalStartDate?: Date | string | null;
  externalEndDate?: Date | string | null;
  externalPricingBasis?: 'PER_PERSON' | 'PER_GROUP' | string | null;
  externalNetCost?: number | null;
  externalPackagePricingMatrixJson?: unknown;
  externalPackageSingleSupplement?: number | null;
  externalIncludes?: string | null;
  externalExcludes?: string | null;
  externalInternalNotes?: string | null;
  externalHotelsOrSimilar?: string | null;
  externalClientDescription?: string | null;
  activity?: {
    name?: string | null;
    description?: string | null;
    durationMinutes?: number | null;
  } | null;
  service: {
    name: string;
    category: string;
    supplierId?: string | null;
    serviceType?: {
      name: string;
      code: string | null;
    } | null;
  };
  hotel?: {
    name: string;
    city?: string | null;
  } | null;
  contract?: {
    name: string;
  } | null;
  roomCategory?: {
    name: string;
  } | null;
  appliedVehicleRate?: {
    routeName: string;
    vehicle?: {
      name: string;
    } | null;
    serviceType?: {
      name: string;
      code: string | null;
    } | null;
  } | null;
  touringRoute?: {
    name?: string | null;
    startCity?: string | null;
  } | null;
};

export type ProposalV3QuotePlannerDay = {
  id: string;
  dayNumber: number;
  title: string;
  notes?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
  dayItems?: Array<{
    id: string;
    dayId: string;
    quoteServiceId: string;
    sortOrder?: number | null;
    notes?: string | null;
    isActive?: boolean | null;
    quoteService?: ProposalV3QuoteItem | null;
  }>;
};

export type ProposalV3Quote = {
  id: string;
  quoteNumber?: string | null;
  quoteCurrency?: string | null;
  title: string;
  description?: string | null;
  inclusionsText?: string | null;
  exclusionsText?: string | null;
  termsNotesText?: string | null;
  createdAt?: Date | string | null;
  travelStartDate?: Date | string | null;
  nightCount: number;
  adults: number;
  children: number;
  quoteItems: ProposalV3QuoteItem[];
  quoteItineraryDays?: ProposalV3QuotePlannerDay[];
  quoteOptions: Array<{
    id: string;
    kind?: 'HOTEL_OPTION_SET' | 'COMMERCIAL_OPTION' | string | null;
    name?: string | null;
    notes?: string | null;
    hotelOptions?: Array<{
      id: string;
      city?: string | null;
      hotelNameSnapshot?: string | null;
      roomType?: string | null;
      mealPlan?: string | null;
      mealPlanCode?: 'RO' | 'BB' | 'HB' | 'FB' | 'AI' | string | null;
      nights?: number | null;
      isPrimary?: boolean | null;
      roomCategory?: {
        name?: string | null;
        code?: string | null;
      } | null;
      hotel?: {
        name?: string | null;
        city?: string | null;
        factSheet?: {
          shortDescription?: string | null;
          highlightsJson?: unknown;
          amenitiesJson?: unknown;
        } | null;
      } | null;
    }>;
  }>;
  itineraries: Array<{
    id: string;
    dayNumber: number;
    title: string;
    description?: string | null;
  }>;
  clientCompany?: {
    name?: string | null;
    website?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    branding?: {
      displayName?: string | null;
      logoUrl?: string | null;
      headerSubtitle?: string | null;
      footerText?: string | null;
      website?: string | null;
      email?: string | null;
      phone?: string | null;
      primaryColor?: string | null;
    } | null;
  } | null;
  brandCompany?: {
    name?: string | null;
    website?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    branding?: {
      displayName?: string | null;
      logoUrl?: string | null;
      headerSubtitle?: string | null;
      footerText?: string | null;
      website?: string | null;
      email?: string | null;
      phone?: string | null;
      primaryColor?: string | null;
    } | null;
  } | null;
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  pricingMode?: 'SLAB' | 'FIXED' | string | null;
  fixedPricePerPerson?: number | null;
  totalCost?: number | null;
  totalSell?: number | null;
  pricePerPax?: number | null;
  singleSupplement?: number | null;
  currentPricing?: {
    label?: string | null;
    value?: number | null;
    isAvailable?: boolean;
    paxCount?: number;
    matchedSlab?: {
      label: string;
    } | null;
    message?: string | null;
  } | null;
  pricingSlabs?: Array<{
    minPax: number;
    maxPax?: number | null;
    price?: number | null;
    pricePerPayingPax?: number | null;
    notes?: string | null;
    totalSell?: number | null;
    actualPax?: number;
    payingPax?: number;
    focPax?: number | null;
    label?: string | null;
  }> | null;
  priceComputation?: {
    mode: 'simple' | 'group';
    status: 'ok' | 'missing_coverage' | 'invalid_config';
    warnings: string[];
    display: {
      summaryLabel: string;
      summaryValue?: string | null;
      pricingText?: string;
      focText?: string;
      singleSupplementText?: string;
      slabLines?: Array<{ label: string; value: string; detail?: string }>;
      contextLines?: string[];
    };
  } | null;
};

export type ProposalV3InvestmentRow = {
  label: string;
  perGuest: string;
  total: string | null;
  note: string | null;
};

export type ProposalV3DayGroup = {
  label: string;
  items: Array<{
    title: string;
    description: string | null;
    meta: string | null;
  }>;
};

export type ProposalV3Day = {
  dayNumber: number;
  title: string;
  summary: string | null;
  overnightLocation: string | null;
  groups: ProposalV3DayGroup[];
};

export type ProposalV3AccommodationRow = {
  dayLabel: string;
  hotelName: string;
  location: string | null;
  room: string | null;
  meals: string | null;
  note: string | null;
};

export type ProposalV3HotelOption = {
  id: string;
  city: string | null;
  hotelName: string;
  room: string | null;
  mealPlan: string | null;
  nights: number | null;
  isPrimary: boolean;
  shortDescription: string | null;
  highlights: string[];
  amenities: string[];
};

export type ProposalV3HotelOptionSet = {
  id: string;
  name: string;
  notes: string | null;
  options: ProposalV3HotelOption[];
};

export type ProposalV3AccommodationMatrix = {
  optionSets: Array<{
    id: string;
    name: string;
  }>;
  rows: Array<{
    city: string;
    cells: Array<{
      optionSetId: string;
      primaryHotel: string | null;
      room: string | null;
      mealPlan: string | null;
      nights: number | null;
      isRecommended: boolean;
      alternativeHotels: string[];
      hasMoreAlternatives: boolean;
    }>;
  }>;
};

export type ProposalV3ViewModel = {
  documentTitle: string;
  metaTitle: string;
  brandName: string;
  logoUrl: string;
  accentColor: string;
  footerLine: string;
  contactLine: string;
  quoteReference: string;
  travelerName: string;
  coverSubtitle: string;
  destinationLine: string;
  durationLabel: string;
  travelDatesLabel: string;
  coverIntro: string;
  coverSignature: string;
  dayByDayIntro: string;
  subtitle: string;
  proposalDateLabel: string;
  travelerCountLabel: string;
  servicesCountLabel: string;
  totalDaysLabel: string;
  pricingHighlightTotal: string;
  pricingHighlightPerPax: string;
  pricingHighlightCurrency: string;
  journeySummary: string;
  highlights: string[];
  accommodationRows: ProposalV3AccommodationRow[];
  hotelOptionSets: ProposalV3HotelOptionSet[];
  accommodationMatrix: ProposalV3AccommodationMatrix | null;
  days: ProposalV3Day[];
  investment: {
    title: string;
    snapshotLabel: string;
    snapshotValue: string;
    snapshotHelper: string;
    summaryNote: string;
    mode: ProposalPricingViewModel['mode'];
    basisLines: string[];
    noteLines: string[];
    slabRows: ProposalV3InvestmentRow[];
    isPending: boolean;
  };
  inclusions: string[];
  notes: string[];
};
