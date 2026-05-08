import type { RouteOption } from './routes';

export const MOVEMENT_ROUTE_TYPES = [
  'Airport Transfer',
  'Point-to-Point',
  'City Transfer',
  'Excursion',
  'Intercity',
  'Border Transfer',
  'Other',
];

const PRICING_ROUTE_TERMS = [
  'extra km',
  'extra kilometer',
  'extra hour',
  'waiting',
  'stationary',
  'driver accommodation',
  'parking fee',
];

export function isFixedMovementRouteType(value?: string | null) {
  return MOVEMENT_ROUTE_TYPES.includes(String(value || '').trim());
}

export function getCanonicalRouteLabel(fromPlaceName: string, toPlaceName: string) {
  return `${fromPlaceName.trim()} → ${toPlaceName.trim()}`;
}

export function buildMovementRouteName(
  fromPlace: { name: string } | null | undefined,
  toPlace: { name: string } | null | undefined,
) {
  if (!fromPlace || !toPlace) {
    return '';
  }

  return getCanonicalRouteLabel(fromPlace.name, toPlace.name);
}

export function normalizeTransportRouteText(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s*(?:\u2194|<->|-->|->|=>|\u2192|\u2014|\u2013|-|\/|\bto\b)\s*/g, ' -> ')
    .replace(/\s*->\s*/g, ' -> ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTransportRoutePart(value: string | null | undefined) {
  return normalizeTransportRouteText(value).replace(/\s*->\s*/g, ' ').trim();
}

export function normalizeTransportRoutePair(fromPlaceName: string, toPlaceName: string) {
  return {
    from: normalizeTransportRoutePart(fromPlaceName),
    to: normalizeTransportRoutePart(toPlaceName),
    label: getCanonicalRouteLabel(fromPlaceName, toPlaceName),
  };
}

export function transportRoutePairsMatch(
  left: { fromPlaceName: string; toPlaceName: string },
  right: { fromPlaceName: string; toPlaceName: string },
) {
  const leftPair = normalizeTransportRoutePair(left.fromPlaceName, left.toPlaceName);
  const rightPair = normalizeTransportRoutePair(right.fromPlaceName, right.toPlaceName);

  return leftPair.from === rightPair.from && leftPair.to === rightPair.to;
}

export function containsPricingRouteTerm(value: string) {
  const normalized = value.toLowerCase();
  return PRICING_ROUTE_TERMS.some((term) => normalized.includes(term));
}

export function isSuspiciousPricingRoute(route: Pick<RouteOption, 'name' | 'routeType' | 'notes' | 'fromPlace' | 'toPlace'>) {
  const haystack = [
    route.name,
    route.routeType || '',
    route.notes || '',
    route.fromPlace?.name || '',
    route.toPlace?.name || '',
  ]
    .join(' ')
    .toLowerCase();

  return containsPricingRouteTerm(haystack);
}
