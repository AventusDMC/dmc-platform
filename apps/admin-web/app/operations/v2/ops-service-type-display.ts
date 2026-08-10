/**
 * Ops-DG-1: curated, PURE serviceType / operationType → friendly-label table.
 *
 * The operations-grid row's `serviceType` is already operationType-first on the
 * backend (bookings.service.ts), so the values here are the operationType vocabulary
 * (AIRPORT_TRANSFER, POINT_TO_POINT, …). This is a display-only map — NO fetch, no
 * mutation, no backend. Unknown values get a documented, safe title-case fallback
 * (never a crash / blank / raw undefined). Icons live in `service-type-icon.tsx`,
 * keyed by the same normalized values.
 */
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  AIRPORT_TRANSFER: 'Airport transfer',
  POINT_TO_POINT: 'Point-to-point transfer',
  ROUTE_TRANSFER: 'Route transfer',
  FULL_DAY: 'Full-day transport',
  TRANSPORT: 'Transport',
  HOTEL: 'Hotel',
  ACTIVITY: 'Activity',
  JEEP_TOUR: 'Jeep tour',
  GUIDE: 'Guide',
  MEAL: 'Meal',
  DINING: 'Dining',
  RESTAURANT: 'Restaurant',
  ENTRANCE: 'Entrance',
  TICKET: 'Ticket',
  EXTERNAL_PACKAGE: 'External package',
  SERVICE: 'Service',
};

/** Documented fallback: friendly title-case of an unknown enum-ish value. */
function titleCaseFallback(key: string): string {
  return key
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Friendly display label for a serviceType/operationType value. Known values map to
 * the curated table; unknown values fall back to a safe title-case; empty/null → the
 * neutral "Service".
 */
export function serviceTypeLabel(type: string | null | undefined): string {
  const key = String(type ?? '').trim().toUpperCase();
  if (!key) return 'Service';
  return SERVICE_TYPE_LABELS[key] ?? titleCaseFallback(key);
}
