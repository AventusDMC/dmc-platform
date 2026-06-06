// Phase 3D.2D / 3D.2D.1 — pure label helpers for quote item cards (admin display
// only).
//
// A touring-route TRANSPORT PACKAGE (created by the "Generate from Touring Route"
// flow) links a touring route. Its admin card previously rendered the generic
// transport service name ("Airport Transfer — From Amman") because the shared
// excursion-name formatter prioritizes the service name. These helpers produce a
// route-aware label instead.
//
// Discriminator (3D.2D.1): a touring-route item is a PACKAGE when it links a
// route and is NOT an excursion. Excursions come from excursion templates and
// carry excursionTemplateId / excursionTemplateComponentId or an "Excursion
// template: …" override reason. We deliberately do NOT key off the touring-route
// pricing row: touring-route EXCURSIONS also carry a touringRoutePricingId (so it
// can't discriminate), and that field can be absent from leaner item payloads
// (which made the package label silently fall back to the old service name).
// No pricing, no item creation, no proposal changes.

export type TouringRouteLabelInput = {
  name: string;
  startCity: string;
  mainDestinations?: string[] | null;
  stops?: Array<{ city?: string | null; location?: string | null }>;
};

export type TouringRoutePackageDetectInput = {
  touringRoute?: unknown | null;
  excursionTemplateId?: string | null;
  excursionTemplateComponentId?: string | null;
  overrideReason?: string | null;
};

function isTouringRouteExcursionItem(item: TouringRoutePackageDetectInput): boolean {
  if (item.excursionTemplateId || item.excursionTemplateComponentId) return true;
  return /excursion template/i.test(String(item.overrideReason || ''));
}

/**
 * True for a touring-route TRANSPORT PACKAGE line: links a touring route and is
 * NOT an excursion (excursion-template id/component id, or an "Excursion
 * template: …" override reason). Independent of pricing-row hydration. Items
 * with no touring route (true airport transfers, regular transfers, disposal)
 * return false and keep their existing label.
 */
export function isTouringRoutePackageItem(item: TouringRoutePackageDetectInput): boolean {
  return Boolean(item.touringRoute) && !isTouringRouteExcursionItem(item);
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

  // No destinations available (lean payload) → fall back to the route name
  // rather than showing the lone start city.
  if (dests.length === 0) return cleanCity(route.name) || start;

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

/**
 * Shared entry point for the several admin item-title functions: returns the
 * route-aware package label when `item` is a touring-route PACKAGE, else null so
 * the caller keeps its existing label (excursion / transfer / disposal). Lets
 * every admin title path opt in with one guard instead of duplicating the logic.
 */
export function resolveTouringRoutePackageLabel(item: TouringRoutePackageDetectInput): string | null {
  if (!isTouringRoutePackageItem(item)) return null;
  const route = item.touringRoute as TouringRouteLabelInput | null | undefined;
  return route ? formatTouringRoutePackageLabel(route) : null;
}
