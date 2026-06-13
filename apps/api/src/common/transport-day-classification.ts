// Transport day-classification (PR3 of the contract-regime refactor) — SHADOW MODE.
//
// Pure, side-effect-free classifier for the two-axis itinerary model that future
// package-eligibility (PR4+) will consume. INERT: imported nowhere in the pricing/quote
// path, so it changes no quote total, supplier, or pricing method. Classify ONLY — it
// does not price, enforce minimum days, charge overnight, or activate any package logic.
//
// Axis 1 — operational transport type (what physically happens).
// Axis 2 — package weighting (whether/how much the day counts toward a package minimum),
//          driven by retention + contract policy, never by adjacency alone.

export const OPERATIONAL_TRANSPORT_TYPES = [
  'AIRPORT_TRANSFER',
  'POINT_TO_POINT',
  'TOURING_ROUTE',
  'FULL_DAY_SERVICE',
  'HALF_DAY_SERVICE',
  'STATIONARY_FULL_DAY',
  'STATIONARY_HALF_DAY',
  'STANDBY_WAITING',
  'FREE_DAY_NO_VEHICLE',
] as const;
export type OperationalTransportType = (typeof OPERATIONAL_TRANSPORT_TYPES)[number];

export const BILLED_AS_VALUES = [
  'full-day',
  'half-day',
  'separate-transfer',
  'stationary',
  'standby',
  'free',
  'manual-required',
] as const;
export type BilledAs = (typeof BILLED_AS_VALUES)[number];

// Diagnostic reason for the retention decision (helps debugging before PR4 enforces min days).
export const RETENTION_REASONS = [
  'explicit-retained', // explicit retained override = true
  'retained-block', // day flagged as inside an explicit retained/package block
  'continuous-same-vehicle', // same supplier+vehicle across adjacent days + a not-released signal
  'released', // explicit released, or explicit retained = false
  'not-retained-default', // lone day with no signal, OR adjacency-only candidate (see retentionCandidate)
  'not-applicable', // operational type whose weight is not retention-driven
] as const;
export type RetentionReason = (typeof RETENTION_REASONS)[number];

export type DayClassificationPolicy = {
  halfDayCountsTowardMin?: boolean; // default false
  halfDayChargedAsFullDay?: boolean; // default false
  stationaryCountsTowardMinDays?: boolean; // default false
  airportTransferIncluded?: boolean; // default false
  halfDayWeight?: number; // default 0.5 — weight of a counted half-day
};

const DEFAULT_POLICY: Required<DayClassificationPolicy> = {
  halfDayCountsTowardMin: false,
  halfDayChargedAsFullDay: false,
  stationaryCountsTowardMinDays: false,
  airportTransferIncluded: false,
  halfDayWeight: 0.5,
};

// Input to the standalone per-day classifier (retention already resolved by the caller
// or by classifyItinerary). vehicleRetained defaults to false (conservative).
export type DayClassificationInput = {
  operationalType: OperationalTransportType;
  vehicleRetained?: boolean;
  retentionReason?: RetentionReason;
  retentionCandidate?: boolean;
};

export type DayClassification = {
  operationalType: OperationalTransportType;
  vehicleRetained: boolean;
  countsAsFullPackageDay: boolean; // packageDayWeight >= 1
  countsTowardMinimum: boolean; // packageDayWeight > 0
  packageDayWeight: number;
  billedAs: BilledAs;
  retentionReason: RetentionReason;
  retentionCandidate: boolean; // adjacency-only candidate — NOT counted; needs manual confirmation
};

// Per-day classification. Pure. Retention must already be decided; this only applies
// operational-type + contract-policy weighting rules.
export function classifyTransportDay(
  input: DayClassificationInput,
  policy: DayClassificationPolicy = {},
): DayClassification {
  const p = { ...DEFAULT_POLICY, ...policy };
  const t = input.operationalType;
  const retained = input.vehicleRetained === true;
  const retentionCandidate = input.retentionCandidate === true;
  const retentionReason: RetentionReason = input.retentionReason ?? 'not-applicable';

  let weight = 0;
  let billedAs: BilledAs = 'separate-transfer';

  switch (t) {
    case 'FREE_DAY_NO_VEHICLE':
      weight = 0;
      billedAs = 'free';
      break;
    case 'TOURING_ROUTE':
    case 'FULL_DAY_SERVICE':
      weight = 1;
      billedAs = 'full-day';
      break;
    case 'AIRPORT_TRANSFER':
      // Default 0 (billed separately). Counts only if the contract includes it; an
      // airport+sightseeing day is reclassified UPSTREAM as TOURING_ROUTE/FULL_DAY_SERVICE.
      if (p.airportTransferIncluded) {
        weight = 1;
        billedAs = 'full-day';
      } else {
        weight = 0;
        billedAs = 'separate-transfer';
      }
      break;
    case 'POINT_TO_POINT':
      if (retained) {
        weight = 1;
        billedAs = 'full-day';
      } else if (retentionCandidate) {
        // same supplier+vehicle adjacency with no release/block signal — needs a human call.
        weight = 0;
        billedAs = 'manual-required';
      } else {
        weight = 0;
        billedAs = 'separate-transfer';
      }
      break;
    case 'HALF_DAY_SERVICE':
      if (p.halfDayChargedAsFullDay) {
        weight = 1;
        billedAs = 'full-day';
      } else if (p.halfDayCountsTowardMin) {
        weight = p.halfDayWeight;
        billedAs = 'half-day';
      } else {
        weight = 0;
        billedAs = 'half-day';
      }
      break;
    case 'STATIONARY_FULL_DAY':
      weight = p.stationaryCountsTowardMinDays ? 1 : 0;
      billedAs = 'stationary';
      break;
    case 'STATIONARY_HALF_DAY':
      weight = 0;
      billedAs = 'stationary';
      break;
    case 'STANDBY_WAITING':
      weight = 0;
      billedAs = 'standby';
      break;
  }

  return {
    operationalType: t,
    vehicleRetained: retained,
    countsAsFullPackageDay: weight >= 1,
    countsTowardMinimum: weight > 0,
    packageDayWeight: weight,
    billedAs,
    retentionReason,
    retentionCandidate,
  };
}

// Itinerary-level day input. supplierKey/vehicleKey drive same-vehicle adjacency
// detection; the explicit flags drive the (conservative) retention decision.
export type ItineraryDayInput = {
  operationalType: OperationalTransportType;
  supplierKey?: string | null;
  vehicleKey?: string | null;
  retained?: boolean; // explicit override (true = retained, false = released)
  inRetainedBlock?: boolean; // explicit retained/package block membership
  vehicleReleased?: boolean; // true = released; false = stays with group; undefined = no info
};

function sameVehicleAdjacent(day: ItineraryDayInput, other?: ItineraryDayInput): boolean {
  if (!other) return false;
  if (!day.supplierKey || !day.vehicleKey) return false;
  return other.supplierKey === day.supplierKey && other.vehicleKey === day.vehicleKey;
}

// Conservative retention resolution for a POINT_TO_POINT day. Adjacency ALONE is never
// proof of retention — it only makes the day a candidate. (Other operational types are
// not retention-driven: touring/full-day are retained by nature; transfers/stationary/
// standby/free are not.)
export function resolveRetention(
  day: ItineraryDayInput,
  prev?: ItineraryDayInput,
  next?: ItineraryDayInput,
): { vehicleRetained: boolean; retentionReason: RetentionReason; retentionCandidate: boolean } {
  if (day.operationalType === 'TOURING_ROUTE' || day.operationalType === 'FULL_DAY_SERVICE') {
    return { vehicleRetained: true, retentionReason: 'not-applicable', retentionCandidate: false };
  }
  if (day.operationalType !== 'POINT_TO_POINT') {
    return { vehicleRetained: false, retentionReason: 'not-applicable', retentionCandidate: false };
  }
  // POINT_TO_POINT — apply the locked precedence.
  if (day.retained === true) return { vehicleRetained: true, retentionReason: 'explicit-retained', retentionCandidate: false };
  if (day.retained === false) return { vehicleRetained: false, retentionReason: 'released', retentionCandidate: false };
  if (day.inRetainedBlock === true) return { vehicleRetained: true, retentionReason: 'retained-block', retentionCandidate: false };
  if (day.vehicleReleased === true) return { vehicleRetained: false, retentionReason: 'released', retentionCandidate: false };

  const adjacent = sameVehicleAdjacent(day, prev) || sameVehicleAdjacent(day, next);
  if (adjacent && day.vehicleReleased === false) {
    return { vehicleRetained: true, retentionReason: 'continuous-same-vehicle', retentionCandidate: false };
  }
  if (adjacent) {
    // adjacency with no release/block info → candidate only, NOT counted.
    return { vehicleRetained: false, retentionReason: 'not-retained-default', retentionCandidate: true };
  }
  return { vehicleRetained: false, retentionReason: 'not-retained-default', retentionCandidate: false };
}

export type ItineraryClassification = {
  days: DayClassification[];
  countedFullPackageDays: number; // sum of packageDayWeight
};

// Classify a whole itinerary (shadow). Resolves retention per day using neighbours, then
// applies per-day weighting. Returns classifications + the summed package-day weight. Does
// NOT enforce any minimum or price anything.
export function classifyItinerary(
  days: ItineraryDayInput[],
  policy: DayClassificationPolicy = {},
): ItineraryClassification {
  const classified = days.map((day, i) => {
    const ret = resolveRetention(day, days[i - 1], days[i + 1]);
    return classifyTransportDay(
      {
        operationalType: day.operationalType,
        vehicleRetained: ret.vehicleRetained,
        retentionReason: ret.retentionReason,
        retentionCandidate: ret.retentionCandidate,
      },
      policy,
    );
  });
  const countedFullPackageDays = Number(
    classified.reduce((sum, c) => sum + c.packageDayWeight, 0).toFixed(2),
  );
  return { days: classified, countedFullPackageDays };
}
