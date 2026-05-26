// Route Standards Auto-Cleanup Assistant v1 — pure helpers.
//
// Two responsibilities:
//   1. classifyRouteStandard(row) — bucket each row into one of six
//      categories so the UI can surface non-movement rows for cleanup.
//   2. suggestTimingForRoute(row, allRows) — fill missing timing on
//      MOVEMENT_LEG rows from (a) the reverse direction, (b) a
//      hand-curated Jordan operational backbone, or (c) leave alone
//      and flag "needs_review".
//
// Everything here is pure — no DB access, no side effects. The service
// loads rows once and feeds them through these helpers. Tests are easy.

export type RouteClassification =
  | 'MOVEMENT_LEG'
  | 'TOURING_PROGRAM'
  | 'ACTIVITY_EXPERIENCE'
  | 'ROUND_TRIP_PROGRAM'
  | 'MULTI_STOP_FLOW'
  | 'UNKNOWN_REVIEW';

export type RecommendedAction =
  | 'KEEP_AS_ROUTE_STANDARD'
  | 'DEACTIVATE_FROM_ROUTE_STANDARDS'
  | 'CONVERT_TO_TOURING_ROUTE'
  | 'CONVERT_TO_ACTIVITY'
  | 'CONVERT_TO_EXCURSION_TEMPLATE'
  | 'NEEDS_HUMAN_REVIEW';

export type ClassificationResult = {
  classification: RouteClassification;
  recommendedAction: RecommendedAction;
  reason: string;
  // High = the classifier is confident enough that bulk-deactivate
  // can act on it; low = surface but never auto-act.
  confidence: 'high' | 'medium' | 'low';
};

// Activity / experience keywords that should flag a row out of
// MOVEMENT_LEG even when it has an A_B code shape (the legacy bootstrap
// produced lots of AQ_BOAT-style rows).
const ACTIVITY_KEYWORDS = [
  'BOAT', 'DIVING', 'DIVE', 'SNORK', 'SNORKEL', 'YACHT', 'SUBMARINE',
  'GOLF', 'JEEP', 'SAFARI', 'KAYAK', 'CYCLING', 'CYCLE', 'PARAGLID',
  'HORSE', 'CAMEL', 'COOKING', 'COOK CLASS', 'TURKISH BATH', 'SPA',
  'WELLNESS', 'EXPERIENCE', 'MASSAGE', 'HIKING', 'TREK', 'CLIMB',
];

// Touring-program markers — these are sellable tours, not movement legs.
const TOURING_KEYWORDS = [
  'FULL DAY', 'FULL-DAY', 'HALF DAY', 'HALF-DAY', 'TOUR',
  'EXCURSION', 'PROGRAM', 'ITINERARY', 'OVERNIGHT TOUR',
  'CITY TOUR', 'DAY TRIP',
];

// Round-trip markers.
const ROUND_TRIP_KEYWORDS = ['ROUND TRIP', 'ROUND-TRIP', 'RT ', ' RT', '_RT', 'RT_', 'RETURN'];

function makeReason(parts: string[]): string {
  return parts.filter(Boolean).join(' · ');
}

/**
 * Classify a Route Standard. Priority order (first hit wins):
 *
 *   1. ACTIVITY_EXPERIENCE  — keyword in code/name (BOAT, DIVING, SAFARI, etc.)
 *   2. ROUND_TRIP_PROGRAM   — RT marker OR same-area loop in name
 *   3. MULTI_STOP_FLOW      — ≥2 arrows in name OR ≥4 segments in code
 *   4. TOURING_PROGRAM      — keyword (FULL DAY, TOUR, EXCURSION) OR JOR-TR prefix
 *   5. MOVEMENT_LEG         — simple A_B code shape + simple A → B name
 *   6. UNKNOWN_REVIEW       — anything else (low confidence)
 *
 * Ordering matters: an "AQ_DIVING" row has A_B shape but is an activity,
 * so the activity check must run first. Conversely "JOR-TR-AMM-PET" has
 * arrows-in-code shape but is a touring program; the touring check
 * specifically tests for the JOR-TR prefix.
 */
export function classifyRouteStandard(row: {
  routeCode?: string | null;
  canonicalRouteCode?: string | null;
  routeName?: string | null;
  fromCity?: string | null;
  toCity?: string | null;
  standardDurationHours?: number | null;
  isActive?: boolean;
  reviewStatus?: string | null;
  source?: string | null;
}): ClassificationResult {
  const code = String(row.routeCode || '').toUpperCase();
  const name = String(row.routeName || '').toUpperCase();
  const combined = `${code} ${name}`;

  // 1. ACTIVITY_EXPERIENCE — keyword match in code OR name.
  const activityHit = ACTIVITY_KEYWORDS.find((kw) => combined.includes(kw));
  if (activityHit) {
    return {
      classification: 'ACTIVITY_EXPERIENCE',
      recommendedAction: 'CONVERT_TO_ACTIVITY',
      reason: makeReason([`Contains activity keyword "${activityHit}"`]),
      confidence: 'high',
    };
  }

  // 2. ROUND_TRIP_PROGRAM — RT marker OR loop pattern.
  const rtHit = ROUND_TRIP_KEYWORDS.find((kw) => combined.includes(kw));
  // Same-area-loop: name like "Amman → Madaba → Amman" or any structure
  // where the first and last named places match.
  const arrowParts = name.split(/[→\-]+/).map((s) => s.trim()).filter(Boolean);
  const isLoopPattern = arrowParts.length >= 3 && arrowParts[0] && arrowParts[0] === arrowParts[arrowParts.length - 1];
  if (rtHit || isLoopPattern) {
    return {
      classification: 'ROUND_TRIP_PROGRAM',
      recommendedAction: 'CONVERT_TO_TOURING_ROUTE',
      reason: makeReason([
        rtHit ? `Contains "${rtHit.trim()}"` : '',
        isLoopPattern ? 'Name returns to starting place' : '',
      ]),
      confidence: 'high',
    };
  }

  // 3. MULTI_STOP_FLOW — ≥2 arrows in name (more than a simple A → B)
  //    OR an obviously long multi-segment code.
  const arrowCount = (name.match(/→|->|>|—/g) || []).length;
  const codeSegments = code.split(/[_\-\s]+/).filter(Boolean).length;
  if (arrowCount >= 2 || codeSegments >= 6) {
    return {
      classification: 'MULTI_STOP_FLOW',
      recommendedAction: 'CONVERT_TO_TOURING_ROUTE',
      reason: makeReason([
        arrowCount >= 2 ? `Name has ${arrowCount} arrows (multi-stop)` : '',
        codeSegments >= 6 ? `Code has ${codeSegments} segments` : '',
      ]),
      confidence: arrowCount >= 2 ? 'high' : 'medium',
    };
  }

  // 4. TOURING_PROGRAM — keyword match OR JOR-TR / JOR_TR / TR- prefix.
  const touringHit = TOURING_KEYWORDS.find((kw) => combined.includes(kw));
  const touringCodePrefix = /^JOR[-_]TR/i.test(code) || /^TR[-_]/.test(code);
  if (touringHit || touringCodePrefix) {
    return {
      classification: 'TOURING_PROGRAM',
      recommendedAction: 'CONVERT_TO_TOURING_ROUTE',
      reason: makeReason([
        touringHit ? `Contains "${touringHit}"` : '',
        touringCodePrefix ? 'Code uses touring-route prefix (JOR-TR / TR-)' : '',
      ]),
      confidence: 'high',
    };
  }

  // 5. MOVEMENT_LEG — code looks like FROM_TO and name has at most one arrow.
  // The canonical FROM_TO pattern: 2–5 alpha chars, underscore, 2–5 alpha chars
  // (allows AMM_PET, QAIA_AMM, ALLENBY_AMM). Legacy long codes won't match
  // exactly but if the row has fromCity + toCity AND a sane name with one
  // arrow, treat as movement.
  const canonical = String(row.canonicalRouteCode || '').toUpperCase();
  const isFromToShape =
    /^[A-Z]{2,8}_[A-Z]{2,8}$/.test(canonical) ||
    /^[A-Z]{2,8}_[A-Z]{2,8}$/.test(code);
  const hasSimpleArrowName = arrowCount <= 1;
  const hasFromAndTo = Boolean(row.fromCity && row.toCity);
  if (isFromToShape && hasSimpleArrowName && hasFromAndTo) {
    return {
      classification: 'MOVEMENT_LEG',
      recommendedAction: 'KEEP_AS_ROUTE_STANDARD',
      reason: 'Code matches FROM_TO; name is a single movement leg',
      confidence: 'high',
    };
  }

  // Movement-like fallback for rows that have FROM_TO code AND one arrow
  // in name but no city columns yet — common for pre-canonicalization
  // rows. Lower confidence so bulk-actions skip them.
  if (isFromToShape && hasSimpleArrowName) {
    return {
      classification: 'MOVEMENT_LEG',
      recommendedAction: 'KEEP_AS_ROUTE_STANDARD',
      reason: 'Code matches FROM_TO; fromCity/toCity missing — fill in to confirm',
      confidence: 'medium',
    };
  }

  // 6. UNKNOWN_REVIEW — couldn't categorize confidently.
  return {
    classification: 'UNKNOWN_REVIEW',
    recommendedAction: 'NEEDS_HUMAN_REVIEW',
    reason: 'Classifier could not categorize this row confidently',
    confidence: 'low',
  };
}

// ---------------------------------------------------------------------------
// Jordan backbone — hand-curated operational timing for the common DMC
// movement legs. Values came from operational baselines (DMC ops staff
// validated). Used as a "high confidence" suggestion source when a row's
// canonical code matches a key here. Symmetric: AMM_PET and PET_AMM share
// the same numbers.
// ---------------------------------------------------------------------------

type JordanBackboneEntry = {
  distanceKm: number;
  durationHours: number;
  bufferMinutes: number;
  flags?: Partial<{
    longDistanceFlag: boolean;
    overnightRisk: boolean;
    mountainRoadFlag: boolean;
    borderCrossingFlag: boolean;
    airportRouteFlag: boolean;
  }>;
};

const RAW_BACKBONE: Record<string, JordanBackboneEntry> = {
  // Amman ↔ tourism hubs
  AMM_PET: { distanceKm: 235, durationHours: 3.5, bufferMinutes: 30, flags: { mountainRoadFlag: true } },
  AMM_WR: { distanceKm: 320, durationHours: 4, bufferMinutes: 30, flags: { longDistanceFlag: true } },
  AMM_DS: { distanceKm: 55, durationHours: 1, bufferMinutes: 15 },
  AMM_JER: { distanceKm: 50, durationHours: 1, bufferMinutes: 15 },
  AMM_AJL: { distanceKm: 75, durationHours: 1.25, bufferMinutes: 20 },
  AMM_MAD: { distanceKm: 30, durationHours: 0.75, bufferMinutes: 15 },
  AMM_NEB: { distanceKm: 35, durationHours: 0.85, bufferMinutes: 15 },
  AMM_AQJ: { distanceKm: 330, durationHours: 4, bufferMinutes: 30, flags: { longDistanceFlag: true } },
  AMM_IRB: { distanceKm: 80, durationHours: 1.5, bufferMinutes: 20 },
  AMM_KRK: { distanceKm: 130, durationHours: 2, bufferMinutes: 20, flags: { mountainRoadFlag: true } },

  // Airport hops
  QAIA_AMM: { distanceKm: 35, durationHours: 0.75, bufferMinutes: 30, flags: { airportRouteFlag: true } },
  QAIA_DS: { distanceKm: 80, durationHours: 1.5, bufferMinutes: 30, flags: { airportRouteFlag: true } },
  QAIA_PET: { distanceKm: 220, durationHours: 3.25, bufferMinutes: 30, flags: { airportRouteFlag: true, mountainRoadFlag: true } },
  QAIA_MAD: { distanceKm: 25, durationHours: 0.5, bufferMinutes: 30, flags: { airportRouteFlag: true } },

  // Petra ↔ other hubs
  PET_WR: { distanceKm: 110, durationHours: 2, bufferMinutes: 20 },
  PET_AQJ: { distanceKm: 130, durationHours: 2, bufferMinutes: 20 },
  PET_DS: { distanceKm: 230, durationHours: 3, bufferMinutes: 30, flags: { mountainRoadFlag: true } },
  PET_KRK: { distanceKm: 95, durationHours: 1.5, bufferMinutes: 20, flags: { mountainRoadFlag: true } },

  // Wadi Rum ↔ other hubs
  WR_AQJ: { distanceKm: 70, durationHours: 1.25, bufferMinutes: 15 },
  WR_DS: { distanceKm: 270, durationHours: 4, bufferMinutes: 30, flags: { longDistanceFlag: true } },

  // Dead Sea ↔ other hubs
  DS_PET: { distanceKm: 230, durationHours: 3, bufferMinutes: 30, flags: { mountainRoadFlag: true } },
  DS_AQJ: { distanceKm: 280, durationHours: 4, bufferMinutes: 30, flags: { longDistanceFlag: true } },
  DS_MAD: { distanceKm: 45, durationHours: 1, bufferMinutes: 15 },
  DS_ALLENBY: { distanceKm: 25, durationHours: 0.5, bufferMinutes: 60, flags: { borderCrossingFlag: true } },

  // Aqaba ↔ other hubs (besides those above)
  AQJ_DS: { distanceKm: 280, durationHours: 4, bufferMinutes: 30, flags: { longDistanceFlag: true } },
  AQJ_WAB: { distanceKm: 8, durationHours: 0.25, bufferMinutes: 60, flags: { borderCrossingFlag: true } },

  // Borders
  AMM_ALLENBY: { distanceKm: 55, durationHours: 1.25, bufferMinutes: 60, flags: { borderCrossingFlag: true } },
  AMM_SHB: { distanceKm: 95, durationHours: 1.75, bufferMinutes: 60, flags: { borderCrossingFlag: true } },

  // North
  JER_AJL: { distanceKm: 25, durationHours: 0.5, bufferMinutes: 15 },
  AMM_JER_AJL: { distanceKm: 90, durationHours: 1.75, bufferMinutes: 20 }, // legacy multi-stop ignored by classifier; entry kept as a courtesy if it ever lands here
};

// Build symmetric lookup: PET_AMM gets the same numbers as AMM_PET.
const JORDAN_BACKBONE = new Map<string, JordanBackboneEntry>();
for (const [code, entry] of Object.entries(RAW_BACKBONE)) {
  JORDAN_BACKBONE.set(code, entry);
  const parts = code.split('_');
  if (parts.length === 2) {
    const reversed = `${parts[1]}_${parts[0]}`;
    if (!JORDAN_BACKBONE.has(reversed)) JORDAN_BACKBONE.set(reversed, entry);
  }
}

export type TimingSuggestion = {
  distanceKm: number | null;
  durationHours: number | null;
  bufferMinutes: number | null;
  flags: {
    longDistanceFlag: boolean;
    overnightRisk: boolean;
    mountainRoadFlag: boolean;
    borderCrossingFlag: boolean;
    airportRouteFlag: boolean;
  };
  source: 'jordan_backbone' | 'reverse_route' | 'none';
  confidence: 'high' | 'reverse_inherited' | 'estimated' | 'needs_review';
  reason: string;
};

const EMPTY_FLAGS = {
  longDistanceFlag: false,
  overnightRisk: false,
  mountainRoadFlag: false,
  borderCrossingFlag: false,
  airportRouteFlag: false,
};

/**
 * Suggest realistic timing for a Route Standard. Resolution order:
 *   1. Jordan backbone — operationally-known canonical pairs (HIGH).
 *   2. Reverse route — same canonical code reversed has its own values
 *      (REVERSE_INHERITED).
 *   3. None — return null values and confidence "needs_review".
 *
 * Pure: takes the target row + the full list of route standards (the
 * service does a single findMany and reuses it).
 */
export function suggestTimingForRoute(
  target: {
    canonicalRouteCode?: string | null;
    routeCode?: string | null;
    standardDistanceKm?: number | null;
    standardDurationHours?: number | null;
    operationalBufferMinutes?: number | null;
  },
  allRows: Array<{
    canonicalRouteCode?: string | null;
    routeCode?: string | null;
    standardDistanceKm?: number | null;
    standardDurationHours?: number | null;
    operationalBufferMinutes?: number | null;
    longDistanceFlag?: boolean;
    overnightRisk?: boolean;
    mountainRoadFlag?: boolean;
    borderCrossingFlag?: boolean;
    airportRouteFlag?: boolean;
  }>,
): TimingSuggestion {
  const code = (target.canonicalRouteCode || target.routeCode || '').toUpperCase();

  // Step 1: Jordan backbone — exact match on canonical code.
  const backbone = JORDAN_BACKBONE.get(code);
  if (backbone) {
    return {
      distanceKm: backbone.distanceKm,
      durationHours: backbone.durationHours,
      bufferMinutes: backbone.bufferMinutes,
      flags: { ...EMPTY_FLAGS, ...backbone.flags },
      source: 'jordan_backbone',
      confidence: 'high',
      reason: `Jordan operational backbone entry for ${code}.`,
    };
  }

  // Step 2: reverse route inheritance.
  if (code.includes('_')) {
    const [from, to] = code.split('_');
    if (from && to) {
      const reverseCode = `${to}_${from}`;
      const reverseRow = allRows.find(
        (r) =>
          (r.canonicalRouteCode || r.routeCode || '').toUpperCase() === reverseCode &&
          // Need actual values to inherit — empty reverse helps nothing.
          (r.standardDistanceKm != null || r.standardDurationHours != null),
      );
      if (reverseRow) {
        return {
          distanceKm: reverseRow.standardDistanceKm ?? null,
          durationHours: reverseRow.standardDurationHours ?? null,
          bufferMinutes: reverseRow.operationalBufferMinutes ?? null,
          flags: {
            longDistanceFlag: Boolean(reverseRow.longDistanceFlag),
            overnightRisk: Boolean(reverseRow.overnightRisk),
            mountainRoadFlag: Boolean(reverseRow.mountainRoadFlag),
            borderCrossingFlag: Boolean(reverseRow.borderCrossingFlag),
            airportRouteFlag: Boolean(reverseRow.airportRouteFlag),
          },
          source: 'reverse_route',
          confidence: 'reverse_inherited',
          reason: `Inherited from the reverse leg ${reverseCode}.`,
        };
      }
    }
  }

  // Step 3: no suggestion source — operator must fill manually.
  return {
    distanceKm: null,
    durationHours: null,
    bufferMinutes: null,
    flags: { ...EMPTY_FLAGS },
    source: 'none',
    confidence: 'needs_review',
    reason: 'No backbone entry and no reverse leg with timing.',
  };
}

/**
 * Whether the target row currently has timing values (operator already
 * filled them in). Used by bulk-apply to skip rows that don't need
 * suggestions.
 */
export function rowHasTiming(row: {
  standardDistanceKm?: number | null;
  standardDurationHours?: number | null;
}): boolean {
  return (
    (row.standardDistanceKm != null && row.standardDistanceKm > 0) ||
    (row.standardDurationHours != null && row.standardDurationHours > 0)
  );
}

/**
 * Whether a row is "protected" from auto-bulk actions (deactivate or
 * apply-timing). VERIFIED + source=MANUAL rows are operator-curated and
 * must never be silently overwritten.
 */
export function isProtectedRow(row: { reviewStatus?: string | null; source?: string | null }): boolean {
  return row.reviewStatus === 'VERIFIED' || row.source === 'MANUAL';
}

// ---------------------------------------------------------------------------
// Suspicious-duration detector — re-export from route-standards.service if
// it exists there. For this assistant we re-implement to keep cleanup
// helpers independent.
// ---------------------------------------------------------------------------

const SUSPICIOUS_CAPS: Array<{ tokens: string[]; capHours: number; label: string }> = [
  { tokens: ['PET'], capHours: 6, label: 'Petra > 6h is suspicious' },
  { tokens: ['WR'], capHours: 8, label: 'Wadi Rum > 8h is suspicious' },
  { tokens: ['JER'], capHours: 3, label: 'Jerash > 3h is suspicious' },
  { tokens: ['DS'], capHours: 4, label: 'Dead Sea > 4h is suspicious' },
  { tokens: ['AQJ'], capHours: 6, label: 'Aqaba > 6h is suspicious' },
];

/**
 * Spot suspicious durations for MOVEMENT_LEG rows. Returns null when the
 * duration is within realistic bounds. Used by the cleanup preview table.
 */
export function detectSuspiciousMovementDuration(row: {
  canonicalRouteCode?: string | null;
  routeCode?: string | null;
  standardDurationHours?: number | null;
  classification?: RouteClassification;
}): { suspicious: boolean; reason: string | null } {
  if (row.classification && row.classification !== 'MOVEMENT_LEG') {
    return { suspicious: false, reason: null };
  }
  const hours = Number(row.standardDurationHours ?? 0);
  if (!Number.isFinite(hours) || hours <= 0) return { suspicious: false, reason: null };
  if (hours > 12) {
    return { suspicious: true, reason: `${hours}h exceeds 12h — no real Jordan movement leg takes that long.` };
  }
  const code = (row.canonicalRouteCode || row.routeCode || '').toUpperCase();
  const parts = code.split('_');
  // Strictest matching cap wins.
  let strictest: { cap: number; label: string } | null = null;
  for (const rule of SUSPICIOUS_CAPS) {
    if (parts.some((p) => rule.tokens.includes(p))) {
      if (!strictest || rule.capHours < strictest.cap) {
        strictest = { cap: rule.capHours, label: rule.label };
      }
    }
  }
  if (strictest && hours > strictest.cap) {
    return { suspicious: true, reason: `${strictest.label} (got ${hours}h)` };
  }
  return { suspicious: false, reason: null };
}
