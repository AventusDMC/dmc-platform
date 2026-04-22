import { PlaceOption } from './places';

export type RouteOption = {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  name: string;
  routeType: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  notes: string | null;
  isActive: boolean;
  fromPlace: PlaceOption;
  toPlace: PlaceOption;
};

export function formatRouteLabel(route: Pick<RouteOption, 'name' | 'routeType' | 'fromPlace' | 'toPlace'>) {
  const base = route.name || `${route.fromPlace.name} - ${route.toPlace.name}`;

  return route.routeType ? `${base} (${route.routeType})` : base;
}
