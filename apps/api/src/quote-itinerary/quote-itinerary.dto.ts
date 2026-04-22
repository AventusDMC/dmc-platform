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
