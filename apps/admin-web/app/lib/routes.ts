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
  days?: Array<{
    dayNumber: number;
    title?: string | null;
    description?: string | null;
    distanceKm?: number | null;
    driveMinutes?: number | null;
    lunchIncluded?: boolean | null;
    dinnerIncluded?: boolean | null;
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
