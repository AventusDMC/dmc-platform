import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  computeOvernightStationaryShadow,
  type OvernightStationaryInput,
  type OvernightStationaryDayInput,
  type OvernightStationaryContractInput,
} from './overnight-stationary-shadow';

// PR 12C-1 — pure overnight/stationary shadow helper. No DB, no writes, notApplied always true.

function input(over: Partial<OvernightStationaryInput> = {}): OvernightStationaryInput {
  return {
    supplierBaseCity: 'Amman',
    contract: { driverOvernightPolicy: 'SEPARATE' },
    quoteCurrency: 'JOD',
    days: [],
    ...over,
  };
}

function overnightDay(over: Partial<OvernightStationaryDayInput> = {}): OvernightStationaryDayInput {
  return {
    dayNumber: 1,
    operationalType: 'POINT_TO_POINT',
    vehicleRetained: true,
    inRetainedBlock: true,
    overnightCity: 'Petra',
    vehicleReturnsToBase: false,
    ...over,
  };
}

function stationaryDay(over: Partial<OvernightStationaryDayInput> = {}): OvernightStationaryDayInput {
  return {
    dayNumber: 1,
    operationalType: 'STATIONARY_FULL_DAY',
    vehicleReturnsToBase: true, // suppress the overnight branch so stationary is isolated
    ...over,
  };
}

const ov = (r: ReturnType<typeof computeOvernightStationaryShadow>) => r.overnightCharges[0];
const st = (r: ReturnType<typeof computeOvernightStationaryShadow>) => r.stationaryCharges[0];

test('base city missing → overnight blocked', () => {
  const r = computeOvernightStationaryShadow(input({ supplierBaseCity: null, contract: { driverOvernightPolicy: 'SEPARATE' }, days: [overnightDay()] }));
  assert.equal(ov(r).outcome, 'blocked');
  assert.equal(ov(r).blocker, 'base-city-missing');
  assert.ok(r.blockers.includes('base-city-missing'));
});

test('overnight city missing on out-of-base candidate → blocked', () => {
  const r = computeOvernightStationaryShadow(input({ days: [overnightDay({ overnightCity: '   ' })] }));
  assert.equal(ov(r).outcome, 'blocked');
  assert.equal(ov(r).blocker, 'overnight-city-missing');
});

test('vehicle returns to base → no overnight charge', () => {
  const r = computeOvernightStationaryShadow(input({ days: [overnightDay({ vehicleReturnsToBase: true })] }));
  assert.equal(ov(r).outcome, 'no-charge');
  assert.equal(ov(r).reason, 'returns-to-base');
  assert.equal(r.totalOvernightShadow, 0);
});

test('overnight in base city → no charge (normalized match)', () => {
  const r = computeOvernightStationaryShadow(input({ supplierBaseCity: 'Amman', days: [overnightDay({ overnightCity: '  amman ' })] }));
  assert.equal(ov(r).outcome, 'no-charge');
  assert.equal(ov(r).reason, 'overnight-in-base-city');
});

test('contract baseCityOverride wins over supplier baseCity', () => {
  const contract: OvernightStationaryContractInput = { driverOvernightPolicy: 'SEPARATE', baseCityOverride: 'Petra' };
  const r = computeOvernightStationaryShadow(input({ supplierBaseCity: 'Amman', contract, days: [overnightDay({ overnightCity: 'Petra' })] }));
  assert.equal(r.baseCityResolution.effectiveBaseCity, 'Petra');
  assert.equal(ov(r).outcome, 'no-charge'); // overnight == effective base
});

test('out-of-base + SEPARATE + city ADD_ON rate → charge', () => {
  const r = computeOvernightStationaryShadow(input({
    days: [overnightDay({ overnightRateCandidates: [{ source: 'city-addon-rate', name: 'Petra Overnight', amount: 45, currency: 'JOD' }] })],
  }));
  assert.equal(ov(r).outcome, 'separate');
  assert.equal(ov(r).rateSource, 'city-addon-rate');
  assert.equal(ov(r).amount, 45);
  assert.equal(r.totalOvernightShadow, 45);
});

test('city rate must text-match the overnight city (wrong city → falls through to block)', () => {
  const r = computeOvernightStationaryShadow(input({
    days: [overnightDay({ overnightCity: 'Wadi Rum', overnightRateCandidates: [{ source: 'city-addon-rate', name: 'Petra Overnight', amount: 45, currency: 'JOD' }] })],
  }));
  assert.equal(ov(r).outcome, 'blocked');
  assert.equal(ov(r).blocker, 'overnight-rate-missing');
});

test('contract flat amount fallback when no city rate', () => {
  const r = computeOvernightStationaryShadow(input({
    contract: { driverOvernightPolicy: 'SEPARATE', driverOvernightAmount: 40, currency: 'JOD' },
    days: [overnightDay()],
  }));
  assert.equal(ov(r).outcome, 'separate');
  assert.equal(ov(r).rateSource, 'contract-flat');
  assert.equal(ov(r).amount, 40);
});

test('supplier/class generic ADD_ON fallback', () => {
  const r = computeOvernightStationaryShadow(input({
    days: [overnightDay({ overnightRateCandidates: [{ source: 'supplier-class-addon', name: 'Driver Overnight', amount: 35, currency: 'JOD' }] })],
  }));
  assert.equal(ov(r).rateSource, 'supplier-class-addon');
  assert.equal(ov(r).amount, 35);
});

test('capacity-unit fallback only when day is genuinely capacity-unit', () => {
  const cand = { source: 'capacity-unit-addon' as const, name: 'Overnight', amount: 20, currency: 'JOD', unitCapacity: 8 };
  const notCap = computeOvernightStationaryShadow(input({ days: [overnightDay({ isCapacityUnitDay: false, pax: 16, overnightRateCandidates: [cand] })] }));
  assert.equal(ov(notCap).blocker, 'overnight-rate-missing'); // capacity path not taken
  const cap = computeOvernightStationaryShadow(input({ days: [overnightDay({ isCapacityUnitDay: true, pax: 16, overnightRateCandidates: [cand] })] }));
  assert.equal(ov(cap).rateSource, 'capacity-unit-addon');
  assert.equal(ov(cap).amount, 40); // ceil(16/8)=2 × 20
});

test('INCLUDED policy → no separate charge', () => {
  const r = computeOvernightStationaryShadow(input({ contract: { driverOvernightPolicy: 'INCLUDED' }, days: [overnightDay()] }));
  assert.equal(ov(r).outcome, 'included');
  assert.equal(r.totalOvernightShadow, 0);
});

test('WAIVED policy → no charge', () => {
  const r = computeOvernightStationaryShadow(input({ contract: { driverOvernightPolicy: 'WAIVED' }, days: [overnightDay()] }));
  assert.equal(ov(r).outcome, 'waived');
});

test('missing rate (SEPARATE, no candidates, no flat) → blocked', () => {
  const r = computeOvernightStationaryShadow(input({ days: [overnightDay()] }));
  assert.equal(ov(r).outcome, 'blocked');
  assert.equal(ov(r).blocker, 'overnight-rate-missing');
});

test('ambiguous rate (two distinct city prices) → blocked', () => {
  const r = computeOvernightStationaryShadow(input({
    days: [overnightDay({ overnightRateCandidates: [
      { source: 'city-addon-rate', name: 'Petra Overnight', amount: 45, currency: 'JOD' },
      { source: 'city-addon-rate', name: 'Petra Overnight VIP', amount: 60, currency: 'JOD' },
    ] })],
  }));
  assert.equal(ov(r).blocker, 'overnight-rate-ambiguous');
});

test('cross-currency resolved rate → blocked', () => {
  const r = computeOvernightStationaryShadow(input({
    quoteCurrency: 'JOD',
    days: [overnightDay({ overnightRateCandidates: [{ source: 'city-addon-rate', name: 'Petra Overnight', amount: 45, currency: 'USD' }] })],
  }));
  assert.equal(ov(r).blocker, 'overnight-cross-currency');
});

test('driverOvernightOnStationary=false suppresses overnight on a stationary day', () => {
  const r = computeOvernightStationaryShadow(input({
    contract: { driverOvernightPolicy: 'SEPARATE', driverOvernightOnStationary: false, stationaryIncludedInPackage: true },
    days: [overnightDay({ operationalType: 'STATIONARY_FULL_DAY', overnightCity: 'Petra' })],
  }));
  assert.equal(ov(r).outcome, 'no-charge');
  assert.equal(ov(r).reason, 'overnight-on-stationary-disabled');
});

test('stationary released/free vehicle → no charge', () => {
  const r = computeOvernightStationaryShadow(input({ days: [stationaryDay({ vehicleReleased: true })] }));
  assert.equal(st(r).outcome, 'no-charge');
  assert.equal(st(r).reason, 'no-vehicle');
});

test('stationary full day included in package → no separate charge', () => {
  const r = computeOvernightStationaryShadow(input({ contract: { stationaryIncludedInPackage: true }, days: [stationaryDay()] }));
  assert.equal(st(r).outcome, 'included');
  assert.equal(r.totalStationaryShadow, 0);
});

test('stationary full day separate + rate → charge', () => {
  const r = computeOvernightStationaryShadow(input({
    days: [stationaryDay({ stationaryRateCandidates: [{ source: 'supplier-class-addon', name: 'Stationary Full Day', amount: 60, currency: 'JOD' }] })],
  }));
  assert.equal(st(r).outcome, 'separate');
  assert.equal(st(r).amount, 60);
  assert.equal(st(r).reason, 'stationary');
  assert.equal(r.totalStationaryShadow, 60);
});

test('stationary half day uses half rate; only full present → undeterminable block', () => {
  const half = computeOvernightStationaryShadow(input({
    days: [stationaryDay({ operationalType: 'STATIONARY_HALF_DAY', stationaryRateCandidates: [{ source: 'supplier-class-addon', name: 'Stationary Half Day', amount: 30, currency: 'JOD', halfDay: true }] })],
  }));
  assert.equal(st(half).outcome, 'separate');
  assert.equal(st(half).amount, 30);
  const onlyFull = computeOvernightStationaryShadow(input({
    days: [stationaryDay({ operationalType: 'STATIONARY_HALF_DAY', stationaryRateCandidates: [{ source: 'supplier-class-addon', name: 'Stationary Full Day', amount: 60, currency: 'JOD' }] })],
  }));
  assert.equal(st(onlyFull).blocker, 'stationary-half-day-undeterminable');
});

test('standby/waiting day → charge tagged standby', () => {
  const r = computeOvernightStationaryShadow(input({
    days: [stationaryDay({ operationalType: 'STANDBY_WAITING', stationaryRateCandidates: [{ source: 'supplier-class-addon', name: 'Standby', amount: 25, currency: 'JOD' }] })],
  }));
  assert.equal(st(r).type, 'STANDBY_WAITING');
  assert.equal(st(r).outcome, 'separate');
  assert.equal(st(r).reason, 'standby');
});

test('stationary missing rate → blocked', () => {
  const r = computeOvernightStationaryShadow(input({ days: [stationaryDay()] }));
  assert.equal(st(r).blocker, 'stationary-rate-missing');
});

test('stationaryCountsTowardMinDays is diagnostic only (annotates weight, no eligibility change)', () => {
  const r = computeOvernightStationaryShadow(input({
    contract: { stationaryCountsTowardMinDays: true, stationaryIncludedInPackage: true },
    days: [stationaryDay({ packageDayWeight: 1 })],
  }));
  assert.equal(st(r).countsTowardMin, true);
  assert.equal(st(r).packageDayWeightImpact, 1);
  assert.equal(st(r).outcome, 'included'); // annotation does not create a charge
});

test('no double-count: stationary day also counted as package full-day → no separate charge', () => {
  const r = computeOvernightStationaryShadow(input({
    days: [stationaryDay({ countedAsPackageFullDay: true, stationaryRateCandidates: [{ source: 'supplier-class-addon', name: 'Stationary Full Day', amount: 60, currency: 'JOD' }] })],
  }));
  assert.equal(st(r).outcome, 'no-charge');
  assert.equal(st(r).reason, 'covered-by-package-full-day');
  assert.ok(r.warnings.includes('stationary-overlaps-package-day'));
});

test('existing ADD_ON line on day → overnight blocked + addon-overnight-present warning', () => {
  const r = computeOvernightStationaryShadow(input({ days: [overnightDay({ hasExistingAddOn: true })] }));
  assert.equal(ov(r).blocker, 'existing-addon-on-day');
  assert.ok(r.warnings.includes('addon-overnight-present'));
});

test('possible folded overnight → advisory warning', () => {
  const r = computeOvernightStationaryShadow(input({ days: [overnightDay({ possibleFoldedOvernight: true, overnightRateCandidates: [{ source: 'city-addon-rate', name: 'Petra Overnight', amount: 45, currency: 'JOD' }] })] }));
  assert.ok(r.warnings.includes('possible-folded-overnight'));
});

test('excursionPackageRate → quote-level overlap blocker', () => {
  const r = computeOvernightStationaryShadow(input({ excursionPackageRate: true, days: [overnightDay({ vehicleReturnsToBase: true })] }));
  assert.ok(r.blockers.includes('excursion-package-rate-overlap'));
});

test('result is always notApplied:true and totals sum only separate amounts', () => {
  const r = computeOvernightStationaryShadow(input({
    days: [
      overnightDay({ dayNumber: 1, overnightRateCandidates: [{ source: 'city-addon-rate', name: 'Petra Overnight', amount: 45, currency: 'JOD' }] }),
      overnightDay({ dayNumber: 2, vehicleReturnsToBase: true }), // no-charge
      stationaryDay({ dayNumber: 3, stationaryRateCandidates: [{ source: 'supplier-class-addon', name: 'Stationary Full Day', amount: 60, currency: 'JOD' }] }),
    ],
  }));
  assert.equal(r.notApplied, true);
  assert.equal(r.totalOvernightShadow, 45);
  assert.equal(r.totalStationaryShadow, 60);
});

test('helper performs no writes (input object is not mutated)', () => {
  const inp = input({ days: [overnightDay({ overnightRateCandidates: [{ source: 'city-addon-rate', name: 'Petra Overnight', amount: 45, currency: 'JOD' }] }), stationaryDay({ dayNumber: 2 })] });
  const before = JSON.stringify(inp);
  computeOvernightStationaryShadow(inp);
  assert.equal(JSON.stringify(inp), before);
});

test('empty quote → empty diagnostics, notApplied true', () => {
  const r = computeOvernightStationaryShadow(input({ days: [] }));
  assert.deepEqual(r.overnightCharges, []);
  assert.deepEqual(r.stationaryCharges, []);
  assert.equal(r.totalOvernightShadow, 0);
  assert.equal(r.totalStationaryShadow, 0);
  assert.equal(r.notApplied, true);
});
