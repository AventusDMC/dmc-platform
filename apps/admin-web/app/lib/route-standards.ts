// Shared client-side helpers for Route Standards (Phase 2A integration).
// The admin page at /route-standards owns the editor; this file is for
// every OTHER surface that needs to read a standard by routeCode and
// present its distance / duration / risk profile.

export type RouteStandardSummary = {
  id: string;
  routeCode: string;
  routeName: string;
  fromCity: string | null;
  toCity: string | null;
  destinationArea: string | null;
  standardDistanceKm: number | null;
  standardDurationHours: number | null;
  operationalBufferMinutes: number | null;
  longDistanceFlag: boolean;
  overnightRisk: boolean;
  mountainRoadFlag: boolean;
  borderCrossingFlag: boolean;
  airportRouteFlag: boolean;
  notes: string | null;
  isActive: boolean;
};

/**
 * Normalize a route code to the same shape RouteStandard stores
 * (UPPER_SNAKE_CASE). Mirrors the backend normalizer in
 * apps/api/src/route-standards/route-standards.service.ts so a quote item
 * stored with "amm pet" or "AMM-PET" still finds the "AMM_PET" standard.
 */
export function normalizeRouteCode(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/**
 * Build a lookup Map from a route-standards array keyed by normalized
 * routeCode. Used by the auto-builder + intelligence layer to attach a
 * standard to each transport entry in O(1) instead of scanning the array
 * per row.
 */
export function buildRouteStandardLookup(standards: RouteStandardSummary[] | null | undefined): Map<string, RouteStandardSummary> {
  const map = new Map<string, RouteStandardSummary>();
  if (!standards) return map;
  for (const standard of standards) {
    if (!standard?.routeCode) continue;
    if (standard.isActive === false) continue; // exclude retired standards
    map.set(normalizeRouteCode(standard.routeCode), standard);
  }
  return map;
}

/**
 * Look up a RouteStandard by route code via the prepared lookup Map.
 * Returns null when no match — caller falls back to the existing route's
 * own distance/duration.
 */
export function lookupRouteStandardByCode(
  lookup: Map<string, RouteStandardSummary>,
  routeCode: string | null | undefined,
): RouteStandardSummary | null {
  if (!routeCode) return null;
  return lookup.get(normalizeRouteCode(routeCode)) || null;
}

// Per-row presentation metadata — same priority order as the backend
// helper in route-standards.service.ts. Duplicating the logic instead of
// fetching from the server keeps the auto-builder preview client-side
// only (no extra API round-trip per generation).
export type TimingConfidenceLabel =
  | 'Normal Traffic'
  | 'Heavy Traffic Risk'
  | 'Mountain Road Delay Risk'
  | 'Border Delay Risk'
  | 'Long Distance Drive';

export type TimingConfidencePresentation = {
  label: TimingConfidenceLabel;
  bg: string;
  text: string;
  detail: string;
};

export function classifyRouteTimingConfidence(input: {
  longDistanceFlag?: boolean | null;
  mountainRoadFlag?: boolean | null;
  borderCrossingFlag?: boolean | null;
  airportRouteFlag?: boolean | null;
  standardDurationHours?: number | null;
}): TimingConfidenceLabel {
  if (input.borderCrossingFlag) return 'Border Delay Risk';
  if (input.mountainRoadFlag) return 'Mountain Road Delay Risk';
  if (input.longDistanceFlag || (input.standardDurationHours ?? 0) >= 5) return 'Long Distance Drive';
  if (input.airportRouteFlag) return 'Heavy Traffic Risk';
  return 'Normal Traffic';
}

export function presentRouteTimingConfidence(input: {
  longDistanceFlag?: boolean | null;
  mountainRoadFlag?: boolean | null;
  borderCrossingFlag?: boolean | null;
  airportRouteFlag?: boolean | null;
  standardDurationHours?: number | null;
}): TimingConfidencePresentation {
  const label = classifyRouteTimingConfidence(input);
  switch (label) {
    case 'Border Delay Risk':
      return {
        label,
        bg: '#faf2f2',
        text: '#7a4242',
        detail: 'Border crossing adds 1-3 hours unpredictable wait. Schedule with generous buffer.',
      };
    case 'Mountain Road Delay Risk':
      return {
        label,
        bg: '#fbf6ea',
        text: '#8b5e34',
        detail: 'Mountain roads — weather-sensitive, slower in winter. Drive time may exceed standard.',
      };
    case 'Long Distance Drive':
      return {
        label,
        bg: '#fbf9f4',
        text: '#6b5933',
        detail: '5+ hour drive. Schedule rest stops; consider an overnight if pax sensitivity is high.',
      };
    case 'Heavy Traffic Risk':
      return {
        label,
        bg: '#eef3eb',
        text: '#5c6b50',
        detail: 'Airport route — peak-hour traffic can add 30-60 minutes. Plan around flight time.',
      };
    case 'Normal Traffic':
    default:
      return {
        label: 'Normal Traffic',
        bg: '#f5f8f5',
        text: '#3a5a3a',
        detail: 'Standard transfer — no known delay risk factors.',
      };
  }
}
