// Phase 3D.2D — pure label helpers for quote item cards (admin display only).
//
// A touring-route TRANSPORT PACKAGE (created by the "Generate from Touring Route"
// flow) links a touring route AND carries a touring-route pricing row. Its admin
// card previously rendered the generic transport service name ("Airport Transfer
// — From Amman") because the shared excursion-name formatter prioritizes the
// service name. These helpers produce a route-aware label instead. Touring-route
// EXCURSIONS (route linked, NO pricing row) are intentionally NOT packages and
// keep their existing label. No pricing, no item creation, no proposal changes.

export type TouringRouteLabelInput = {
  name: string;
  startCity: string;
  mainDestinations?: string[] | null;
  stops?: Array<{ city?: string | null; location?: string | null }>;
};

export type TouringRoutePackageDetectInput = {
  touringRoute?: unknown | null;
  touringRoutePricingId?: string | null;
  touringRoutePricing?: unknown | null;
};

/**
 * True only for a touring-route TRANSPORT PACKAGE line: a quote item that both
 * links a touring route and carries a touring-route pricing row. Touring-route
 * excursions (route linked, no pricing row) return false and keep their label.
 */
export function isTouringRoutePackageItem(item: TouringRoutePackageDetectInput): boolean {
  return Boolean(item.touringRoute) && Boolean(item.touringRoutePricingId || item.touringRoutePricing);
}

const ARROW = ' → '; // " → "

function cleanCity(value: string | null | undefined): string {
  return String(value || '').trim();
}

/**
 * Clean operator/client-facing route path: startCity then each destination,
 * joined with " → ", consecutive duplicates collapsed and the trailing
 * return-to-start city dropped ("Amman → Dana → Petra → Amman" → "Amman → Dana
 * → Petra"). Prefers mainDestinations; falls back to ordered stop cities; then
 * the route name. Pure + deterministic.
 */
export function formatTouringRoutePackagePath(route: TouringRouteLabelInput): string {
  const start = cleanCity(route.startCity);
  const fromMain = (route.mainDestinations || []).map(cleanCity).filter(Boolean);
  const fromStops = (route.stops || []).map((s) => cleanCity(s.location) || cleanCity(s.city)).filter(Boolean);
  const dests = fromMain.length > 0 ? fromMain : fromStops;

  const seq: string[] = [];
  for (const city of [start, ...dests]) {
    if (!city) continue;
    if (seq.length && seq[seq.length - 1].toLowerCase() === city.toLowerCase()) continue;
    seq.push(city);
  }
  // Drop a trailing round-trip return to the start city.
  if (seq.length > 2 && seq[0].toLowerCase() === seq[seq.length - 1].toLowerCase()) seq.pop();

  return seq.length > 0 ? seq.join(ARROW) : cleanCity(route.name);
}

/** Full admin-card label for a touring-route package transport item. */
export function formatTouringRoutePackageLabel(route: TouringRouteLabelInput): string {
  const path = formatTouringRoutePackagePath(route);
  return path ? `Touring Route — ${path}` : 'Touring Route'; // "Touring Route — …"
}
