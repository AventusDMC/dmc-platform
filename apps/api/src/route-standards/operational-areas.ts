// Operational area helper types + PURE list utilities.
//
// Operational Areas Catalog v1 moved the source-of-truth dictionary into
// the DB (apps/api/src/operational-areas/operational-areas.service.ts).
// This file now only carries shared TYPES + pure helpers that operate
// on a passed-in array — RouteStandardsService loads the array once per
// request and feeds it through these helpers.

export type OperationalAreaType =
  | 'CITY'
  | 'AIRPORT'
  | 'BORDER'
  | 'HOTEL_ZONE'
  | 'TOURISM_SITE'
  | 'CAMP_AREA'
  | 'PORT'
  | 'RESORT_AREA';

/** Shape returned by the DB-backed OperationalAreasService.findAll(). */
export type OperationalArea = {
  id: string;
  code: string;
  name: string;
  type: OperationalAreaType | string;
  city: string;
  region?: string | null;
  country?: string | null;
  isActive?: boolean;
  airportRouteFlagDefault?: boolean;
  borderCrossingFlagDefault?: boolean;
  mountainRoadFlagDefault?: boolean;
  overnightRiskDefault?: boolean;
};

/** Look up an area by id within a pre-loaded list (avoids extra DB hits
 *  when the caller already has the full list in memory). */
export function pickAreaById(areas: OperationalArea[], id: string | null | undefined): OperationalArea | null {
  if (!id) return null;
  return areas.find((a) => a.id === id) || null;
}

/** Look up an area by code within a pre-loaded list. Case-insensitive. */
export function pickAreaByCode(areas: OperationalArea[], code: string | null | undefined): OperationalArea | null {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  return areas.find((a) => a.code === normalized) || null;
}

// Best-match preference order when a city has multiple areas (Amman →
// Amman City + QAIA). Keep in sync with the DB-backed service preference.
const PREFERRED_TYPE_ORDER: Array<OperationalAreaType | string> = [
  'CITY',
  'TOURISM_SITE',
  'RESORT_AREA',
  'CAMP_AREA',
  'BORDER',
  'HOTEL_ZONE',
  'PORT',
  'AIRPORT',
];

/** Best-match for a city name within a pre-loaded list. CITY type wins
 *  when multiple areas anchor to the same city; caller can force a
 *  different preference via preferType. */
export function pickAreaByCity(
  areas: OperationalArea[],
  city: string | null | undefined,
  options: { preferType?: OperationalAreaType } = {},
): OperationalArea | null {
  if (!city) return null;
  const normalized = String(city).trim().toLowerCase();
  if (!normalized) return null;
  const matches = areas.filter((a) => a.city.toLowerCase() === normalized);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const types = options.preferType
    ? [options.preferType, ...PREFERRED_TYPE_ORDER.filter((t) => t !== options.preferType)]
    : PREFERRED_TYPE_ORDER;
  for (const type of types) {
    const found = matches.find((a) => a.type === type);
    if (found) return found;
  }
  return matches[0];
}

/** OR-merge the default risk flags from two area endpoints. The Route
 *  Builder uses this to pre-populate the smart-default flags before the
 *  operator confirms. */
export function mergeDefaultFlagsFor(
  from: OperationalArea | null | undefined,
  to: OperationalArea | null | undefined,
) {
  return {
    airportRouteFlag: Boolean(from?.airportRouteFlagDefault || to?.airportRouteFlagDefault),
    borderCrossingFlag: Boolean(from?.borderCrossingFlagDefault || to?.borderCrossingFlagDefault),
    mountainRoadFlag: Boolean(from?.mountainRoadFlagDefault || to?.mountainRoadFlagDefault),
    overnightRisk: Boolean(from?.overnightRiskDefault || to?.overnightRiskDefault),
  };
}
