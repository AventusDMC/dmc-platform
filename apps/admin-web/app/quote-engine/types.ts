export type DmcQuoteSegmentType = 'INTERNAL_JORDAN' | 'EXTERNAL_PACKAGE';
export type DmcConnectionType = 'FLIGHT' | 'BORDER' | 'TRANSFER' | 'NONE';
export type DmcPricingBasis = 'PER_PERSON' | 'PER_GROUP';
export type DmcDayServiceType = 'TRANSPORT' | 'HOTEL' | 'MEAL' | 'GUIDE' | 'ENTRANCE' | 'ACTIVITY' | 'OTHER';
export type ExternalPackageRequestStatus = 'DRAFT' | 'SENT' | 'RECEIVED';
export type PricingMatrixScope = 'TOTAL_QUOTE' | 'SEGMENT';

export type DmcQuoteDayService = {
  id: string;
  dayId: string;
  type: DmcDayServiceType;
  title: string;
  description?: string | null;
  supplierId?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
  pricingBasis?: DmcPricingBasis | null;
};

export type DmcQuoteDay = {
  id: string;
  segmentId: string;
  dayNumber: number;
  title: string;
  description?: string | null;
  mealsIncludedText?: string | null;
  services?: DmcQuoteDayService[];
};

export type DmcQuoteHotelOption = {
  id: string;
  optionSetId: string;
  city: string;
  hotelId?: string | null;
  hotelNameSnapshot: string;
  nights: number;
  roomType: string;
  mealPlan: string;
};

export type DmcQuoteHotelOptionSet = {
  id: string;
  segmentId: string;
  name: string;
  sortOrder: number;
  options?: DmcQuoteHotelOption[];
};

export type DmcExternalPackageQuote = {
  id: string;
  requestId: string;
  supplierName: string;
  pricingMatrixJson: unknown;
  singleSupplement?: number | null;
  includesText?: string | null;
  excludesText?: string | null;
  notes?: string | null;
};

export type DmcExternalPackageRequest = {
  id: string;
  segmentId: string;
  supplierName: string;
  paxRange: string;
  hotelCategory?: string | null;
  boardBasis?: string | null;
  itineraryText?: string | null;
  notes?: string | null;
  status: ExternalPackageRequestStatus;
  supplierQuotes?: DmcExternalPackageQuote[];
};

export type DmcQuotePricingMatrix = {
  id: string;
  quoteId: string;
  scope: PricingMatrixScope;
  segmentId?: string | null;
  rowsJson: unknown;
};

export type DmcQuoteSegment = {
  id: string;
  quoteId: string;
  orderIndex: number;
  type: DmcQuoteSegmentType;
  country: string;
  title: string;
  durationDays: number;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  days?: DmcQuoteDay[];
  hotelOptionSets?: DmcQuoteHotelOptionSet[];
  externalPackageRequests?: DmcExternalPackageRequest[];
  pricingMatrices?: DmcQuotePricingMatrix[];
};

export type DmcQuoteConnection = {
  id: string;
  quoteId: string;
  fromSegmentId: string;
  toSegmentId: string;
  orderIndex: number;
  type: DmcConnectionType;
  description?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
  pricingBasis?: DmcPricingBasis | null;
};

export type DmcQuote = {
  id: string;
  clientName: string;
  title: string;
  startDate: string;
  endDate: string;
  currency: string;
  status: string;
  segments?: DmcQuoteSegment[];
  connections?: DmcQuoteConnection[];
  pricingMatrices?: DmcQuotePricingMatrix[];
};
