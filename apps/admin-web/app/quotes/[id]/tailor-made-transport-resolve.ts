// Phase R.6B-0 — pure resolver for the tailor-made TRANSPORT price preview.
//
// The tailor-made transport SUGGESTIONS are descriptive-only (origin/destination
// city names + an admin pricing-mode hint; no route/serviceType/rate ids). To
// preview a real price via the canonical POST /transport-pricing/calculate
// endpoint we must first resolve each suggestion to a concrete route +
// transport service type. This module does exactly that, mirroring the
// Auto-Itinerary Builder's proven matching helpers (findAirportRoute / findRoute
// / findDailyDisposalRoute / pickTransportServiceType) as PURE functions so they
// can be unit-tested in isolation. It performs NO pricing, NO writes, and never
// imports the pricing engine — the panel calls the existing calculate endpoint.

import type { RouteOption } from '../../lib/routes';

export type TransportServiceTypeOption = { id: string; name: string; code: string };

export type TransportSuggestionLike = {
  dayNumber: number;
  title?: string | null;
  routeLabel?: string | null;
  origin?: string | null;
  destination?: string | null;
  stops?: string[];
  suggestedTransportType: 'ARRIVAL_TRANSFER' | 'DEPARTURE_TRANSFER' | 'TOURING_FULL_DAY' | 'NONE';
  pricingModeSuggestion?: 'POINT_TO_POINT' | 'FULL_DAY' | null;
};

export type TransportResolveStatus = 'OK' | 'NO_ROUTE' | 'NO_RATE' | 'NEEDS_SELECTION';

export type TransportResolvedPlan = {
  // Resolution status BEFORE pricing. 'OK' here means a route + service type were
  // resolved and the leg is priceable; the panel still calls /transport-pricing/
  // calculate and downgrades to 'NO_RATE' when the engine finds no rate.
  status: Extract<TransportResolveStatus, 'OK' | 'NO_ROUTE'>;
  routeId: string | null;
  normalizedKey: string | null;
  routeLabel: string | null;
  serviceTypeId: string | null;
  serviceTypeName: string | null;
  // Admin planning hint only — never client-facing text.
  pricingModeHint: 'POINT_TO_POINT' | 'FULL_DAY' | null;
  reason: string;
};

// Standard non-hotel transport markup. Mirrors the value the Auto-Itinerary
// Builder posts for transport items; kept as one named constant here rather than
// a scattered literal. (Server mirror to live in pricing-constants in R.6B-1.)
export const TRANSPORT_DEFAULT_MARKUP = 20;

export function computeTransportSell(cost: number, markupPercent: number = TRANSPORT_DEFAULT_MARKUP): number {
  return Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
}

// ---- pure matching helpers (mirrors of the Auto-Itinerary Builder) ----

const INVALID_ROUTE_PATTERNS = [/extra\s*km/i, /stationary/i, /per\s*hour/i, /hourly/i];
const NICHE_TRANSPORT_SERVICE_TYPE = /border|overnight|extra|stationary|per.?hour|add.?on|\bkm\b|waiting/i;
const GATEWAY_AIRPORT = /international|queen alia|qaia|king hussein/;

export function normalizeTransportText(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function routeLabelOf(route: RouteOption): string {
  return `${route.fromPlace?.name || ''} ${route.toPlace?.name || ''} ${route.name || ''}`;
}

function isValidRoute(route: RouteOption): boolean {
  if (route.isActive === false) return false;
  const label = routeLabelOf(route);
  return !INVALID_ROUTE_PATTERNS.some((pattern) => pattern.test(label));
}

function endpointText(route: RouteOption, side: 'fromPlace' | 'toPlace'): string {
  const place = route[side];
  return normalizeTransportText([place?.name, place?.city, place?.country].filter(Boolean).join(' '));
}

export function findAirportRoute(routes: RouteOption[], city: string, direction: 'arrival' | 'departure'): RouteOption | null {
  const cityKey = normalizeTransportText(city);
  if (!cityKey) return null;
  const airportSide: 'fromPlace' | 'toPlace' = direction === 'arrival' ? 'fromPlace' : 'toPlace';
  const matches = routes.filter((route) => {
    if (!isValidRoute(route)) return false;
    const from = endpointText(route, 'fromPlace');
    const to = endpointText(route, 'toPlace');
    return direction === 'arrival'
      ? from.includes('airport') && to.includes(cityKey)
      : from.includes(cityKey) && to.includes('airport');
  });
  if (matches.length === 0) return null;
  const gateway = matches.find((route) => GATEWAY_AIRPORT.test(endpointText(route, airportSide)));
  return gateway || matches[0];
}

export function findRoute(routes: RouteOption[], fromCity: string, toCity: string): RouteOption | null {
  const from = normalizeTransportText(fromCity);
  const to = normalizeTransportText(toCity);
  if (!from || !to || from === to) return null;
  let exactMatch: RouteOption | null = null;
  let reverseMatch: RouteOption | null = null;
  for (const route of routes) {
    if (!isValidRoute(route)) continue;
    const routeFrom = endpointText(route, 'fromPlace');
    const routeTo = endpointText(route, 'toPlace');
    if (routeFrom.includes(from) && routeTo.includes(to)) {
      exactMatch = route;
      break;
    }
    if (!reverseMatch && routeFrom.includes(to) && routeTo.includes(from)) {
      reverseMatch = route;
    }
  }
  return exactMatch || reverseMatch;
}

export function findDailyDisposalRoute(routes: RouteOption[]): RouteOption | null {
  const isTouring = (route: RouteOption) =>
    route.routeType === 'TOURING_ROUTE' || route.canonicalRouteType === 'TOURING_ROUTE';
  const transferRoutes = routes.filter((route) => !isTouring(route));
  const byKey = transferRoutes.find((route) => normalizeTransportText(route.normalizedKey) === 'amman amman');
  if (byKey) return byKey;
  return (
    transferRoutes.find((route) => {
      if (route.isActive === false) return false;
      const from = endpointText(route, 'fromPlace');
      const to = endpointText(route, 'toPlace');
      return Boolean(from) && from === to && from.includes('amman');
    }) || null
  );
}

export function pickTransportServiceType(
  types: TransportServiceTypeOption[],
  preferredCodes: string[],
  fallbackPattern: RegExp,
): TransportServiceTypeOption | null {
  for (const code of preferredCodes) {
    const byCode = types.find((type) => (type.code || '').toUpperCase() === code);
    if (byCode) return byCode;
  }
  return (
    types.find(
      (type) =>
        fallbackPattern.test(`${type.name} ${type.code}`) && !NICHE_TRANSPORT_SERVICE_TYPE.test(`${type.name} ${type.code}`),
    ) || null
  );
}

function generalTransferType(types: TransportServiceTypeOption[]): TransportServiceTypeOption | null {
  return (
    pickTransportServiceType(
      types,
      ['POINT_TO_POINT', 'PRIVATE_TRANSFER_SERVICE', 'PRIVATE_TRANSFER', 'INT', 'TRANSFER'],
      /transfer|transport|vehicle|point.?to.?point|intercity/i,
    ) ||
    types[0] ||
    null
  );
}

function airportTransferType(types: TransportServiceTypeOption[]): TransportServiceTypeOption | null {
  return pickTransportServiceType(types, ['AIRPORT_TRANSFER', 'ARR', 'DEP'], /airport/i) || generalTransferType(types);
}

function dailyFullDayType(types: TransportServiceTypeOption[]): TransportServiceTypeOption | null {
  return pickTransportServiceType(types, ['DAILY_FULL_DAY'], /daily|full.?day|package/i) || generalTransferType(types);
}

/**
 * Resolve one transport suggestion to a concrete route + service type for the
 * read-only price preview. Mirrors the Auto-Itinerary Builder's per-leg
 * selection: airport transfers (D1/D8) → airport route + AIRPORT_TRANSFER type;
 * intercity touring legs (origin≠destination) → directional route + general
 * transfer type; same-base day-trips (origin=destination) → daily-disposal route
 * + DAILY_FULL_DAY type. Returns NO_ROUTE when no route or service type resolves.
 */
export function resolveTransportPlan(
  suggestion: TransportSuggestionLike,
  routes: RouteOption[],
  serviceTypes: TransportServiceTypeOption[],
): TransportResolvedPlan {
  const noRoute = (reason: string): TransportResolvedPlan => ({
    status: 'NO_ROUTE',
    routeId: null,
    normalizedKey: null,
    routeLabel: suggestion.routeLabel ?? null,
    serviceTypeId: null,
    serviceTypeName: null,
    pricingModeHint: suggestion.pricingModeSuggestion ?? null,
    reason,
  });

  const origin = (suggestion.origin || '').trim();
  const destination = (suggestion.destination || '').trim();

  let route: RouteOption | null = null;
  let serviceType: TransportServiceTypeOption | null = null;

  if (suggestion.suggestedTransportType === 'ARRIVAL_TRANSFER') {
    serviceType = airportTransferType(serviceTypes);
    route = destination ? findAirportRoute(routes, destination, 'arrival') : null;
  } else if (suggestion.suggestedTransportType === 'DEPARTURE_TRANSFER') {
    serviceType = airportTransferType(serviceTypes);
    route = origin ? findAirportRoute(routes, origin, 'departure') : null;
  } else if (suggestion.suggestedTransportType === 'TOURING_FULL_DAY') {
    const intercity = Boolean(origin && destination && normalizeTransportText(origin) !== normalizeTransportText(destination));
    if (intercity) {
      serviceType = generalTransferType(serviceTypes);
      route = findRoute(routes, origin, destination) || findDailyDisposalRoute(routes);
      if (!route) serviceType = dailyFullDayType(serviceTypes);
    } else {
      serviceType = dailyFullDayType(serviceTypes);
      route = findDailyDisposalRoute(routes);
    }
  } else {
    return noRoute('No transport required for this day.');
  }

  if (!serviceType) return noRoute('No transport service type is configured.');
  if (!route) return noRoute('No active route matched this leg — pricing unavailable.');

  return {
    status: 'OK',
    routeId: route.id,
    normalizedKey: route.normalizedKey || null,
    routeLabel: suggestion.routeLabel || route.name || null,
    serviceTypeId: serviceType.id,
    serviceTypeName: serviceType.name,
    pricingModeHint: suggestion.pricingModeSuggestion ?? null,
    reason: 'Route and service type resolved.',
  };
}
