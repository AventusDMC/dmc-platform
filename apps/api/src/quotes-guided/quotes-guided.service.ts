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
  // Hotel Contract Trustworthiness v2 — true when ANY active contract
  // for this hotel carries confidence = VERIFIED. Drives the sort
  // boost + "Operationally trusted" label in the Guided picker.
  hasVerifiedContract: boolean;
  // Preferred Hotel Ranking — operator-set, lower wins (1 = most
  // preferred). NULL = unranked. Sorts ahead of the trust/alpha
  // tie-breakers within each tier.
  preferenceRank: number | null;
  recommendedMealPlan: RecommendedMealPlan;
  operationalConfidence: OperationalConfidence;
  // Hotel Recommendation Engine — a transparent, deterministic score
  // combining verified/active contract, operator preference rank, and
  // operational confidence. Higher = stronger recommendation; drives the
  // suggestion sort. `recommendationReasons` is the human-readable "why"
  // shown on the card so operators can trust (and override) it.
  recommendationScore: number;
  recommendationReasons: string[];
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

// ----- Experience suggestion types (v2B) -----

export type MoodCategory =
  | 'CULTURE'
  | 'ADVENTURE'
  | 'RELIGIOUS'
  | 'RELAXATION'
  | 'FAMILY'
  | 'WELLNESS'
  | 'FOOD_LOCAL';

export const MOOD_CATEGORY_LABELS: Record<MoodCategory, string> = {
  CULTURE: 'Culture',
  ADVENTURE: 'Adventure',
  RELIGIOUS: 'Religious',
  RELAXATION: 'Relaxation',
  FAMILY: 'Family',
  WELLNESS: 'Wellness',
  FOOD_LOCAL: 'Food & Local Experience',
};

export type OperationalIntensity = 'RELAXED' | 'MODERATE' | 'INTENSE';

export type SuggestedExperience = {
  id: string;
  name: string;
  description: string | null;
  city: string;
  experienceType: string | null;
  moodCategory: MoodCategory | string | null;
  // The mood the UI groups under. When activity has explicit
  // moodCategory we use that; otherwise inferActivityMood derives one
  // from name/category/keywords so untagged activities still appear in
  // a sensible bucket.
  effectiveMood: MoodCategory;
  durationMinutes: number | null;
  durationHours: number | null;
  operationalIntensity: OperationalIntensity | null;
  familyFriendly: boolean;
  religiousSignificance: boolean;
  premiumExperienceFlag: boolean;
  // Heuristic — sicPossible OR chain partner OR name keyword "tour /
  // group" suggests this scales for group tours.
  popularWithGroups: boolean;
  operationalConfidenceLabel: string;
  // Activity Recommendation Engine — transparent, deterministic score
  // (premium flag, operational confidence, group-scalability, curated
  // metadata) that ranks experiences within each mood group, with a
  // human-readable "why". Mirrors the hotel recommendation score.
  recommendationScore: number;
  recommendationReasons: string[];
  notes: string[];
};

export type DestinationExperienceSuggestions = {
  destination: string;
  matchedAreaCode: string | null;
  // Grouped by mood — keys present only when at least one activity
  // sits in that bucket.
  byMood: Partial<Record<MoodCategory, SuggestedExperience[]>>;
  totalExperienceCount: number;
  hasAnyExperiences: boolean;
  fallbackHint: string | null;
};

export type ExperienceSuggestionsResponse = {
  destinations: string[];
  suggestions: DestinationExperienceSuggestions[];
  // "Top experiences for this journey" highlights — picks the most
  // operationally-confident premium experiences across all
  // destinations, capped at 5.
  highlights: SuggestedExperience[];
  notes: string[];
};

// ----- Transport suggestion types (v2C) -----

export type VehicleClass = 'SEDAN' | 'MINIVAN' | 'COASTER' | 'BUS';

// Spec's pax-band → vehicle class mapping. seatRange is the practical
// operational capacity (not the manufacturer max — leaves luggage room).
export const VEHICLE_CLASSES: Record<
  VehicleClass,
  {
    label: string;
    icon: string;
    minPax: number;
    maxPax: number;
    typicalExample: string;
    luggageNote: string;
  }
> = {
  SEDAN: {
    label: 'Sedan',
    icon: '🚗',
    minPax: 1,
    maxPax: 2,
    typicalExample: 'Mercedes E-class · Toyota Camry',
    luggageNote: 'Two suitcases + small bags fit comfortably.',
  },
  MINIVAN: {
    label: 'Minivan',
    icon: '🚐',
    minPax: 3,
    maxPax: 6,
    typicalExample: 'Mercedes Vito · Hyundai H-1',
    luggageNote: 'Comfortable for 4 pax + full luggage; tight at 6 pax with large bags.',
  },
  COASTER: {
    label: 'Coaster',
    icon: '🚌',
    minPax: 7,
    maxPax: 15,
    typicalExample: 'Toyota Coaster · Mitsubishi Rosa',
    luggageNote: 'Good luggage hold; comfortable for groups + long-distance touring.',
  },
  BUS: {
    label: 'Bus',
    icon: '🚍',
    minPax: 16,
    maxPax: 45,
    typicalExample: 'Mercedes Tourismo · Higer KLQ',
    luggageNote: 'Full luggage hold; standard for groups, schools, and pilgrim journeys.',
  },
};

export type LegTransportInsight = {
  fromCity: string;
  toCity: string;
  canonicalCode: string | null;
  // Each overlay maps onto a single chip the UI renders. Keys are
  // stable so the UI can color-code them; copy is the operator-facing
  // label.
  overlays: Array<{
    key: 'AIRPORT_TIMING' | 'MOUNTAIN_ROAD' | 'LONG_DISTANCE' | 'BORDER_CROSSING' | 'DESERT_LOGISTICS' | 'OVERNIGHT_TRANSITION';
    label: string;
    tone: 'amber' | 'red' | 'blue';
  }>;
  driveHours: number | null;
  distanceKm: number | null;
};

export type TransportRecommendation = {
  vehicleClass: VehicleClass;
  label: string;
  icon: string;
  seatRange: string;
  typicalExample: string;
  luggageNote: string;
  // "Recommended for: 4 adults · 7-night Jordan journey" — the spec's
  // sample headline.
  recommendationLine: string;
  // The "Preferred operational choice" badge — only on when pax sits in
  // the comfortable middle of the vehicle's range AND the journey
  // doesn't have extreme legs.
  preferredOperationalChoice: boolean;
  // Comfort notes specific to this journey: long-distance comfort
  // recommended / desert route vehicle preferred / mountain-road
  // experienced driver recommended / tight luggage capacity.
  comfortNotes: string[];
  operationalConfidenceLabel: 'Operationally smooth' | 'Moderate coordination' | 'High coordination required';
};

export type TransportSuggestionsResponse = {
  paxCount: number;
  destinations: string[];
  // Null when paxCount is 0/missing — UI shows fallback hint.
  recommendation: TransportRecommendation | null;
  legs: LegTransportInsight[];
  // Journey-level pacing summary.
  pacing: {
    label:
      | 'Comfortable pacing'
      | 'Long-distance touring day'
      | 'High coordination transfer day'
      | 'Tight luggage capacity';
    tone: 'calm' | 'balanced' | 'intense';
    explanation: string;
  };
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
        select: { id: true, code: true, name: true, city: true, type: true, priority: true },
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
          preferenceRank: true,
          hotelCategory: { select: { name: true } },
          contracts: {
            where: { validFrom: { lte: today }, validTo: { gte: today } },
            // Pull confidence so the Guided picker can boost VERIFIED
            // hotels and surface the "Operationally trusted" label.
            select: { id: true, confidence: true },
          },
        },
      }),
      (this.prisma as any).operationalArea.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, city: true, type: true, priority: true },
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
      // Cap each tier at 4 so the UI stays scannable. Sort order:
      //   1. Operator preferenceRank (lower wins; unranked sorts last)
      //   2. VERIFIED contracts win (Trustworthiness v2 boost)
      //   3. Then hotels with any active contract
      //   4. Then alphabetical
      // Verified hotels also surface the "Operationally trusted" label
      // via enrichHotelForSuggestion → notes.
      for (const tier of Object.keys(tiers) as CommercialTier[]) {
        tiers[tier] = tiers[tier]
          .sort((a, b) => {
            // Recommendation score is the primary signal (it already encodes
            // verified/active contract + operator preference + operational
            // confidence). Ties break on explicit preference rank (lower wins,
            // unranked last) then alphabetical.
            if (a.recommendationScore !== b.recommendationScore) {
              return b.recommendationScore - a.recommendationScore;
            }
            if (a.preferenceRank !== b.preferenceRank) {
              if (a.preferenceRank == null) return 1;
              if (b.preferenceRank == null) return -1;
              return a.preferenceRank - b.preferenceRank;
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

  /**
   * Guided v2B — per-destination experience suggestions grouped by
   * travel mood (Culture / Adventure / Religious / Relaxation / Family
   * / Wellness / Food & Local Experience). Pure read across the
   * activities catalog + operational areas; never touches pricing.
   *
   * Selection logic per destination:
   *   1. Filter activities by city (case-insensitive), active=true
   *   2. Map each activity through enrichActivityForSuggestion to derive
   *      mood (using explicit moodCategory when set, falling back to
   *      inferActivityMood for untagged rows), intensity, operational
   *      confidence, popularity heuristic, and quick notes.
   *   3. Cap each mood bucket at 6 (UI scannability)
   *   4. Sort premium → operational-confident → alphabetical within
   *      each bucket
   *
   * Then composes a top-of-journey "highlights" strip — top 5 premium
   * + operationally-confident picks across all destinations, deduped.
   */
  async getExperienceSuggestionsForJourney(input: {
    destinations: string[];
  }): Promise<ExperienceSuggestionsResponse> {
    const destinations = (input.destinations || [])
      .map((d) => String(d || '').trim())
      .filter(Boolean);
    if (destinations.length === 0) {
      return { destinations: [], suggestions: [], highlights: [], notes: [] };
    }

    const [activities, operationalAreas] = await Promise.all([
      (this.prisma as any).activity.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          description: true,
          city: true,
          category: true,
          experienceType: true,
          moodCategory: true,
          operationalIntensity: true,
          durationMinutes: true,
          durationHours: true,
          familyFriendly: true,
          religiousSignificance: true,
          premiumExperienceFlag: true,
          sicPossible: true,
          guideRequired: true,
          difficulty: true,
        },
      }),
      (this.prisma as any).operationalArea.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, city: true, type: true, priority: true },
      }),
    ]);

    const suggestions: DestinationExperienceSuggestions[] = [];
    let totalSuggestionCount = 0;
    const allExperiences: SuggestedExperience[] = [];
    for (const dest of destinations) {
      const matchedArea = pickAreaForCity(operationalAreas as any[], dest);
      const matched = (activities as any[]).filter(
        (a) => a.city && a.city.toLowerCase() === dest.toLowerCase(),
      );
      const enriched = matched.map((a) => enrichActivityForSuggestion(a));
      // Sort within each mood: premium first, then operationally
      // confident, then alphabetical.
      const byMood: Partial<Record<MoodCategory, SuggestedExperience[]>> = {};
      for (const exp of enriched) {
        const bucket = (byMood[exp.effectiveMood] = byMood[exp.effectiveMood] || []);
        bucket.push(exp);
      }
      for (const mood of Object.keys(byMood) as MoodCategory[]) {
        byMood[mood] = byMood[mood]!
          .sort((a, b) => {
            // Recommendation score is primary (it encodes premium + confidence
            // + group-fit + curated metadata); ties break alphabetically.
            if (a.recommendationScore !== b.recommendationScore) {
              return b.recommendationScore - a.recommendationScore;
            }
            return a.name.localeCompare(b.name);
          })
          .slice(0, 6);
      }
      const totalExperienceCount = Object.values(byMood).reduce(
        (sum, list) => sum + (list?.length || 0),
        0,
      );
      totalSuggestionCount += totalExperienceCount;
      // Collect for the journey-wide highlights strip.
      for (const list of Object.values(byMood)) {
        for (const exp of list || []) allExperiences.push(exp);
      }
      suggestions.push({
        destination: dest,
        matchedAreaCode: matchedArea?.code ?? null,
        byMood,
        totalExperienceCount,
        hasAnyExperiences: totalExperienceCount > 0,
        fallbackHint:
          totalExperienceCount === 0
            ? `No activities matched "${dest}" in the catalog yet. Use the standard activity selector on the Activities tab to search by name.`
            : null,
      });
    }

    // Top-of-journey highlights: premium + operationally-confident
    // picks across all destinations, capped at 5, deduped by id.
    const highlights = allExperiences
      .filter((e) => e.premiumExperienceFlag || e.operationalConfidenceLabel === 'Operationally confident')
      .sort((a, b) => {
        if (a.recommendationScore !== b.recommendationScore) {
          return b.recommendationScore - a.recommendationScore;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 5);

    const notes: string[] = [];
    if (totalSuggestionCount === 0 && destinations.length > 0) {
      notes.push(
        'None of the destinations matched activities in the catalog. Use the standard activity selector from the Activities tab.',
      );
    }

    return { destinations, suggestions, highlights, notes };
  }

  /**
   * Guided v2C — per-journey transport recommendation + per-leg
   * confidence overlays. Pure read across operational_areas +
   * route_standards; never touches pricing or dispatch.
   *
   * Inputs: arrivalCity, ordered destinations, total paxCount.
   * Outputs: recommended vehicle class (sized by pax), per-leg
   * overlays (airport timing / mountain / border / long-distance /
   * desert logistics), journey-level transport pacing.
   *
   * The "Preferred operational choice" badge is set when pax sits in
   * the comfortable middle of the vehicle's range AND no leg exceeds
   * 6h drive (which would call for a specialist long-haul vehicle).
   *
   * The recommendation never instructs the operator to book a
   * specific vehicle — it's a starting point for the Transport tab on
   * the advanced workspace, which carries supplier rate resolution
   * and vehicle-supplier matching logic this read-only service does
   * not touch.
   */
  async getTransportSuggestionsForJourney(input: {
    arrivalCity?: string | null;
    destinations: string[];
    paxCount: number;
  }): Promise<TransportSuggestionsResponse> {
    const destinations = (input.destinations || [])
      .map((d) => String(d || '').trim())
      .filter(Boolean);
    const paxCount = Math.max(0, Number.isFinite(Number(input.paxCount)) ? Math.floor(Number(input.paxCount)) : 0);

    if (paxCount === 0) {
      return {
        paxCount: 0,
        destinations,
        recommendation: null,
        legs: [],
        pacing: {
          label: 'Comfortable pacing',
          tone: 'calm',
          explanation: 'Set the pax count on the quote to see a vehicle recommendation.',
        },
        notes: ['Pax count is 0 — fill in adults / children on the overview tab to unlock transport suggestions.'],
      };
    }

    // Single batched load of the catalogs we need for per-leg overlays.
    const [operationalAreas, routeStandards] = await Promise.all([
      (this.prisma as any).operationalArea.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, city: true, type: true, priority: true },
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
          longDistanceFlag: true,
          mountainRoadFlag: true,
          borderCrossingFlag: true,
          airportRouteFlag: true,
        },
      }),
    ]);

    // Build per-leg insights between consecutive destinations. Include
    // the arrival hop (arrivalCity → first destination) when arrivalCity
    // differs from the first destination.
    const legs: LegTransportInsight[] = [];
    const stops = input.arrivalCity && input.arrivalCity.trim() && input.arrivalCity.trim().toLowerCase() !== destinations[0]?.toLowerCase()
      ? [input.arrivalCity.trim(), ...destinations]
      : [...destinations];
    for (let i = 0; i < stops.length - 1; i++) {
      const insight = deriveLegTransportInsights(
        stops[i],
        stops[i + 1],
        routeStandards as any[],
        operationalAreas as any[],
      );
      if (insight) legs.push(insight);
    }

    const longestLegHours = legs.reduce(
      (max, leg) => (leg.driveHours != null && leg.driveHours > max ? leg.driveHours : max),
      0,
    );
    const totalDriveHours = legs.reduce(
      (sum, leg) => sum + (leg.driveHours != null ? leg.driveHours : 0),
      0,
    );
    const hasMountainLeg = legs.some((l) => l.overlays.some((o) => o.key === 'MOUNTAIN_ROAD'));
    const hasDesertLeg = legs.some((l) => l.overlays.some((o) => o.key === 'DESERT_LOGISTICS'));
    const hasBorderLeg = legs.some((l) => l.overlays.some((o) => o.key === 'BORDER_CROSSING'));
    const hasAirportLeg = legs.some((l) => l.overlays.some((o) => o.key === 'AIRPORT_TIMING'));

    const recommendation = buildTransportRecommendation({
      paxCount,
      destinationCount: destinations.length,
      longestLegHours,
      totalDriveHours,
      hasMountainLeg,
      hasDesertLeg,
      hasBorderLeg,
      hasAirportLeg,
    });

    const pacing = assessJourneyTransportPacing({
      legs,
      paxCount,
      vehicleClass: recommendation?.vehicleClass,
      longestLegHours,
      totalDriveHours,
    });

    const notes: string[] = [];
    if (legs.length === 0 && destinations.length > 1) {
      notes.push(
        "Inter-city drives aren't backed by Route Standards yet — overlays unavailable for those legs.",
      );
    }

    return { paxCount, destinations, recommendation, legs, pacing, notes };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing.
// ---------------------------------------------------------------------------

/** Best-match operational area for a destination city name. Falls back
 *  to null when nothing matches. Case-insensitive. */
export function pickAreaForCity(
  areas: Array<{ id: string; code: string; name: string; city: string; type: string; priority?: number | null }>,
  destination: string,
): { id: string; code: string; name: string; city: string; type: string; priority?: number | null } | null {
  const term = destination.trim().toLowerCase();
  if (!term) return null;

  // Step 1: exact name match — but still apply priority when multiple
  // rows somehow match the same display name (rare but possible).
  const nameHits = areas.filter((a) => a.name.toLowerCase() === term);
  if (nameHits.length === 1) return nameHits[0];
  if (nameHits.length > 1) {
    const sorted = [...nameHits].sort(compareAreasByPriority);
    return sorted[0];
  }

  // Step 2: anchor city match — priority-aware. When multiple areas
  // share a city, lower `priority` wins (QAIA=1 beats Marka=2 for
  // Amman AIRPORT). NULL priority sorts last, falling back to the
  // PREFERRED_TYPE_ORDER and then alphabetical.
  const cityHits = areas.filter((a) => a.city.toLowerCase() === term);
  if (cityHits.length === 0) return null;
  if (cityHits.length === 1) return cityHits[0];
  const sorted = [...cityHits].sort(compareAreasByPriority);
  return sorted[0];
}

// Preferred type order — used as a tie-breaker when priority is NULL.
const PREFERRED_TYPE_ORDER: Array<string> = [
  'CITY',
  'TOURISM_SITE',
  'RESORT_AREA',
  'CAMP_AREA',
  'BORDER',
  'HOTEL_ZONE',
  'PORT',
  'AIRPORT',
];

/**
 * Sort areas for "primary operational area" selection.
 *
 *   1. Lower `priority` integer wins (NULL = lowest priority, sorts last)
 *   2. Tie → PREFERRED_TYPE_ORDER (CITY before AIRPORT, etc.)
 *   3. Tie → alphabetical by name
 *
 * Exported so admin tooling + tests can reuse the same comparator.
 */
export function compareAreasByPriority<T extends { type: string; name: string; priority?: number | null }>(
  a: T,
  b: T,
): number {
  const pa = a.priority ?? 999;
  const pb = b.priority ?? 999;
  if (pa !== pb) return pa - pb;
  const ta = PREFERRED_TYPE_ORDER.indexOf(a.type);
  const tb = PREFERRED_TYPE_ORDER.indexOf(b.type);
  const taOrd = ta < 0 ? 99 : ta;
  const tbOrd = tb < 0 ? 99 : tb;
  if (taOrd !== tbOrd) return taOrd - tbOrd;
  return a.name.localeCompare(b.name);
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
      explanation: `${longLegCount} legs exceed 4h — back-to-back long drives leave little slack for delays or sightseeing.`,
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
  hotel: {
    id: string;
    name: string;
    city: string;
    category: string;
    preferenceRank?: number | null;
    contracts?: Array<{ id: string; confidence?: string | null }>;
  },
  destination: string,
): SuggestedHotel {
  const hasActiveContract = Array.isArray(hotel.contracts) && hotel.contracts.length > 0;
  // Hotel Contract Trustworthiness v2 — VERIFIED contracts surface the
  // "Operationally trusted" label + win sort tie-breaks against
  // unverified hotels in the Guided picker. We only mark trusted when
  // an ACTIVE contract is VERIFIED (an expired verified contract
  // shouldn't promote the hotel).
  const hasVerifiedContract =
    Array.isArray(hotel.contracts) && hotel.contracts.some((c) => c.confidence === 'VERIFIED');
  const notes = deriveQuickNotes(hotel);
  if (hasVerifiedContract) {
    notes.unshift('Operationally trusted');
  }
  const preferenceRank = typeof hotel.preferenceRank === 'number' ? hotel.preferenceRank : null;
  const operationalConfidence = deriveOperationalConfidence({ name: hotel.name, hasActiveContract });

  // Transparent recommendation score. Each signal adds points AND a reason,
  // so the card can explain why a hotel is ranked where it is.
  const recommendationReasons: string[] = [];
  let recommendationScore = 0;
  if (hasVerifiedContract) {
    recommendationScore += 50;
    recommendationReasons.push('Verified contract');
  } else if (hasActiveContract) {
    recommendationScore += 20;
    recommendationReasons.push('Active contract on file');
  } else {
    recommendationReasons.push('No current contract — confirm rates');
  }
  if (preferenceRank != null) {
    // Operator preference: rank 1 = strongest. Decays per rank, floored so a
    // preferred hotel always out-scores an equivalent unranked one.
    const preferenceBoost = Math.max(5, 35 - (preferenceRank - 1) * 10);
    recommendationScore += preferenceBoost;
    recommendationReasons.push(`Preferred supplier (rank ${preferenceRank})`);
  }
  if (operationalConfidence === 'Operationally smooth') {
    recommendationScore += 10;
    recommendationReasons.push('Operationally smooth');
  }

  return {
    id: hotel.id,
    name: hotel.name,
    city: hotel.city,
    category: hotel.category,
    tier: deriveCommercialTier(hotel.category),
    hasActiveContract,
    hasVerifiedContract,
    preferenceRank,
    recommendedMealPlan: recommendMealPlanForDestination(destination),
    operationalConfidence,
    recommendationScore,
    recommendationReasons,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Experience suggestion helpers (v2B) — exported pure for tests.
// ---------------------------------------------------------------------------

/**
 * Derive a mood category when the activity row has no explicit
 * moodCategory column populated yet (most existing activities). Reads
 * the activity name + category + description keywords.
 *
 * Priority order matters: religious / wellness / food are specific
 * enough to trump generic culture/adventure when they collide.
 */
export function inferActivityMood(activity: {
  name: string;
  category?: string | null;
  description?: string | null;
}): MoodCategory {
  const haystack = `${activity.name} ${activity.category || ''} ${activity.description || ''}`.toLowerCase();
  if (/baptism|monastery|nebo|moses|church|mosque|shrine|pilgrim|religious|holy/.test(haystack)) {
    return 'RELIGIOUS';
  }
  if (/spa|wellness|hammam|turkish bath|float|mud bath|thermal|hot spring/.test(haystack)) {
    return 'WELLNESS';
  }
  if (/cooking|kitchen|food walk|food tour|tasting|culinary|local market|bedouin dinner|coffee/.test(haystack)) {
    return 'FOOD_LOCAL';
  }
  if (/jeep|safari|hike|trek|climb|kayak|paragliding|cycling|cycle|adventure|canyon|mujib|wadi rum|stargaz/.test(haystack)) {
    return 'ADVENTURE';
  }
  if (/family|kids|children|kid-friendly/.test(haystack)) {
    return 'FAMILY';
  }
  if (/beach|float|relax|leisure|sunset/.test(haystack)) {
    return 'RELAXATION';
  }
  if (/petra|jerash|ajloun|kerak|umm qais|citadel|roman|museum|archaeological|heritage|guided tour|city tour|walking tour|panoramic/.test(haystack)) {
    return 'CULTURE';
  }
  // Default to Culture — most Jordan operator activities lean cultural.
  return 'CULTURE';
}

/** Operational confidence label for the experience card. */
export function deriveExperienceConfidence(activity: {
  sicPossible?: boolean;
  guideRequired?: boolean | null;
  difficulty?: string | null;
}): string {
  // Spec didn't enumerate experience confidence chips — keep it simple:
  //   - "Operationally confident" when activity is SIC-able (frequent
  //     departures, well-rehearsed)
  //   - "Specialist coordination" when it requires a guide or has
  //     high-difficulty
  //   - "Standard coordination" otherwise
  if (activity.sicPossible) return 'Operationally confident';
  if (activity.guideRequired || /hard|expert|extreme/i.test(activity.difficulty || '')) {
    return 'Specialist coordination';
  }
  return 'Standard coordination';
}

/** Quick notes for the experience card — short, travel-oriented hints. */
export function deriveExperienceNotes(activity: {
  name: string;
  sicPossible?: boolean;
  durationHours?: number | null;
  durationMinutes?: number | null;
}): string[] {
  const out: string[] = [];
  if (activity.sicPossible) out.push('Popular with groups');
  const hours = activity.durationHours ?? (activity.durationMinutes ? activity.durationMinutes / 60 : null);
  if (hours != null) {
    if (hours >= 6) out.push('Long active day');
    else if (hours <= 1.5) out.push('Relaxed pace');
  }
  if (/by night|stargaz|sunset|evening/i.test(activity.name)) {
    out.push('Evening departure');
  }
  if (/early|sunrise|dawn/i.test(activity.name)) {
    out.push('Early departure required');
  }
  return out;
}

/** Compose all derivations into the SuggestedExperience shape. */
export function enrichActivityForSuggestion(activity: {
  id: string;
  name: string;
  description?: string | null;
  city?: string | null;
  category?: string | null;
  experienceType?: string | null;
  moodCategory?: string | null;
  operationalIntensity?: string | null;
  durationMinutes?: number | null;
  durationHours?: number | null;
  familyFriendly?: boolean;
  religiousSignificance?: boolean;
  premiumExperienceFlag?: boolean;
  sicPossible?: boolean;
  guideRequired?: boolean | null;
  difficulty?: string | null;
}): SuggestedExperience {
  const moodFromColumn = (activity.moodCategory || '').toUpperCase();
  const validMoods: MoodCategory[] = [
    'CULTURE',
    'ADVENTURE',
    'RELIGIOUS',
    'RELAXATION',
    'FAMILY',
    'WELLNESS',
    'FOOD_LOCAL',
  ];
  const effectiveMood: MoodCategory = (validMoods as string[]).includes(moodFromColumn)
    ? (moodFromColumn as MoodCategory)
    : inferActivityMood({
        name: activity.name,
        category: activity.category,
        description: activity.description,
      });
  const premiumExperienceFlag = Boolean(activity.premiumExperienceFlag);
  const popularWithGroups = Boolean(activity.sicPossible) || /group|tour/i.test(activity.name);
  const operationalConfidenceLabel = deriveExperienceConfidence({
    sicPossible: activity.sicPossible,
    guideRequired: activity.guideRequired,
    difficulty: activity.difficulty,
  });
  const hasExplicitMood = (validMoods as string[]).includes(moodFromColumn);

  // Transparent recommendation score — each signal adds points AND a reason
  // so the card explains why an experience is ranked where it is.
  const recommendationReasons: string[] = [];
  let recommendationScore = 0;
  if (premiumExperienceFlag) {
    recommendationScore += 30;
    recommendationReasons.push('Premium / signature experience');
  }
  if (operationalConfidenceLabel === 'Operationally confident') {
    recommendationScore += 15;
    recommendationReasons.push('Operationally confident');
  }
  if (popularWithGroups) {
    recommendationScore += 10;
    recommendationReasons.push('Scales for groups');
  }
  if (hasExplicitMood) {
    recommendationScore += 5;
    recommendationReasons.push('Curated experience metadata');
  }

  return {
    id: activity.id,
    name: activity.name,
    description: activity.description ?? null,
    city: activity.city || '',
    experienceType: activity.experienceType ?? null,
    moodCategory: activity.moodCategory ?? null,
    effectiveMood,
    durationMinutes: activity.durationMinutes ?? null,
    durationHours: activity.durationHours ?? null,
    operationalIntensity: (activity.operationalIntensity as OperationalIntensity) ?? null,
    familyFriendly: Boolean(activity.familyFriendly),
    religiousSignificance: Boolean(activity.religiousSignificance),
    premiumExperienceFlag,
    popularWithGroups,
    operationalConfidenceLabel,
    recommendationScore,
    recommendationReasons,
    notes: deriveExperienceNotes({
      name: activity.name,
      sicPossible: activity.sicPossible,
      durationHours: activity.durationHours,
      durationMinutes: activity.durationMinutes,
    }),
  };
}

// ---------------------------------------------------------------------------
// Transport suggestion helpers (v2C) — exported pure for tests.
// ---------------------------------------------------------------------------

/**
 * Map a pax count onto the spec's four vehicle classes. Returns null
 * when pax is 0 (UI shows a hint to fill in pax count first) or above
 * the largest bus capacity (UI suggests splitting into multiple
 * vehicles — a follow-on PR can add a multi-vehicle recommendation).
 */
export function recommendVehicleClassByPax(paxCount: number): VehicleClass | null {
  if (paxCount < 1) return null;
  if (paxCount <= 2) return 'SEDAN';
  if (paxCount <= 6) return 'MINIVAN';
  if (paxCount <= 15) return 'COASTER';
  if (paxCount <= 45) return 'BUS';
  return null;
}

/**
 * Build the per-leg insight describing risk/terrain overlays between
 * two consecutive stops. Returns null when no matching Route Standard
 * is found AND area lookup fails — caller skips that leg silently.
 */
export function deriveLegTransportInsights(
  fromCity: string,
  toCity: string,
  routeStandards: Array<{
    routeCode: string;
    canonicalRouteCode: string | null;
    fromCity: string | null;
    toCity: string | null;
    standardDistanceKm: number | null;
    standardDurationHours: number | null;
    longDistanceFlag: boolean;
    mountainRoadFlag: boolean;
    borderCrossingFlag: boolean;
    airportRouteFlag: boolean;
  }>,
  areas: Array<{ code: string; city: string; name: string; type: string }>,
): LegTransportInsight | null {
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
    std = routeStandards.find(
      (r) =>
        r.fromCity?.toLowerCase() === fromCity.toLowerCase() &&
        r.toCity?.toLowerCase() === toCity.toLowerCase(),
    );
  }

  const overlays: LegTransportInsight['overlays'] = [];

  // Risk-flag-driven overlays (from Route Standard when present).
  if (std?.airportRouteFlag) {
    overlays.push({ key: 'AIRPORT_TIMING', label: 'Airport timing sensitive', tone: 'blue' });
  }
  if (std?.mountainRoadFlag) {
    overlays.push({ key: 'MOUNTAIN_ROAD', label: 'Mountain-road route', tone: 'amber' });
  }
  if (std?.longDistanceFlag || (std?.standardDurationHours != null && Number(std.standardDurationHours) >= 5)) {
    overlays.push({ key: 'LONG_DISTANCE', label: 'Long-distance drive', tone: 'amber' });
  }
  if (std?.borderCrossingFlag) {
    overlays.push({ key: 'BORDER_CROSSING', label: 'Border crossing route', tone: 'red' });
  }

  // Terrain-driven overlays from city/area names — these complement
  // the Route Standard flags so Wadi Rum / Aqaba legs surface desert
  // logistics even when the standard has no terrain flag set.
  const text = `${fromCity} ${toCity} ${fromArea?.city || ''} ${toArea?.city || ''}`.toLowerCase();
  if (/wadi rum|aqaba|desert/.test(text)) {
    if (!overlays.some((o) => o.key === 'DESERT_LOGISTICS')) {
      overlays.push({ key: 'DESERT_LOGISTICS', label: 'Desert logistics', tone: 'amber' });
    }
  }

  return {
    fromCity,
    toCity,
    canonicalCode: std?.canonicalRouteCode || std?.routeCode || null,
    overlays,
    driveHours: std?.standardDurationHours ?? null,
    distanceKm: std?.standardDistanceKm ?? null,
  };
}

/** Compose the journey-level vehicle recommendation. */
export function buildTransportRecommendation(input: {
  paxCount: number;
  destinationCount: number;
  longestLegHours: number;
  totalDriveHours: number;
  hasMountainLeg: boolean;
  hasDesertLeg: boolean;
  hasBorderLeg: boolean;
  hasAirportLeg: boolean;
}): TransportRecommendation | null {
  const cls = recommendVehicleClassByPax(input.paxCount);
  if (!cls) return null;
  const meta = VEHICLE_CLASSES[cls];

  // Comfort notes derived from the leg overlays.
  const comfortNotes: string[] = [];
  if (input.longestLegHours >= 5 || input.totalDriveHours >= 10) {
    comfortNotes.push('Long-distance comfort recommended — pick a unit with reclining seats and AC.');
  }
  if (input.hasDesertLeg) {
    comfortNotes.push('Desert route vehicle preferred — confirm dust-handling + spare-water provisioning.');
  }
  if (input.hasMountainLeg) {
    comfortNotes.push('Mountain-road experienced driver recommended.');
  }
  if (input.hasBorderLeg) {
    comfortNotes.push('Border crossing in itinerary — confirm paperwork + visa status with the supplier.');
  }
  if (input.hasAirportLeg) {
    comfortNotes.push('Airport leg present — confirm pickup timing 90 min before flight.');
  }
  // Luggage tightness: pax sitting at the high end of the vehicle's range.
  if (input.paxCount >= meta.maxPax - 1 && cls !== 'BUS') {
    comfortNotes.push('Tight luggage capacity at this pax count — consider sizing up if luggage is heavy.');
  }

  // "Preferred operational choice" — pax in the comfortable middle of
  // the vehicle's range AND no extreme leg.
  const midRangeBuffer = Math.max(1, Math.floor((meta.maxPax - meta.minPax) / 4));
  const inComfortableMiddle =
    input.paxCount >= meta.minPax + midRangeBuffer && input.paxCount <= meta.maxPax - midRangeBuffer;
  const noExtremeLeg = input.longestLegHours < 6 && !input.hasBorderLeg;
  const preferredOperationalChoice = inComfortableMiddle && noExtremeLeg;

  // Operational confidence label — drawn from leg shape.
  const opConfidence: TransportRecommendation['operationalConfidenceLabel'] =
    input.longestLegHours >= 6 || input.totalDriveHours >= 10
      ? 'High coordination required'
      : input.hasMountainLeg || input.hasBorderLeg
        ? 'Moderate coordination'
        : 'Operationally smooth';

  const seatRange = `${meta.minPax}–${meta.maxPax} pax`;
  const recommendationLine =
    input.destinationCount > 1
      ? `${input.paxCount} pax · ${input.destinationCount}-city Jordan journey`
      : `${input.paxCount} pax · Jordan journey`;

  return {
    vehicleClass: cls,
    label: meta.label,
    icon: meta.icon,
    seatRange,
    typicalExample: meta.typicalExample,
    luggageNote: meta.luggageNote,
    recommendationLine,
    preferredOperationalChoice,
    comfortNotes,
    operationalConfidenceLabel: opConfidence,
  };
}

/** Journey-level transport pacing — supplements the per-leg overlays. */
export function assessJourneyTransportPacing(input: {
  legs: LegTransportInsight[];
  paxCount: number;
  vehicleClass: VehicleClass | undefined;
  longestLegHours: number;
  totalDriveHours: number;
}): TransportSuggestionsResponse['pacing'] {
  // Tight luggage check wins first when the vehicle would be near
  // capacity — luggage stress is the most common silent failure on
  // Jordan ops.
  if (input.vehicleClass) {
    const meta = VEHICLE_CLASSES[input.vehicleClass];
    if (input.paxCount >= meta.maxPax - 1 && input.vehicleClass !== 'BUS') {
      return {
        label: 'Tight luggage capacity',
        tone: 'intense',
        explanation:
          `${input.paxCount} pax in a ${meta.label} leaves limited room for heavy luggage. ` +
          `Consider sizing up to the next vehicle class if guests bring large suitcases.`,
      };
    }
  }
  if (input.longestLegHours >= 6) {
    return {
      label: 'Long-distance touring day',
      tone: 'intense',
      explanation:
        `One leg is ${input.longestLegHours}h — operator should plan rest stops and confirm driver comfort.`,
    };
  }
  if (input.totalDriveHours >= 10 || input.legs.filter((l) => (l.driveHours ?? 0) >= 4).length >= 2) {
    return {
      label: 'High coordination transfer day',
      tone: 'intense',
      explanation:
        `${input.totalDriveHours}h of driving across ${input.legs.length} leg${input.legs.length === 1 ? '' : 's'}. ` +
        `Tight transfer timing — confirm pickup windows + buffer minutes with the supplier.`,
    };
  }
  return {
    label: 'Comfortable pacing',
    tone: 'calm',
    explanation:
      input.totalDriveHours > 0
        ? `${input.totalDriveHours}h of driving across ${input.legs.length} leg${input.legs.length === 1 ? '' : 's'} — comfortable pacing.`
        : 'Single destination or no recorded drive — minimal transport coordination needed.',
  };
}
