// Operational Area Dictionary — the canonical list of "operational
// movement endpoints" in the Jordan ERP. Each area has:
//   - a short code (AMM, QAIA, PET, …) used in FROM_TO route codes
//   - a full operator-facing display name
//   - a type (CITY / AIRPORT / ATTRACTION / BORDER) for grouping +
//     default risk-flag suggestions in the Route Builder UI
//   - an optional anchor city used by the timing-sanity validator
//     (Petra Visitor Center → city=Petra; QAIA → city=Amman, etc.)
//
// This dictionary is the single source of truth the Route Builder UI
// renders as From/To dropdowns. The same codes are used by the
// canonical route-code generator and by the duplicate detector. New
// areas should be added here, not invented at the form layer.

export type OperationalAreaType = 'CITY' | 'AIRPORT' | 'ATTRACTION' | 'BORDER';

export type OperationalArea = {
  /** Stable identifier — used as the dropdown option value. */
  id: string;
  /** Operator-facing label rendered in dropdowns and route names. */
  displayName: string;
  /** Short code used in canonical FROM_TO route codes (AMM, PET, etc.). */
  code: string;
  /** Category — drives default risk-flag suggestions in the builder. */
  type: OperationalAreaType;
  /** Anchor city for the area. Used by the sanity validator to apply
   *  realistic per-leg duration caps even when the area itself is an
   *  airport/attraction (QAIA anchors to Amman, Petra Visitor Center
   *  anchors to Petra). */
  city: string;
  /** Optional default risk flags suggested when this area is on either
   *  side of a route — the operator can always override. */
  defaultFlags?: Partial<{
    airportRouteFlag: boolean;
    borderCrossingFlag: boolean;
    mountainRoadFlag: boolean;
    overnightRisk: boolean;
  }>;
};

export const OPERATIONAL_AREAS: OperationalArea[] = [
  {
    id: 'amman-city',
    displayName: 'Amman City',
    code: 'AMM',
    type: 'CITY',
    city: 'Amman',
  },
  {
    id: 'queen-alia-airport',
    displayName: 'Queen Alia International Airport',
    code: 'QAIA',
    type: 'AIRPORT',
    city: 'Amman',
    defaultFlags: { airportRouteFlag: true },
  },
  {
    id: 'petra-visitor-center',
    displayName: 'Petra Visitor Center',
    code: 'PET',
    type: 'ATTRACTION',
    city: 'Petra',
  },
  {
    id: 'wadi-rum-camp-area',
    displayName: 'Wadi Rum Camp Area',
    code: 'WR',
    type: 'ATTRACTION',
    city: 'Wadi Rum',
  },
  {
    id: 'aqaba-city',
    displayName: 'Aqaba City',
    code: 'AQJ',
    type: 'CITY',
    city: 'Aqaba',
  },
  {
    id: 'king-hussein-airport-aqaba',
    displayName: 'King Hussein International Airport (Aqaba)',
    code: 'AQJ',
    type: 'AIRPORT',
    city: 'Aqaba',
    defaultFlags: { airportRouteFlag: true },
  },
  {
    id: 'dead-sea-resort-area',
    displayName: 'Dead Sea Resort Area',
    code: 'DS',
    type: 'ATTRACTION',
    city: 'Dead Sea',
  },
  {
    id: 'jerash-archaeological-site',
    displayName: 'Jerash Archaeological Site',
    code: 'JER',
    type: 'ATTRACTION',
    city: 'Jerash',
  },
  {
    id: 'ajloun-castle',
    displayName: 'Ajloun Castle',
    code: 'AJL',
    type: 'ATTRACTION',
    city: 'Ajloun',
  },
  {
    id: 'madaba',
    displayName: 'Madaba',
    code: 'MAD',
    type: 'CITY',
    city: 'Madaba',
  },
  {
    id: 'mount-nebo',
    displayName: 'Mount Nebo',
    code: 'NEB',
    type: 'ATTRACTION',
    city: 'Madaba',
  },
  {
    id: 'karak-castle',
    displayName: 'Karak Castle',
    code: 'KRK',
    type: 'ATTRACTION',
    city: 'Karak',
    defaultFlags: { mountainRoadFlag: true },
  },
  {
    id: 'irbid-city',
    displayName: 'Irbid',
    code: 'IRB',
    type: 'CITY',
    city: 'Irbid',
  },
  {
    id: 'allenby-border',
    displayName: 'Allenby / King Hussein Bridge',
    code: 'ALLENBY',
    type: 'BORDER',
    city: 'Dead Sea',
    defaultFlags: { borderCrossingFlag: true },
  },
  {
    id: 'sheikh-hussein-border',
    displayName: 'Sheikh Hussein Border',
    code: 'SHB',
    type: 'BORDER',
    city: 'Irbid',
    defaultFlags: { borderCrossingFlag: true },
  },
  {
    id: 'wadi-araba-border',
    displayName: 'Wadi Araba Border (Aqaba)',
    code: 'WAB',
    type: 'BORDER',
    city: 'Aqaba',
    defaultFlags: { borderCrossingFlag: true },
  },
];

/** Look up an area by its dropdown id. */
export function getAreaById(id: string | null | undefined): OperationalArea | null {
  if (!id) return null;
  return OPERATIONAL_AREAS.find((a) => a.id === id) || null;
}

/** Look up the FIRST area with a given code. Multiple areas may share a code
 *  (e.g. King Hussein International Airport and Aqaba City both use AQJ);
 *  callers wanting a specific area should use getAreaById. */
export function getAreaByCode(code: string | null | undefined): OperationalArea | null {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase();
  return OPERATIONAL_AREAS.find((a) => a.code === normalized) || null;
}

/**
 * Best-match operational area for a given city name. When multiple areas
 * share a city (e.g. Amman → Amman City + QAIA + nothing else), prefer
 * the CITY type, then ATTRACTION, then BORDER, then AIRPORT. Used by the
 * Route Standard edit page to preselect the From/To dropdowns from the
 * row's existing fromCity / toCity values.
 *
 * Returns null when no area anchors to the given city.
 */
const PREFERRED_TYPE_ORDER: OperationalAreaType[] = ['CITY', 'ATTRACTION', 'BORDER', 'AIRPORT'];
export function findAreaByCity(
  city: string | null | undefined,
  options: { preferType?: OperationalAreaType } = {},
): OperationalArea | null {
  if (!city) return null;
  const normalized = String(city).trim().toLowerCase();
  if (!normalized) return null;
  const matches = OPERATIONAL_AREAS.filter((a) => a.city.toLowerCase() === normalized);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // Preference order: caller's preferType wins, then PREFERRED_TYPE_ORDER.
  const types: OperationalAreaType[] = options.preferType
    ? [options.preferType, ...PREFERRED_TYPE_ORDER.filter((t) => t !== options.preferType)]
    : PREFERRED_TYPE_ORDER;
  for (const type of types) {
    const found = matches.find((a) => a.type === type);
    if (found) return found;
  }
  // Fall back to first match (should not be reached given the type list above).
  return matches[0];
}

/** Convenience — merge default flags from both endpoints. Operator can
 *  override in the form; this just provides smart defaults. */
export function mergeDefaultFlags(
  from: OperationalArea | null | undefined,
  to: OperationalArea | null | undefined,
) {
  return {
    airportRouteFlag: Boolean(from?.defaultFlags?.airportRouteFlag || to?.defaultFlags?.airportRouteFlag),
    borderCrossingFlag: Boolean(from?.defaultFlags?.borderCrossingFlag || to?.defaultFlags?.borderCrossingFlag),
    mountainRoadFlag: Boolean(from?.defaultFlags?.mountainRoadFlag || to?.defaultFlags?.mountainRoadFlag),
    overnightRisk: Boolean(from?.defaultFlags?.overnightRisk || to?.defaultFlags?.overnightRisk),
  };
}
