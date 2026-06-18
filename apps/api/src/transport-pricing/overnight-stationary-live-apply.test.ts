import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { decideOvernightStationaryLiveApply } from './overnight-stationary-live-apply';
import { PackageEligibilityShadowService } from './package-eligibility-shadow.service';

// PR 12F-2 — overnight/stationary live apply (number-changing, behind transport.overnightStationaryLiveApply).
// The decider folds a pass-through COST delta (sellDelta always 0) when the shadow is valid,
// blocker-free, and has recognized 'separate' charges; any blocker aborts the whole apply.

const LIVE_FLAG = 'TRANSPORT_OVERNIGHT_STATIONARY_LIVE_APPLY';
const SHADOW_FLAG = 'TRANSPORT_PACKAGE_PRICING_SHADOW_COMPARE';
const setEnv = (name: string, on: boolean) => { if (on) process.env[name] = 'true'; else delete process.env[name]; };

// ---- synthetic shadow builders ---------------------------------------------------------------
const ovSeparate = (day: number, amount: number, city = 'Petra') => ({ dayNumber: day, overnightCity: city, baseCity: 'Amman', vehicleReturnsToBase: false, policy: 'SEPARATE', outcome: 'separate', rateSource: 'city-addon-rate', amount, currency: 'JOD', reason: 'out-of-base', blocker: null });
const ovBlocked = (day: number, blocker: string) => ({ dayNumber: day, overnightCity: 'Petra', baseCity: 'Amman', vehicleReturnsToBase: false, policy: 'SEPARATE', outcome: 'blocked', rateSource: null, amount: 0, currency: null, reason: blocker, blocker });
const stSeparate = (day: number, amount: number) => ({ dayNumber: day, type: 'STATIONARY_FULL_DAY', outcome: 'separate', countsTowardMin: false, packageDayWeightImpact: 0, rateSource: 'supplier-class-addon', amount, currency: 'JOD', reason: 'stationary', blocker: null });
const stIncluded = (day: number) => ({ dayNumber: day, type: 'STATIONARY_FULL_DAY', outcome: 'included', countsTowardMin: false, packageDayWeightImpact: 0, rateSource: null, amount: 0, currency: 'JOD', reason: 'stationary-included', blocker: null });
const stBlocked = (day: number, blocker: string) => ({ dayNumber: day, type: 'STATIONARY_FULL_DAY', outcome: 'blocked', countsTowardMin: false, packageDayWeightImpact: 0, rateSource: null, amount: 0, currency: null, reason: blocker, blocker });

function shadow(overnightCharges: any[], stationaryCharges: any[], extra: any = {}): any {
  const sep = (cs: any[]) => cs.filter((c) => c.outcome === 'separate').reduce((s, c) => s + c.amount, 0);
  return {
    notApplied: true,
    baseCityResolution: { supplierBaseCity: 'Amman', contractOverride: null, effectiveBaseCity: 'Amman' },
    overnightCharges, stationaryCharges,
    totalOvernightShadow: sep(overnightCharges), totalStationaryShadow: sep(stationaryCharges),
    currency: 'JOD',
    blockers: extra.blockers ?? [],
    warnings: extra.warnings ?? ['capacity-unit-overnight-not-evaluated-in-12c2'],
  };
}

// ---- pure decider — decision matrix ----------------------------------------------------------
test('12F-2: null/absent shadow → no apply, zero delta', () => {
  const r = decideOvernightStationaryLiveApply(null);
  assert.equal(r.apply, false);
  assert.equal(r.reason, 'no-shadow');
  assert.equal(r.costDelta, 0);
  assert.equal(r.sellDelta, 0);
});

test('12F-2: existing ADD_ON overnight blocks apply (abort, zero delta)', () => {
  const r = decideOvernightStationaryLiveApply(shadow([ovBlocked(1, 'existing-addon-on-day')], []));
  assert.equal(r.apply, false);
  assert.equal(r.reason, 'blocked');
  assert.ok(r.blockers.includes('existing-addon-on-day'));
  assert.equal(r.costDelta, 0);
});

test('12F-2: missing overnight rule blocks apply', () => {
  const r = decideOvernightStationaryLiveApply(shadow([ovBlocked(1, 'overnight-rate-missing')], []));
  assert.equal(r.apply, false);
  assert.equal(r.reason, 'blocked');
  assert.equal(r.costDelta, 0);
});

test('12F-2: missing stationary rule blocks apply', () => {
  const r = decideOvernightStationaryLiveApply(shadow([], [stBlocked(2, 'stationary-rate-missing')]));
  assert.equal(r.apply, false);
  assert.equal(r.reason, 'blocked');
  assert.equal(r.costDelta, 0);
});

test('12F-2: included stationary → no cost delta, surfaced as a note line only', () => {
  const r = decideOvernightStationaryLiveApply(shadow([], [stIncluded(2)]));
  assert.equal(r.apply, false);
  assert.equal(r.reason, 'no-charges');
  assert.equal(r.costDelta, 0);
  const line = r.lines.find((l) => l.kind === 'stationary' && l.dayNumber === 2);
  assert.equal(line?.outcome, 'included', 'included stationary is a note line, not a charge');
});

test('12F-2: out-of-base overnight APPLIES cost delta only (sellDelta 0)', () => {
  const r = decideOvernightStationaryLiveApply(shadow([ovSeparate(1, 45)], []));
  assert.equal(r.apply, true);
  assert.equal(r.reason, 'applied');
  assert.equal(r.costDelta, 45);
  assert.equal(r.sellDelta, 0, 'supplier-cost only — no client sell change');
});

test('12F-2: stationary full day APPLIES cost delta only', () => {
  const r = decideOvernightStationaryLiveApply(shadow([], [stSeparate(2, 60)]));
  assert.equal(r.apply, true);
  assert.equal(r.costDelta, 60);
  assert.equal(r.sellDelta, 0);
});

test('12F-2: combined overnight + stationary → exact summed cost delta, sellDelta 0', () => {
  const r = decideOvernightStationaryLiveApply(shadow([ovSeparate(1, 45)], [stSeparate(2, 60)]));
  assert.equal(r.apply, true);
  assert.equal(r.costDelta, 105);
  assert.equal(r.sellDelta, 0);
  assert.equal(r.lines.length, 2, 'per-day breakdown preserved');
});

test('12F-2: capacity-unit overnight remains deferred (warning carried, never a charge line)', () => {
  const r = decideOvernightStationaryLiveApply(shadow([ovSeparate(1, 45)], []));
  assert.ok(r.warnings.includes('capacity-unit-overnight-not-evaluated-in-12c2'), 'deferral warning carried');
  assert.ok(!r.lines.some((l) => /capacity/i.test(l.outcome)), 'no capacity-unit charge line');
});

test('12F-2: ANY blocker aborts the WHOLE apply (valid charges not applied either)', () => {
  const r = decideOvernightStationaryLiveApply(shadow([ovSeparate(1, 45), ovBlocked(3, 'base-city-missing')], [stSeparate(2, 60)]));
  assert.equal(r.apply, false);
  assert.equal(r.reason, 'blocked');
  assert.ok(r.blockers.includes('base-city-missing'));
  assert.equal(r.costDelta, 0, 'no partial application — the valid 105 is NOT applied when any blocker exists');
});

test('12F-2: invariant — sellDelta is ALWAYS 0; apply true ONLY when valid + no blocker + charges', () => {
  const cases: Array<[any, boolean]> = [
    [decideOvernightStationaryLiveApply(null), false],
    [decideOvernightStationaryLiveApply(shadow([], [])), false],
    [decideOvernightStationaryLiveApply(shadow([ovSeparate(1, 45)], [stSeparate(2, 60)])), true],
    [decideOvernightStationaryLiveApply(shadow([ovBlocked(1, 'overnight-rate-missing')], [])), false],
    [decideOvernightStationaryLiveApply(shadow([], [stIncluded(2)])), false],
  ];
  for (const [r, expectApply] of cases) {
    assert.equal(r.sellDelta, 0, 'sellDelta always 0 in 12F-2');
    assert.equal(r.apply, expectApply);
    if (!expectApply) assert.equal(r.costDelta, 0, 'no cost delta when not applied');
  }
});

// ---- service wrapper — flag gate + no DB writes ----------------------------------------------
function fakeDay(dayNumber: number, opts: any = {}) {
  return {
    dayNumber, transportDayType: opts.transportDayType ?? null, vehicleRetained: opts.vehicleRetained ?? null,
    vehicleReleased: null, inRetainedBlock: opts.inRetainedBlock ?? null, overnightCity: opts.overnightCity ?? null,
    vehicleReturnsToBase: opts.vehicleReturnsToBase ?? null,
    dayItems: [{ quoteService: { transportServiceTypeId: 'st1', touringRouteId: null, vehicleId: 'V1', finalCost: null, totalCost: 100, overrideCost: null, useOverride: false, appliedVehicleRate: { supplierId: 'S1', vehicle: { id: 'V1', name: 'Sedan', vehicleClass: 'Sedan', resolvedSupplierId: 'S1' }, serviceType: { code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER' } }, touringRoutePricing: null } }],
  };
}
const CONTRACT = { id: 'C1', supplierId: 'S1', vehicleClass: 'Sedan', currency: 'JOD', regime: 'PACKAGE_MIN_FULL_DAY', active: true, minimumFullDays: 3, minimumDayPolicy: 'INELIGIBLE_UNDER_MIN', halfDayCountsTowardMin: false, halfDayChargedAsFullDay: false, stationaryCountsTowardMinDays: false, airportTransferIncluded: false, fullDayRate: 100, halfDayRate: 50, baseCityOverride: null, driverOvernightPolicy: 'SEPARATE', driverOvernightAmount: null, driverOvernightOnStationary: true, stationaryChargedSeparately: true, stationaryIncludedInPackage: false };

let writeAttempts = 0;
function fp(days: any[], addOnRows: any[] = []) {
  const throwWrite = () => { writeAttempts++; throw new Error('write attempted in 12F-2 apply path (must be read-only)'); };
  return {
    quoteItineraryDay: { findMany: async () => days, create: throwWrite, update: throwWrite, updateMany: throwWrite, delete: throwWrite },
    transportContract: { findFirst: async () => CONTRACT },
    supplier: { findUnique: async () => ({ transportDiscountPercent: 25, baseCity: 'Amman' }) },
    quote: { findUnique: async () => ({ quoteCurrency: 'JOD', adults: 2, children: 0, excursionPackageRate: false, travelStartDate: null }) },
    vehicleRate: { findMany: async () => addOnRows },
    $transaction: throwWrite, update: throwWrite, create: throwWrite, delete: throwWrite,
  } as any;
}

test('12F-2 service: flag OFF → flag-disabled no-op (no shadow fetch, zero delta)', async () => {
  setEnv(LIVE_FLAG, false);
  const svc = new PackageEligibilityShadowService(fp([fakeDay(1)]));
  const r = await svc.computeQuoteOvernightStationaryLiveApply('throwaway-q');
  assert.equal(r.apply, false);
  assert.equal(r.reason, 'flag-disabled');
  assert.equal(r.costDelta, 0);
  assert.equal(r.sellDelta, 0);
});

test('12F-2 service: flag ON → applies summed cost delta, sellDelta 0, no DB writes', async () => {
  writeAttempts = 0;
  setEnv(LIVE_FLAG, true);
  setEnv(SHADOW_FLAG, true);
  const days = [
    fakeDay(1, { vehicleRetained: true, inRetainedBlock: true, overnightCity: 'Petra', vehicleReturnsToBase: false }),
    fakeDay(2, { transportDayType: 'STATIONARY_FULL_DAY', vehicleReturnsToBase: true }),
    fakeDay(3, { vehicleRetained: true, inRetainedBlock: true, vehicleReturnsToBase: true }),
    fakeDay(4, { vehicleRetained: true, inRetainedBlock: true, vehicleReturnsToBase: true }),
  ];
  const addOns = [
    { price: 45, currency: 'JOD', maxPax: 7, vehicleId: 'V1', routeName: null, serviceType: { name: 'Petra Overnight' } },
    { price: 60, currency: 'JOD', maxPax: 7, vehicleId: 'V1', routeName: null, serviceType: { name: 'Stationary Full Day' } },
  ];
  const svc = new PackageEligibilityShadowService(fp(days, addOns));
  const r = await svc.computeQuoteOvernightStationaryLiveApply('throwaway-q');
  setEnv(LIVE_FLAG, false);
  setEnv(SHADOW_FLAG, false);
  assert.equal(r.apply, true);
  assert.equal(r.reason, 'applied');
  assert.equal(r.costDelta, 105, '45 overnight + 60 stationary');
  assert.equal(r.sellDelta, 0);
  assert.equal(writeAttempts, 0, 'no DB writes');
});
