export type QuoteItineraryAuditActor = {
  id: string;
  auditLabel: string;
} | null;

export type CreateQuoteItineraryDayDto = {
  dayNumber: number;
  title: string;
  notes?: string | null;
  // Phase P.3X-5E-4B — language of `notes` (en|es|pt|ar); null/omitted = unknown.
  // Metadata only; proposal-v3 does not read it yet (capture-only).
  notesLanguage?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type UpdateQuoteItineraryDayDto = {
  dayNumber?: number;
  title?: string;
  notes?: string | null;
  // Phase P.3X-5E-4B — see CreateQuoteItineraryDayDto. On update: unchanged when
  // notes is not being changed; set to this locale when notes changes and a locale
  // is declared; reset to null when notes changes without a declared locale.
  notesLanguage?: string | null;
  country?: string | null;
  // Transport day-classification metadata (PR6 fields, PR7 planner capture). Optional;
  // omitted = unchanged. Metadata only — never touches live pricing.
  transportDayType?: string | null;
  vehicleRetained?: boolean | null;
  vehicleReleased?: boolean | null;
  inRetainedBlock?: boolean | null;
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
