export type QuoteItineraryAuditActor = {
  id: string;
  auditLabel: string;
} | null;

export type CreateQuoteItineraryDayDto = {
  dayNumber: number;
  title: string;
  notes?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type UpdateQuoteItineraryDayDto = {
  dayNumber?: number;
  title?: string;
  notes?: string | null;
  country?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type CreateQuoteItineraryDayItemDto = {
  quoteServiceId: string;
  sortOrder?: number;
  notes?: string | null;
  isActive?: boolean;
};

export type UpdateQuoteItineraryDayItemDto = {
  quoteServiceId?: string;
  sortOrder?: number;
  notes?: string | null;
  isActive?: boolean;
};

// Phase 3B.1 — a single ordered POI assignment on a day. poiId is the live
// content source; sourceTouringRouteStopId is optional provenance; fallbackTitle/
// fallbackCity are snapshotted from the POI at assignment time (an explicit value
// here overrides the snapshot). The proposal does not consume these yet (3B.2).
export type QuoteItineraryDayPoiInputDto = {
  poiId?: string | null;
  sourceTouringRouteStopId?: string | null;
  fallbackTitle?: string | null;
  fallbackCity?: string | null;
};

export type SetQuoteItineraryDayPoisDto = {
  assignments: QuoteItineraryDayPoiInputDto[];
};
