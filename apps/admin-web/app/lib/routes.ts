import { PlaceOption } from './places';
import { getCanonicalRouteLabel } from './transport-routes';

export type RouteOption = {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  name: string;
  normalizedKey: string;
  routeType: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  notes: string | null;
  isActive: boolean;
  fromPlace: PlaceOption;
  toPlace: PlaceOption;
  canonicalRouteType?: 'TRANSFER_ROUTE' | 'TOURING_ROUTE' | null;
  isCanonicalTransferRoute?: boolean;
  canonicalRouteCode?: string | null;
  selectorLabel?: string | null;
  transportPickerMode?: 'TRANSFER_ROUTE' | 'TOURING_ROUTE' | 'DISPOSAL';
  code?: string | null;
  startCity?: string | null;
  durationDays?: number | null;
  mainDestinations?: string[] | null;
  touringRoutePricings?: Array<{
    id: string;
    touringRouteId: string;
    supplierId?: string | null;
    supplier?: {
      id?: string | null;
      name?: string | null;
    } | null;
    vehicleId?: string | null;
    vehicle?: {
      name?: string | null;
      vehicleType?: string | null;
      maxPax?: number | null;
    } | null;
    transportServiceTypeId?: string | null;
    transportServiceType?: {
      id?: string | null;
      name?: string | null;
      code?: string | null;
      classification?: string | null;
    } | null;
    pricingBasis?: string | null;
    minPax?: number | null;
    maxPax?: number | null;
    currency?: string | null;
    baseCost?: number | null;
    active?: boolean | null;
  }>;
  routeOperations?: {
    region: string | null;
    overnight: boolean;
    sicPossible: boolean;
    longDistance: boolean;
    guideRecommended: boolean;
    taxonomyReview: string | null;
  };
};

export function formatRouteLabel(route: Pick<RouteOption, 'name' | 'routeType' | 'fromPlace' | 'toPlace'>) {
  const base = route.fromPlace && route.toPlace ? getCanonicalRouteLabel(route.fromPlace.name, route.toPlace.name) : route.name;

  return route.routeType ? `${base} (${route.routeType})` : base;
}

export function formatRouteSelectorLabel(route: Pick<RouteOption, 'selectorLabel' | 'canonicalRouteCode' | 'fromPlace' | 'toPlace' | 'name'>) {
  if (route.selectorLabel) {
    return route.selectorLabel;
  }

  if (route.canonicalRouteCode && route.fromPlace && route.toPlace) {
    return `${route.canonicalRouteCode} \u00b7 ${route.fromPlace.name} \u2194 ${route.toPlace.name}`;
  }

  return route.fromPlace && route.toPlace ? `${route.fromPlace.name} \u2194 ${route.toPlace.name}` : route.name;
}

// Phase 3D.1G \u2014 touring-route picker label. The generic formatRouteLabel collapses
// every touring route to "fromCity \u2192 toCity", producing many indistinguishable
// duplicates ("Petra \u2192 Petra", "Amman \u2192 Amman"). For the touring-route generator we
// instead show the real route NAME + CODE + duration so operators can pick the right
// variant. Display-only \u2014 never used for selection (the option value stays route.id).
// Format: "[Route Name] \u2014 [Code] \u2014 [N] day(s)".
export function formatTouringRouteOptionLabel(
  route: Pick<RouteOption, 'name' | 'code' | 'durationDays'>,
): string {
  // Normalize ASCII arrows in stored names to a nicer glyph (display only).
  const name = (route.name || '').trim().replace(/\s*->\s*/g, ' \u2192 ') || 'Untitled route';
  const parts: string[] = [name];
  const code = (route.code || '').trim();
  if (code) parts.push(code);
  const days = route.durationDays;
  if (typeof days === 'number' && days > 0) {
    parts.push(`${days} day${days === 1 ? '' : 's'}`);
  }
  return parts.join(' \u2014 ');
}

// Phase 3D.1G \u2014 small secondary line shown under the picker for the chosen route.
// Helps disambiguate variants further without bloating each <option>.
export function formatTouringRouteSecondaryMeta(
  route: Pick<RouteOption, 'startCity' | 'mainDestinations' | 'touringRoutePricings'>,
): string {
  const bits: string[] = [];
  const start = (route.startCity || '').trim();
  if (start) bits.push(`Start: ${start}`);
  const dests = (route.mainDestinations || []).filter((d): d is string => Boolean(d && d.trim()));
  if (dests.length) bits.push(`Destinations: ${dests.join(', ')}`);
  const activePricing = (route.touringRoutePricings || []).filter((p) => p.active !== false).length;
  bits.push(`${activePricing} active pricing row${activePricing === 1 ? '' : 's'}`);
  return bits.join(' \u00b7 ');
}

// Phase 3D.1G \u2014 case-insensitive search over a touring route's name, code, start
// city and main destinations. Empty/whitespace term matches everything.
export function touringRouteMatchesSearch(
  route: Pick<RouteOption, 'name' | 'code' | 'startCity' | 'mainDestinations'>,
  term: string,
): boolean {
  const q = (term || '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    route.name || '',
    route.code || '',
    route.startCity || '',
    ...((route.mainDestinations || []).filter(Boolean) as string[]),
  ]
    .join('  ')
    .toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
}
