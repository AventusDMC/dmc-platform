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
