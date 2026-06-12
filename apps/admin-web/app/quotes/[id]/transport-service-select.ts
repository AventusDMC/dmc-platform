// Emergency fix (transport-petra-overnight-fix) — shared niche-transport-service
// selection. A "primary" transport line (airport transfer, intercity, full-day
// disposal, point-to-point) must attach a GENERAL transport SupplierService as
// its container — never a niche/add-on one (driver overnight, stationary/waiting,
// extra km/hour, border). Picking the first transport-category service used to
// land on the row literally named "Petra Overnight", so tailor-made transport
// applies attached that container; items without a vehicle rate then displayed
// the raw container name "Petra Overnight". This is the single source of truth
// the Auto Itinerary Builder and the tailor-made planner both use.

export const NICHE_TRANSPORT_SERVICE_PATTERN = /border|overnight|extra|stationary|per.?hour|add.?on|\bkm\b|waiting/i;

export type TransportServiceLike = {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  serviceType?: { name?: string | null; code?: string | null } | null;
};

/** True when a transport SupplierService is a niche/add-on container, not a general transfer. */
export function isNicheTransportService(service: TransportServiceLike | null | undefined): boolean {
  if (!service) return false;
  return NICHE_TRANSPORT_SERVICE_PATTERN.test(
    `${service.name || ''} ${service.category || ''} ${service.serviceType?.name || ''} ${service.serviceType?.code || ''}`,
  );
}

/**
 * From an already-filtered list of transport-category services, pick the first
 * GENERAL one (skipping niche/add-on names). Falls back to the first match when
 * no general transfer service exists, so a quote with only niche services still
 * resolves something rather than null.
 */
export function selectGeneralTransportService<T extends TransportServiceLike>(transportServices: T[]): T | null {
  const general = transportServices.find((service) => !isNicheTransportService(service));
  return general || transportServices[0] || null;
}
