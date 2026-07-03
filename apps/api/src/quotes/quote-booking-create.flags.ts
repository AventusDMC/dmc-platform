// Booking Creation V2 — Phase 1, Slice 1A booking-create feature flag. Default OFF.
//
// `quote.bookingCreate` gates the NEW V2-scoped booking-create route
// (POST /quotes/:quoteId/v2/booking). The route reuses the EXISTING
// QuotesService.convertToBooking (the same conversion engine Classic uses) — it
// never forks the conversion logic. When OFF (the default), the route returns a
// safe feature_disabled response and writes nothing.
//
// This flag ONLY gates the V2-scoped route. The existing shared Classic
// convert-to-booking endpoint (POST /quotes/:id/convert-to-booking) is
// intentionally NOT gated and keeps working exactly as before — Classic behavior
// is unchanged.

function readBooleanEnv(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

export const QUOTE_BOOKING_CREATE_FLAG = 'quote.bookingCreate';

// OFF unless QUOTE_BOOKING_CREATE is explicitly truthy.
export function isQuoteBookingCreateEnabled(): boolean {
  return readBooleanEnv('QUOTE_BOOKING_CREATE');
}
