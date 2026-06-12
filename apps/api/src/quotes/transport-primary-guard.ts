// Emergency fix (transport-petra-overnight-fix) — backend defense-in-depth.
//
// A PRIMARY transport line (the day's transfer / full-day / point-to-point line)
// must never attach a niche/add-on transport SupplierService as its container,
// e.g. the row literally named "Petra Overnight", or stationary / waiting /
// extra-km / extra-hour / border services. Those are surcharge/add-on concepts,
// never the primary transport item. This guards the SupplierService NAME/CATEGORY
// layer; it complements the existing ADD_ON guard in TransportPricingService,
// which guards the TransportServiceType / VehicleRate *classification* layer.
//
// It deliberately does NOT match valid primary transport names — "Airport
// Transfer", "Point-to-Point", "Daily Full Day", "Private Transfer",
// "Jordan Private Transfer Service", etc. all pass.
//
// The future T.5G add-on attachment path is separate and is not active now.

export const NICHE_TRANSPORT_PRIMARY_SERVICE_PATTERN =
  /\bovernight\b|driver\s*overnight|\bstationary\b|\bwaiting\b|extra\s*(?:km|kilometre|kilometer|hour)|\bborder\b/i;

export function isNicheTransportPrimaryService(
  service: { name?: string | null; category?: string | null } | null | undefined,
): boolean {
  if (!service) return false;
  return NICHE_TRANSPORT_PRIMARY_SERVICE_PATTERN.test(`${service.name || ''} ${service.category || ''}`);
}

/** True when the create/update request describes a PRIMARY transport line. */
export function isPrimaryTransportRequest(data: {
  transportServiceTypeId?: string | null;
  routeId?: string | null;
  vehicleRateId?: string | null;
}): boolean {
  return Boolean(data.transportServiceTypeId || data.routeId || data.vehicleRateId);
}
