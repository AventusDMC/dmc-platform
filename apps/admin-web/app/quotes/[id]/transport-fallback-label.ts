// Emergency fix (transport-petra-overnight-fix) — display hardening. A transport
// QuoteItem that has a route / transport service type but NO applied vehicle rate
// and NO operator transportLabel must not fall back to its raw container
// SupplierService name (which can be a mislabelled row like "Petra Overnight").
// Instead derive a safe operational label from the transport service type + the
// route origin/destination, e.g. "Airport Transfer — QAIA Airport → Amman".

export type TransportFallbackItem = {
  routeId?: string | null;
  transportServiceTypeId?: string | null;
  transportLabel?: string | null;
  pricingDescription?: string | null;
  appliedVehicleRate?: {
    routeName?: string | null;
    serviceType?: { name?: string | null } | null;
    route?: {
      name?: string | null;
      fromPlace?: { name?: string | null } | null;
      toPlace?: { name?: string | null } | null;
    } | null;
    fromPlace?: { name?: string | null } | null;
    toPlace?: { name?: string | null } | null;
  } | null;
};

const ARROW = /→|->/;

function descriptionSegments(item: TransportFallbackItem): string[] {
  return (item.pricingDescription || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The canonical transport-type label ("Airport Transfer", "Point-to-Point", …). */
function resolveServiceTypeLabel(item: TransportFallbackItem): string {
  const fromRate = item.appliedVehicleRate?.serviceType?.name?.trim();
  if (fromRate) return fromRate;
  // The pricing description is "<Type> | <Route> | <Vehicle> | …" — the first
  // segment that isn't itself a route (no arrow) is the canonical type label.
  const firstNonRoute = descriptionSegments(item).find((seg) => !ARROW.test(seg));
  return firstNonRoute || 'Transport';
}

/** The route "origin → destination" for the item, if resolvable. */
function resolveRouteLabel(item: TransportFallbackItem): string | null {
  const rate = item.appliedVehicleRate;
  if (rate?.routeName?.trim()) return rate.routeName.trim();
  if (rate?.route?.name?.trim()) return rate.route.name.trim();
  const from = rate?.route?.fromPlace?.name || rate?.fromPlace?.name;
  const to = rate?.route?.toPlace?.name || rate?.toPlace?.name;
  if (from && to) return `${from} → ${to}`;
  const arrowSeg = descriptionSegments(item).find((seg) => ARROW.test(seg));
  return arrowSeg || null;
}

/**
 * Safe route-based label for a transport item lacking a vehicle rate / label.
 * Returns null when the item isn't a route/service-type-shaped transport line,
 * so the caller keeps its existing (non-transport) fallback unchanged.
 */
export function deriveTransportFallbackLabel(item: TransportFallbackItem): string | null {
  const isTransportShaped = Boolean(item.routeId || item.transportServiceTypeId);
  if (!isTransportShaped) return null;
  const typeLabel = resolveServiceTypeLabel(item);
  const route = resolveRouteLabel(item);
  if (route) return typeLabel ? `${typeLabel} — ${route}` : route;
  return typeLabel || null;
}
