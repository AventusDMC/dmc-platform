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

// ----- Hotel suggestion types (v2A) -----

export type CommercialTier = 'Luxury' | 'Standard' | 'Budget';

export type OperationalConfidence =
  | 'Operationally smooth'
  | 'Moderate coordination'
  | 'Seasonal pressure'
  | 'Remote logistics';

export type RecommendedMealPlan = {
  code: 'BB' | 'HB' | 'FB';
  label: string;
  reason: string;
};

export type SuggestedHotel = {
  id: string;
  name: string;
  city: string;
  category: string;
  // 'Luxury' / 'Standard' / 'Budget' derived from category.
  tier: CommercialTier;
  hasActiveContract: boolean;
  recommendedMealPlan: RecommendedMealPlan;
  operationalConfidence: OperationalConfidence;
  // Short heuristic notes shown to the operator.
  notes: string[];
};

export type DestinationHotelSuggestions = {
  destination: string;
  matchedAreaCode: string | null;
  // Grouped by commercial tier so the UI can render three columns.
  tiers: Record<CommercialTier, SuggestedHotel[]>;
  totalHotelCount: number;
  hasAnySuggestions: boolean;
  fallbackHint: string | null;
};

export type HotelSuggestionsResponse = {
  destinations: string[];
  suggestions: DestinationHotelSuggestions[];
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

  /**
   * Per-destination tiered hotel suggestions for the Guided Journey
   * Composer. Pure read across the hotels catalog + contracts; never
   * touches pricing.
   *
   * Selection logic per destination:
   *   1. Filter hotels whose city matches the destination (case-insensitive)
   *   2. Group by commercial tier (Luxury / Standard / Budget) derived
   *      from the category column
   *   3. For each hotel, attach:
   *      - recommendedMealPlan (destination-aware: Petra/Wadi Rum → HB,
   *        others → BB default)
   *      - operationalConfidence ("Operationally smooth" when active
   *        contracts exist, "Seasonal pressure" when no current
   *        contract, "Remote logistics" for remote camp / desert
   *        properties)
   *      - quick notes (popular-with-groups / near-visitor-center /
   *        long-transfer-from-main-sites — derived from name heuristics)
   *
   * If a destination has NO matching hotels, the response includes a
   * fallbackHint pointing the operator to the standard hotel selector.
   */
  async getHotelSuggestionsForJourney(input: {
    destinations: string[];
  }): Promise<HotelSuggestionsResponse> {
    const destinations = (input.destinations || [])
      .map((d) => String(d || '').trim())
      .filter(Boolean);
    if (destinations.length === 0) {
      return { destinations: [], suggestions: [], notes: [] };
    }

    // Single batched catalog load. We pull hotels + the count of their
    // currently-active contracts so the operational-confidence chip can
    // honestly say "no current contract" without an extra round-trip.
    const today = new Date();
    const [hotels, operationalAreas] = await Promise.all([
      (this.prisma as any).hotel.findMany({
        select: {
          id: true,
          name: true,
          city: true,
          category: true,
          hotelCategory: { select: { name: true } },
          contracts: {
            where: { validFrom: { lte: today }, validTo: { gte: today } },
            select: { id: true },
          },
        },
      }),
      (this.prisma as any).operationalArea.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, city: true, type: true },
      }),
    ]);

    const suggestions: DestinationHotelSuggestions[] = [];
    let totalSuggestionCount = 0;
    for (const dest of destinations) {
      const matchedArea = pickAreaForCity(operationalAreas as any[], dest);
      const matched = (hotels as any[]).filter(
        (h) => h.city && h.city.toLowerCase() === dest.toLowerCase(),
      );
      const tiers: Record<CommercialTier, SuggestedHotel[]> = {
        Luxury: [],
        Standard: [],
        Budget: [],
      };
      for (const h of matched) {
        const enriched = enrichHotelForSuggestion(h, dest);
        tiers[enriched.tier].push(enriched);
      }
      // Cap each tier at 4 so the UI stays scannable; sort by hotels
      // with active contracts first, then alphabetical.
      for (const tier of Object.keys(tiers) as CommercialTier[]) {
        tiers[tier] = tiers[tier]
          .sort((a, b) => {
            if (a.hasActiveContract !== b.hasActiveContract) {
              return a.hasActiveContract ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
          .slice(0, 4);
      }
      const totalHotelCount =
        tiers.Luxury.length + tiers.Standard.length + tiers.Budget.length;
      totalSuggestionCount += totalHotelCount;
      suggestions.push({
        destination: dest,
        matchedAreaCode: matchedArea?.code ?? null,
        tiers,
        totalHotelCount,
        hasAnySuggestions: totalHotelCount > 0,
        fallbackHint:
          totalHotelCount === 0
            ? `No hotels matched "${dest}" in the catalog yet. Use the standard hotel selector on the Hotels tab to search by name or browse by city.`
            : null,
      });
    }

    const notes: string[] = [];
    if (totalSuggestionCount === 0 && destinations.length > 0) {
      notes.push(
        'None of the destinations matched hotels in the catalog. Use the standard hotel selector from the Hotels tab.',
      );
    }

    return { destinations, suggestions, notes };
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

// ---------------------------------------------------------------------------
// Hotel suggestion helpers (v2A) — exported pure for tests.
// ---------------------------------------------------------------------------

/**
 * Derive a commercial tier from the hotel's category string. The
 * category column carries free-form values across the catalog (5*,
 * "5-star", "Five Star", "Boutique", "Camp", "Resort", etc.), so this
 * helper is heuristic — anything matching a 5-star marker is Luxury,
 * 4-star is Standard, 3-star/below or budget keywords land in Budget.
 * Camps default to Standard since Wadi Rum camps are typically the
 * mid-tier offering even when category text omits stars.
 */
export function deriveCommercialTier(category: string | null | undefined): CommercialTier {
  const c = String(category || '').toLowerCase();
  if (/5\s*[-* ]*\s*(star|stars)|5\*|five[-\s]*star|luxury|deluxe|premium/.test(c)) {
    return 'Luxury';
  }
  if (/4\s*[-* ]*\s*(star|stars)|4\*|four[-\s]*star|boutique|superior/.test(c)) {
    return 'Standard';
  }
  if (/3\s*[-* ]*\s*(star|stars)|3\*|three[-\s]*star|budget|economy|hostel/.test(c)) {
    return 'Budget';
  }
  // Camps + resorts default to Standard — for Wadi Rum / Dead Sea
  // properties this is operationally correct (mid-tier is the volume
  // category in those destinations).
  if (/camp|resort|lodge|club/.test(c)) {
    return 'Standard';
  }
  return 'Standard';
}

/**
 * Destination-aware meal plan recommendation. The defaults reflect
 * Jordan DMC operational standards:
 *   - Petra overnight: HB recommended (limited dinner options near the
 *     visitor center for after-hours arrivals)
 *   - Wadi Rum camp: FB common (camps are remote; meals are bundled)
 *   - Dead Sea resort: BB default with note (HB available if pax want
 *     to dine on-property)
 *   - Aqaba / Amman: BB default (plenty of off-property dining)
 *   - Other: BB default
 */
export function recommendMealPlanForDestination(destination: string): RecommendedMealPlan {
  const d = destination.trim().toLowerCase();
  if (/petra|wadi musa/.test(d)) {
    return {
      code: 'HB',
      label: 'Half board (BB + dinner)',
      reason: 'Petra dinner options after dark are limited near the visitor center — HB keeps guests on-property.',
    };
  }
  if (/wadi rum/.test(d)) {
    return {
      code: 'FB',
      label: 'Full board',
      reason: 'Wadi Rum camps are remote desert properties — meals are bundled into the camp experience.',
    };
  }
  if (/dead sea/.test(d)) {
    return {
      code: 'BB',
      label: 'Bed & breakfast',
      reason: 'Dead Sea resorts have full restaurant offerings — BB default; offer HB upgrade if pax prefer on-property dining.',
    };
  }
  return {
    code: 'BB',
    label: 'Bed & breakfast',
    reason: 'Plenty of off-property dining nearby — BB is the standard default.',
  };
}

/**
 * Operational confidence chip. "Operationally smooth" is the default
 * when an active contract is on file; "Seasonal pressure" when there's
 * no current contract (operator may need to fall back to BAR rates);
 * "Remote logistics" for properties whose name suggests they're a
 * remote camp / desert / off-grid stay.
 */
export function deriveOperationalConfidence(input: {
  name: string;
  hasActiveContract: boolean;
}): OperationalConfidence {
  const n = input.name.toLowerCase();
  if (/camp|desert|bedouin|wadi rum|tented|wilderness/.test(n)) {
    return 'Remote logistics';
  }
  if (!input.hasActiveContract) {
    return 'Seasonal pressure';
  }
  return 'Operationally smooth';
}

/**
 * Short operational note chips drawn from the hotel name. These are
 * lightweight heuristics for v1 — they cover common patterns operators
 * already say out loud ("popular with groups", "near visitor center",
 * etc.). A future PR can replace this with structured tags on the
 * Hotel model.
 */
export function deriveQuickNotes(hotel: { name: string; city: string; category: string }): string[] {
  const out: string[] = [];
  const n = hotel.name.toLowerCase();
  const c = hotel.city.toLowerCase();
  if (/movenpick|moevenpick|kempinski|hilton|marriott|holiday\s*inn|crowne/.test(n)) {
    out.push('Popular with groups');
  }
  if (/petra/.test(c) && /(petra moon|old village|p\s*quattro|movenpick petra|petra panorama)/.test(n)) {
    out.push('Near visitor center');
  }
  if (/wadi rum/.test(c)) {
    out.push('Desert camp · jeep transfer from gateway');
  }
  if (/dead sea/.test(c) && /movenpick|marriott|holiday inn|hilton/.test(n)) {
    out.push('Resort beach access');
  }
  if (/boutique|heritage/.test(n)) {
    out.push('Boutique character');
  }
  return out;
}

/** Combine all per-hotel derivations into the suggestion shape. */
export function enrichHotelForSuggestion(
  hotel: { id: string; name: string; city: string; category: string; contracts?: Array<{ id: string }> },
  destination: string,
): SuggestedHotel {
  const hasActiveContract = Array.isArray(hotel.contracts) && hotel.contracts.length > 0;
  return {
    id: hotel.id,
    name: hotel.name,
    city: hotel.city,
    category: hotel.category,
    tier: deriveCommercialTier(hotel.category),
    hasActiveContract,
    recommendedMealPlan: recommendMealPlanForDestination(destination),
    operationalConfidence: deriveOperationalConfidence({
      name: hotel.name,
      hasActiveContract,
    }),
    notes: deriveQuickNotes(hotel),
  };
}
