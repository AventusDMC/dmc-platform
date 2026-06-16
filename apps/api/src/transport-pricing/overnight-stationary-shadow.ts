// PR 12C-1 — Pure driver-overnight + stationary/standby SHADOW calculation.
//
// READ-ONLY DIAGNOSTIC. This module performs NO I/O, NO DB access, and NO writes. It takes
// already-loaded, plain inputs and returns candidate (un-applied) overnight/stationary charges
// with an explicit rate `source` or a `blocker`. It is INERT: imported nowhere in live pricing
// (wiring into package-pricing-shadow is PR 12C-2). It MUST NOT influence quote totals.
//
// Rules (approved 2026-06-17):
//   baseCity = contract.baseCityOverride ?? supplierBaseCity; missing → blocker.
//   vehicleReturnsToBase === true → no overnight charge. overnightCity === baseCity → no charge.
//   missing overnightCity on an out-of-base candidate → blocker. Never charge base-city nights.
//   driverOvernightPolicy: INCLUDED → included; WAIVED → waived; SEPARATE → rate or blocker.
//   Stationary: released/free → no charge; included → no separate; chargedSeparately → rate or
//   blocker; countsTowardMin → annotate only; never double-count with a counted package full-day.
//   Existing ADD_ON / T.5G fold / excursionPackageRate overlaps → warnings/blockers only.

import type { OperationalTransportType } from '../common/transport-day-classification';

export type CurrencyCode = string;

export type DriverOvernightPolicy = 'INCLUDED' | 'SEPARATE' | 'WAIVED';

/**
 * A pre-fetched ADD_ON rate candidate for a day's supplier+vehicle+date. The caller (PR 12C-2)
 * populates these from the existing ADD_ON lookup (e.g. TransportPricingService.findTransportAddOns);
 * this helper only matches/selects among them. `name` is the raw rate/serviceType label used for
 * city + half-day text matching (there are NO PETRA_OVERNIGHT-style enum codes).
 */
export type OvernightStationaryRateCandidate = {
  source: 'city-addon-rate' | 'supplier-class-addon' | 'capacity-unit-addon';
  amount: number;
  currency: CurrencyCode;
  /** Raw rate/serviceType label (e.g. "Petra Overnight", "Stationary Half Day"). */
  name?: string | null;
  /** capacity_unit mode: vehicles needed = ceil(pax / unitCapacity). */
  unitCapacity?: number | null;
  /** Stationary candidates only: marks a half-day-specific rate. */
  halfDay?: boolean;
};

export type OvernightStationaryContractInput = {
  baseCityOverride?: string | null;
  driverOvernightPolicy?: DriverOvernightPolicy | null;
  driverOvernightAmount?: number | null;
  /** Default true: stationary days still trigger an overnight evaluation. */
  driverOvernightOnStationary?: boolean | null;
  /** Default true. */
  stationaryChargedSeparately?: boolean | null;
  /** Default false. */
  stationaryIncludedInPackage?: boolean | null;
  /** Default false; diagnostic annotation only. */
  stationaryCountsTowardMinDays?: boolean | null;
  currency?: CurrencyCode | null;
};

export type OvernightStationaryDayInput = {
  dayNumber: number;
  operationalType: OperationalTransportType;
  /** From the classifier; used only for the countsTowardMin annotation. */
  packageDayWeight?: number | null;
  /** True when this day's weight already feeds the package full-day rate (avoid double-count). */
  countedAsPackageFullDay?: boolean | null;
  vehicleRetained?: boolean | null;
  vehicleReleased?: boolean | null;
  inRetainedBlock?: boolean | null;
  overnightCity?: string | null;
  vehicleReturnsToBase?: boolean | null;
  /** False when the day has no transport vehicle at all. Default true. */
  hasVehicle?: boolean | null;
  /** True when the day already carries an ADD_ON transport line (T.5G / existing add-on). */
  hasExistingAddOn?: boolean | null;
  /** Heuristic flag from the caller that an overnight may already be folded into baseCost. */
  possibleFoldedOvernight?: boolean | null;
  currency?: CurrencyCode | null;
  pax?: number | null;
  /** True only when the day's transport line genuinely prices in capacity_unit mode. */
  isCapacityUnitDay?: boolean | null;
  overnightRateCandidates?: OvernightStationaryRateCandidate[];
  stationaryRateCandidates?: OvernightStationaryRateCandidate[];
};

export type OvernightStationaryInput = {
  supplierBaseCity?: string | null;
  contract?: OvernightStationaryContractInput | null;
  quoteCurrency?: CurrencyCode | null;
  excursionPackageRate?: boolean | null;
  days: OvernightStationaryDayInput[];
};

export type OvernightOutcome = 'included' | 'waived' | 'separate' | 'no-charge' | 'blocked';
export type StationaryOutcome = 'included' | 'separate' | 'no-charge' | 'blocked';
export type RateSource = OvernightStationaryRateCandidate['source'] | 'contract-flat' | null;

export type OvernightChargeDiagnostic = {
  dayNumber: number;
  overnightCity: string | null;
  baseCity: string | null;
  vehicleReturnsToBase: boolean | null;
  policy: DriverOvernightPolicy | null;
  outcome: OvernightOutcome;
  rateSource: RateSource;
  amount: number;
  currency: CurrencyCode | null;
  reason: string;
  blocker: string | null;
};

export type StationaryChargeDiagnostic = {
  dayNumber: number;
  type: 'STATIONARY_FULL_DAY' | 'STATIONARY_HALF_DAY' | 'STANDBY_WAITING';
  outcome: StationaryOutcome;
  countsTowardMin: boolean;
  packageDayWeightImpact: number;
  rateSource: RateSource;
  amount: number;
  currency: CurrencyCode | null;
  reason: string;
  blocker: string | null;
};

export type OvernightStationaryShadowResult = {
  notApplied: true;
  baseCityResolution: { supplierBaseCity: string | null; contractOverride: string | null; effectiveBaseCity: string | null };
  overnightCharges: OvernightChargeDiagnostic[];
  stationaryCharges: StationaryChargeDiagnostic[];
  totalOvernightShadow: number;
  totalStationaryShadow: number;
  currency: CurrencyCode | null;
  blockers: string[];
  warnings: string[];
};

const STATIONARY_TYPES = new Set<OperationalTransportType>(['STATIONARY_FULL_DAY', 'STATIONARY_HALF_DAY', 'STANDBY_WAITING']);

/** trim → lowercase → strip non-alphanumerics ("Wadi Rum" / "wadi-rum" / "WadiRum" → "wadirum"). */
function normalizeCity(value?: string | null): string | null {
  if (value == null) return null;
  const n = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return n.length > 0 ? n : null;
}

function rawTrim(value?: string | null): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t.length > 0 ? t : null;
}

/** Distinct (amount+currency) reduction; returns 'none' | 'one' | 'many' + the single hit. */
function selectDistinct(candidates: OvernightStationaryRateCandidate[]): {
  kind: 'none' | 'one' | 'many';
  pick: OvernightStationaryRateCandidate | null;
} {
  if (candidates.length === 0) return { kind: 'none', pick: null };
  const distinct = new Map<string, OvernightStationaryRateCandidate>();
  for (const c of candidates) distinct.set(`${c.amount}|${c.currency}`, c);
  if (distinct.size === 1) return { kind: 'one', pick: candidates[0] };
  return { kind: 'many', pick: null };
}

function nameMatchesCity(name: string | null | undefined, normCity: string | null): boolean {
  if (!normCity) return false;
  const n = normalizeCity(name);
  return !!n && n.includes(normCity);
}

/**
 * Pure shadow computation. Always returns notApplied:true and performs no writes. Safe to call with
 * partial/empty data — missing-but-required fields produce per-day blockers, never silent charges.
 */
export function computeOvernightStationaryShadow(input: OvernightStationaryInput): OvernightStationaryShadowResult {
  const contract = input.contract ?? null;
  const supplierBaseCity = rawTrim(input.supplierBaseCity);
  const contractOverride = rawTrim(contract?.baseCityOverride);
  const effectiveBaseCity = contractOverride ?? supplierBaseCity;
  const normBase = normalizeCity(effectiveBaseCity);
  const quoteCurrency = rawTrim(input.quoteCurrency);

  const policy: DriverOvernightPolicy = (contract?.driverOvernightPolicy as DriverOvernightPolicy) ?? 'SEPARATE';
  const driverOvernightOnStationary = contract?.driverOvernightOnStationary !== false; // default true
  const stationaryChargedSeparately = contract?.stationaryChargedSeparately !== false; // default true
  const stationaryIncludedInPackage = contract?.stationaryIncludedInPackage === true; // default false
  const stationaryCountsTowardMinDays = contract?.stationaryCountsTowardMinDays === true; // default false

  const overnightCharges: OvernightChargeDiagnostic[] = [];
  const stationaryCharges: StationaryChargeDiagnostic[] = [];
  const blockers = new Set<string>();
  const warnings = new Set<string>();

  if (input.excursionPackageRate === true) blockers.add('excursion-package-rate-overlap');

  for (const day of input.days) {
    const hasVehicle = day.hasVehicle !== false;
    const released = day.vehicleReleased === true;
    const isStationaryType = STATIONARY_TYPES.has(day.operationalType);
    const isRetained = day.vehicleRetained === true || day.inRetainedBlock === true;

    if (day.possibleFoldedOvernight === true) warnings.add('possible-folded-overnight');

    // ---- Driver overnight ----------------------------------------------------------------
    const overnightRelevant =
      hasVehicle && !released && day.operationalType !== 'FREE_DAY_NO_VEHICLE' && (isRetained || isStationaryType);

    if (overnightRelevant) {
      const dayCurrency = rawTrim(day.currency) ?? rawTrim(contract?.currency) ?? quoteCurrency;
      const base = {
        dayNumber: day.dayNumber,
        overnightCity: rawTrim(day.overnightCity),
        baseCity: effectiveBaseCity,
        vehicleReturnsToBase: day.vehicleReturnsToBase ?? null,
        policy,
      };
      const push = (o: Partial<OvernightChargeDiagnostic> & Pick<OvernightChargeDiagnostic, 'outcome' | 'reason'>) =>
        overnightCharges.push({
          ...base,
          rateSource: o.rateSource ?? null,
          amount: o.amount ?? 0,
          currency: o.currency ?? null,
          blocker: o.blocker ?? null,
          ...o,
        });

      if (!normBase) {
        push({ outcome: 'blocked', reason: 'base-city-missing', blocker: 'base-city-missing' });
      } else if (day.vehicleReturnsToBase === true) {
        push({ outcome: 'no-charge', reason: 'returns-to-base' });
      } else if (!normalizeCity(day.overnightCity)) {
        push({ outcome: 'blocked', reason: 'overnight-city-missing', blocker: 'overnight-city-missing' });
      } else if (normalizeCity(day.overnightCity) === normBase) {
        push({ outcome: 'no-charge', reason: 'overnight-in-base-city' });
      } else if (isStationaryType && !driverOvernightOnStationary) {
        push({ outcome: 'no-charge', reason: 'overnight-on-stationary-disabled' });
      } else if (day.hasExistingAddOn === true) {
        push({ outcome: 'blocked', reason: 'existing-addon-on-day', blocker: 'existing-addon-on-day' });
      } else if (policy === 'INCLUDED') {
        push({ outcome: 'included', reason: 'policy-included' });
      } else if (policy === 'WAIVED') {
        push({ outcome: 'waived', reason: 'policy-waived' });
      } else {
        // SEPARATE → resolve a rate via the approved fallback order.
        const resolved = resolveOvernightRate(day, contract, dayCurrency);
        if (resolved.blocker) {
          push({ outcome: 'blocked', reason: resolved.blocker, blocker: resolved.blocker });
        } else if (quoteCurrency && resolved.currency && resolved.currency !== quoteCurrency) {
          push({ outcome: 'blocked', reason: 'overnight-cross-currency', blocker: 'overnight-cross-currency', currency: resolved.currency });
        } else {
          push({ outcome: 'separate', reason: 'out-of-base', rateSource: resolved.source, amount: resolved.amount, currency: resolved.currency });
        }
      }
    }

    // ---- Stationary / standby ------------------------------------------------------------
    if (isStationaryType) {
      const type = day.operationalType as StationaryChargeDiagnostic['type'];
      const dayCurrency = rawTrim(day.currency) ?? rawTrim(contract?.currency) ?? quoteCurrency;
      const countsTowardMin = stationaryCountsTowardMinDays;
      const weightImpact = countsTowardMin ? (typeof day.packageDayWeight === 'number' ? day.packageDayWeight : 0) : 0;
      const push = (o: Partial<StationaryChargeDiagnostic> & Pick<StationaryChargeDiagnostic, 'outcome' | 'reason'>) =>
        stationaryCharges.push({
          dayNumber: day.dayNumber,
          type,
          countsTowardMin,
          packageDayWeightImpact: weightImpact,
          rateSource: o.rateSource ?? null,
          amount: o.amount ?? 0,
          currency: o.currency ?? null,
          blocker: o.blocker ?? null,
          ...o,
        });

      if (!hasVehicle || released) {
        push({ outcome: 'no-charge', reason: 'no-vehicle' });
      } else if (day.countedAsPackageFullDay === true) {
        warnings.add('stationary-overlaps-package-day');
        push({ outcome: 'no-charge', reason: 'covered-by-package-full-day' });
      } else if (stationaryIncludedInPackage) {
        push({ outcome: 'included', reason: 'stationary-included' });
      } else if (day.hasExistingAddOn === true) {
        push({ outcome: 'blocked', reason: 'existing-addon-on-day', blocker: 'existing-addon-on-day' });
      } else if (!stationaryChargedSeparately) {
        push({ outcome: 'no-charge', reason: 'stationary-not-charged-separately' });
      } else {
        const resolved = resolveStationaryRate(day, type, dayCurrency);
        if (resolved.blocker) {
          push({ outcome: 'blocked', reason: resolved.blocker, blocker: resolved.blocker });
        } else if (quoteCurrency && resolved.currency && resolved.currency !== quoteCurrency) {
          push({ outcome: 'blocked', reason: 'stationary-cross-currency', blocker: 'stationary-cross-currency', currency: resolved.currency });
        } else {
          push({ outcome: 'separate', reason: type === 'STANDBY_WAITING' ? 'standby' : 'stationary', rateSource: resolved.source, amount: resolved.amount, currency: resolved.currency });
        }
      }
    }
  }

  for (const c of overnightCharges) if (c.blocker) blockers.add(c.blocker);
  for (const c of stationaryCharges) if (c.blocker) blockers.add(c.blocker);
  if (overnightCharges.some((c) => c.reason === 'existing-addon-on-day') || input.days.some((d) => d.hasExistingAddOn === true)) {
    warnings.add('addon-overnight-present');
  }

  const totalOvernightShadow = round2(overnightCharges.filter((c) => c.outcome === 'separate').reduce((s, c) => s + c.amount, 0));
  const totalStationaryShadow = round2(stationaryCharges.filter((c) => c.outcome === 'separate').reduce((s, c) => s + c.amount, 0));

  return {
    notApplied: true,
    baseCityResolution: { supplierBaseCity, contractOverride, effectiveBaseCity },
    overnightCharges,
    stationaryCharges,
    totalOvernightShadow,
    totalStationaryShadow,
    currency: quoteCurrency,
    blockers: Array.from(blockers),
    warnings: Array.from(warnings),
  };
}

function resolveOvernightRate(
  day: OvernightStationaryDayInput,
  contract: OvernightStationaryContractInput | null,
  dayCurrency: string | null,
): { source: RateSource; amount: number; currency: CurrencyCode | null; blocker: string | null } {
  const candidates = day.overnightRateCandidates ?? [];
  const normCity = normalizeCity(day.overnightCity);

  // 1. City-specific ADD_ON rate (text match on the rate label).
  const city = candidates.filter((c) => c.source === 'city-addon-rate' && nameMatchesCity(c.name, normCity));
  const cityPick = selectDistinct(city);
  if (cityPick.kind === 'many') return fail('overnight-rate-ambiguous');
  if (cityPick.kind === 'one') return ok('city-addon-rate', cityPick.pick!.amount, cityPick.pick!.currency);

  // 2. Contract flat amount.
  if (contract?.driverOvernightAmount != null) return ok('contract-flat', contract.driverOvernightAmount, dayCurrency);

  // 3. Supplier/class generic ADD_ON.
  const generic = candidates.filter((c) => c.source === 'supplier-class-addon');
  const genericPick = selectDistinct(generic);
  if (genericPick.kind === 'many') return fail('overnight-rate-ambiguous');
  if (genericPick.kind === 'one') return ok('supplier-class-addon', genericPick.pick!.amount, genericPick.pick!.currency);

  // 4. Capacity-unit — only when the source day genuinely prices in capacity_unit mode.
  if (day.isCapacityUnitDay === true) {
    const capacity = candidates.filter((c) => c.source === 'capacity-unit-addon');
    const capPick = selectDistinct(capacity);
    if (capPick.kind === 'many') return fail('overnight-rate-ambiguous');
    if (capPick.kind === 'one') {
      const unit = capPick.pick!;
      const pax = typeof day.pax === 'number' ? day.pax : null;
      if (!pax || !unit.unitCapacity || unit.unitCapacity <= 0) return fail('overnight-capacity-unit-ambiguous');
      const units = Math.ceil(pax / unit.unitCapacity);
      return ok('capacity-unit-addon', round2(unit.amount * units), unit.currency);
    }
  }

  // 5. Nothing resolvable.
  return fail('overnight-rate-missing');

  function ok(source: RateSource, amount: number, currency: CurrencyCode | null) {
    return { source, amount, currency, blocker: null as string | null };
  }
  function fail(blocker: string) {
    return { source: null as RateSource, amount: 0, currency: null as CurrencyCode | null, blocker };
  }
}

function resolveStationaryRate(
  day: OvernightStationaryDayInput,
  type: StationaryChargeDiagnostic['type'],
  dayCurrency: string | null,
): { source: RateSource; amount: number; currency: CurrencyCode | null; blocker: string | null } {
  const candidates = day.stationaryRateCandidates ?? [];
  if (candidates.length === 0) return fail('stationary-rate-missing');

  if (type === 'STATIONARY_HALF_DAY') {
    const half = candidates.filter((c) => c.halfDay === true);
    const halfPick = selectDistinct(half);
    if (halfPick.kind === 'many') return fail('stationary-rate-ambiguous');
    if (halfPick.kind === 'one') return ok('supplier-class-addon', halfPick.pick!.amount, halfPick.pick!.currency);
    // Only full-day rates available → cannot safely derive a half-day price.
    return fail('stationary-half-day-undeterminable');
  }

  // Full day / standby use the full (non-half) pool.
  const full = candidates.filter((c) => c.halfDay !== true);
  const fullPick = selectDistinct(full.length > 0 ? full : candidates);
  if (fullPick.kind === 'many') return fail('stationary-rate-ambiguous');
  if (fullPick.kind === 'one') return ok('supplier-class-addon', fullPick.pick!.amount, fullPick.pick!.currency);
  return fail('stationary-rate-missing');

  function ok(source: RateSource, amount: number, currency: CurrencyCode | null) {
    return { source, amount, currency, blocker: null as string | null };
  }
  function fail(blocker: string) {
    return { source: null as RateSource, amount: 0, currency: dayCurrency ?? null, blocker };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
