import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Guided Quote Builder Maturity Phase v2 — server-side suggestions for
// the journey composer panel. Pure reads from existing catalogs
// (touring routes, route standards, operational areas); never writes.
// No pricing logic, no quote engine rewrite.
//
// The panel calls /quotes/guided/suggestions?cities=Amman,Petra,Wadi
// Rum,Dead Sea and gets back, per destination:
//   - suggestedTouringRoutes: existing Touring Routes whose
//     startCity OR mainDestinations include the destination — these
//     are operationally proven flows the operator can reuse without
//     building from scratch
//   - estimatedHoursToNext: total drive hours to the next destination
//     (when a Route Standard exists between them) — drives the pacing
//     assessment
//
// At the journey level:
//   - pacing: 'calm' | 'balanced' | 'intense' computed from total
//     drive duration vs. total nights (rough heuristic; operator
//     always has final say)
//   - overnightFeasibility: whether each consecutive pair has a
//     reasonable drive time (≤6h) and a Route Standard backing it

export type GuidedSuggestion = {
  destination: string;
  // Matched OperationalArea (if found), used to look up Route Standards
  // for the drive to the next destination.
  matchedAreaCode: string | null;
  suggestedTouringRoutes: Array<{
    id: string;
    code: string;
    name: string;
    durationDays: number | null;
    region: string | null;
    estimatedDriveHours: number | null;
    estimatedDistanceKm: number | null;
    longDistance: boolean;
    mountainRoad: boolean;
  }>;
  // For non-final destinations: the canonical drive to the next stop.
  legToNext: {
    canonicalCode: string | null;
    distanceKm: number | null;
    durationHours: number | null;
    bufferMinutes: number | null;
    riskFlags: {
      longDistanceFlag: boolean;
      mountainRoadFlag: boolean;
      borderCrossingFlag: boolean;
      airportRouteFlag: boolean;
    };
  } | null;
};

export type GuidedSuggestionsResponse = {
  arrivalCity: string | null;
  destinations: string[];
  suggestions: GuidedSuggestion[];
  pacing: {
    label: 'Smooth logistics flow' | 'Balanced pacing' | 'High coordination required' | 'Long travel day' | 'Tight transfer timing';
    tone: 'calm' | 'balanced' | 'intense';
    totalDriveHours: number;
    longestSingleLegHours: number;
    longLegCount: number;
    explanation: string;
  };
  // Soft warnings — never block, just inform.
  notes: string[];
};

@Injectable()
export class QuotesGuidedService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build per-destination suggestions + journey-level pacing assessment.
   *
   * Pure read — touches /touring-routes, /operational-areas,
   * /route-standards only. Returns a calm/balanced/intense pacing label
   * the panel renders so junior staff can spot logistics risks before
   * committing.
   */
  async getJourneySuggestions(input: {
    arrivalCity?: string | null;
    destinations: string[];
  }): Promise<GuidedSuggestionsResponse> {
    const destinations = (input.destinations || [])
      .map((d) => String(d || '').trim())
      .filter(Boolean);
    if (destinations.length === 0) {
      return {
        arrivalCity: input.arrivalCity?.trim() || null,
        destinations: [],
        suggestions: [],
        pacing: {
          label: 'Smooth logistics flow',
          tone: 'calm',
          totalDriveHours: 0,
          longestSingleLegHours: 0,
          longLegCount: 0,
          explanation: 'No destinations selected yet — add a city to see suggestions.',
        },
        notes: [],
      };
    }

    // Single batched load of the catalogs we need.
    const [touringRoutes, operationalAreas, routeStandards] = await Promise.all([
      (this.prisma as any).touringRoute.findMany({
        where: { active: true },
        select: {
          id: true,
          code: true,
          name: true,
          startCity: true,
          mainDestinations: true,
          durationDays: true,
          region: true,
          estimatedDriveHours: true,
          estimatedDistanceKm: true,
          longDistance: true,
          mountainRoad: true,
        },
      }),
      (this.prisma as any).operationalArea.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, city: true, type: true },
      }),
      (this.prisma as any).routeStandard.findMany({
        where: { isActive: true },
        select: {
          id: true,
          routeCode: true,
          canonicalRouteCode: true,
          fromCity: true,
          toCity: true,
          standardDistanceKm: true,
          standardDurationHours: true,
          operationalBufferMinutes: true,
          longDistanceFlag: true,
          mountainRoadFlag: true,
          borderCrossingFlag: true,
          airportRouteFlag: true,
        },
      }),
    ]);

    // Build per-destination suggestions.
    const suggestions: GuidedSuggestion[] = [];
    for (let i = 0; i < destinations.length; i++) {
      const dest = destinations[i];
      const nextDest = i < destinations.length - 1 ? destinations[i + 1] : null;
      const matchedArea = pickAreaForCity(operationalAreas as any[], dest);
      suggestions.push({
        destination: dest,
        matchedAreaCode: matchedArea?.code ?? null,
        suggestedTouringRoutes: pickTouringRoutesFor(touringRoutes as any[], dest, matchedArea?.code ?? null).slice(0, 5),
        legToNext: nextDest
          ? buildLegToNext(routeStandards as any[], operationalAreas as any[], dest, nextDest)
          : null,
      });
    }

    // Aggregate pacing. Heuristic: total drive hours across all legs;
    // longest single leg; count of legs > 4h.
    let totalDriveHours = 0;
    let longestSingleLegHours = 0;
    let longLegCount = 0;
    let unknownLegCount = 0;
    for (const s of suggestions) {
      const h = s.legToNext?.durationHours;
      if (h == null) {
        if (s.legToNext === null && suggestions.indexOf(s) < suggestions.length - 1) {
          // Has a next destination but no route standard found.
          unknownLegCount += 1;
        }
        continue;
      }
      totalDriveHours += h;
      if (h > longestSingleLegHours) longestSingleLegHours = h;
      if (h > 4) longLegCount += 1;
    }
    const pacing = assessPacing(totalDriveHours, longestSingleLegHours, longLegCount, suggestions.length);

    const notes: string[] = [];
    if (unknownLegCount > 0) {
      notes.push(
        `${unknownLegCount} drive${unknownLegCount === 1 ? '' : 's'} between destinations isn't backed by a Route Standard yet — pacing estimates exclude those segments.`,
      );
    }
    if (suggestions.every((s) => s.suggestedTouringRoutes.length === 0)) {
      notes.push(
        'No existing Touring Routes match these destinations. Operator can either build from scratch or add new touring routes to the catalog first.',
      );
    }

    return {
      arrivalCity: input.arrivalCity?.trim() || null,
      destinations,
      suggestions,
      pacing,
      notes,
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing.
// ---------------------------------------------------------------------------

/** Best-match operational area for a destination city name. Falls back
 *  to null when nothing matches. Case-insensitive. */
export function pickAreaForCity(
  areas: Array<{ id: string; code: string; name: string; city: string; type: string }>,
  destination: string,
): { id: string; code: string; name: string; city: string; type: string } | null {
  const term = destination.trim().toLowerCase();
  if (!term) return null;
  // Exact name match first (Petra Visitor Center → PET)
  const nameHit = areas.find((a) => a.name.toLowerCase() === term);
  if (nameHit) return nameHit;
  // Then anchor city match — prefer CITY type when multiple share a city.
  const cityHits = areas.filter((a) => a.city.toLowerCase() === term);
  if (cityHits.length === 0) return null;
  if (cityHits.length === 1) return cityHits[0];
  return cityHits.find((a) => a.type === 'CITY') || cityHits[0];
}

/** Touring routes that operationally serve a destination — by startCity,
 *  by mainDestinations array, or by name token match. Sorted by
 *  durationDays ASC so single-day suggestions appear first. */
export function pickTouringRoutesFor(
  routes: Array<{
    id: string;
    code: string;
    name: string;
    startCity: string;
    mainDestinations: any;
    durationDays: number | null;
    region: string | null;
    estimatedDriveHours: number | null;
    estimatedDistanceKm: number | null;
    longDistance: boolean;
    mountainRoad: boolean;
  }>,
  destination: string,
  matchedAreaCode: string | null,
) {
  const term = destination.trim().toLowerCase();
  if (!term) return [];
  const matches = routes.filter((r) => {
    if (r.startCity?.toLowerCase() === term) return true;
    if (Array.isArray(r.mainDestinations)) {
      if (r.mainDestinations.some((d: any) => String(d || '').toLowerCase().includes(term))) return true;
    }
    if (r.name?.toLowerCase().includes(term)) return true;
    if (matchedAreaCode && r.code?.toUpperCase().includes(matchedAreaCode.toUpperCase())) return true;
    return false;
  });
  return matches
    .sort((a, b) => (a.durationDays ?? 99) - (b.durationDays ?? 99))
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      durationDays: r.durationDays,
      region: r.region,
      estimatedDriveHours: r.estimatedDriveHours,
      estimatedDistanceKm: r.estimatedDistanceKm,
      longDistance: Boolean(r.longDistance),
      mountainRoad: Boolean(r.mountainRoad),
    }));
}

/** Build the leg description from current destination to the next. Tries
 *  canonical FROM_TO route code first, then fromCity/toCity match. */
export function buildLegToNext(
  routeStandards: Array<{
    id: string;
    routeCode: string;
    canonicalRouteCode: string | null;
    fromCity: string | null;
    toCity: string | null;
    standardDistanceKm: number | null;
    standardDurationHours: number | null;
    operationalBufferMinutes: number | null;
    longDistanceFlag: boolean;
    mountainRoadFlag: boolean;
    borderCrossingFlag: boolean;
    airportRouteFlag: boolean;
  }>,
  areas: Array<{ code: string; city: string; name: string; type: string }>,
  fromCity: string,
  toCity: string,
): GuidedSuggestion['legToNext'] {
  const fromArea = pickAreaForCity(areas as any[], fromCity);
  const toArea = pickAreaForCity(areas as any[], toCity);
  let std: any = null;
  if (fromArea && toArea) {
    const canonical = `${fromArea.code}_${toArea.code}`;
    std = routeStandards.find(
      (r) =>
        (r.canonicalRouteCode || '').toUpperCase() === canonical ||
        (r.routeCode || '').toUpperCase() === canonical,
    );
  }
  if (!std) {
    // Fall back to city-pair match for legacy rows.
    std = routeStandards.find(
      (r) =>
        r.fromCity?.toLowerCase() === fromCity.toLowerCase() &&
        r.toCity?.toLowerCase() === toCity.toLowerCase(),
    );
  }
  if (!std) return null;
  return {
    canonicalCode: std.canonicalRouteCode || std.routeCode || null,
    distanceKm: std.standardDistanceKm ?? null,
    durationHours: std.standardDurationHours ?? null,
    bufferMinutes: std.operationalBufferMinutes ?? null,
    riskFlags: {
      longDistanceFlag: Boolean(std.longDistanceFlag),
      mountainRoadFlag: Boolean(std.mountainRoadFlag),
      borderCrossingFlag: Boolean(std.borderCrossingFlag),
      airportRouteFlag: Boolean(std.airportRouteFlag),
    },
  };
}

/**
 * Assess journey pacing. Heuristics tuned for Jordan DMC ops:
 *   - calm: total drive < 6h AND no single leg > 4h
 *   - balanced: total drive 6-10h OR one leg in 4-6h range
 *   - intense: total drive > 10h OR any leg > 6h OR >2 legs > 4h
 *   - 'Long travel day': worst case for single-day or 2-day trips
 *   - 'Tight transfer timing': flagged when multiple back-to-back > 3h
 */
export function assessPacing(
  totalDriveHours: number,
  longestLegHours: number,
  longLegCount: number,
  legCount: number,
): GuidedSuggestionsResponse['pacing'] {
  if (totalDriveHours === 0 && legCount <= 1) {
    return {
      label: 'Smooth logistics flow',
      tone: 'calm',
      totalDriveHours,
      longestSingleLegHours: longestLegHours,
      longLegCount,
      explanation: 'Single destination — no inter-city drives to coordinate.',
    };
  }
  if (longestLegHours > 6 || totalDriveHours > 10) {
    return {
      label: longestLegHours > 6 ? 'Long travel day' : 'High coordination required',
      tone: 'intense',
      totalDriveHours,
      longestSingleLegHours: longestLegHours,
      longLegCount,
      explanation:
        longestLegHours > 6
          ? `One drive leg is ${longestLegHours}h — consider an overnight stop or breaking the journey across two days.`
          : `Total drive time across the journey is ${totalDriveHours}h. Long travel days reduce experience quality — consider splitting destinations.`,
    };
  }
  if (longLegCount >= 2) {
    return {
      label: 'Tight transfer timing',
      tone: 'intense',
      totalDriveHours,
      longestSingleLegHours: longestLegHours,
      longLegCount,
      explanation: `${longLegCount} legs exceed 4h — back-to-back long drives leave little margin for delays or sightseeing.`,
    };
  }
  if (totalDriveHours >= 6) {
    return {
      label: 'Balanced pacing',
      tone: 'balanced',
      totalDriveHours,
      longestSingleLegHours: longestLegHours,
      longLegCount,
      explanation: `${totalDriveHours}h of total driving across ${legCount} destinations is reasonable for a multi-day itinerary.`,
    };
  }
  return {
    label: 'Smooth logistics flow',
    tone: 'calm',
    totalDriveHours,
    longestSingleLegHours: longestLegHours,
    longLegCount,
    explanation: `${totalDriveHours}h of total driving — comfortable pacing across ${legCount} destinations.`,
  };
}
