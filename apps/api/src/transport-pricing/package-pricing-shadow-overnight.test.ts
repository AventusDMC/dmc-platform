import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { PackageEligibilityShadowService } from './package-eligibility-shadow.service';

// PR 12C-2 — additive overnight/stationary diagnostic on the package-pricing-shadow response.
// Read-only; must not change any existing total/field. Fake prisma exposes ONLY read methods (any
// write would throw). Same harness style as package-eligibility-shadow.service.test.ts.

const PRICE_FLAG = 'TRANSPORT_PACKAGE_PRICING_SHADOW_COMPARE';
function setFlag(on: boolean) {
  if (on) process.env[PRICE_FLAG] = 'true';
  else delete process.env[PRICE_FLAG];
}

function txItem(opts: { classification?: string; code?: string; totalCost?: number } = {}) {
  return {
    transportServiceTypeId: 'st1', touringRouteId: null, vehicleId: 'V1',
    finalCost: null, totalCost: opts.totalCost ?? 0, overrideCost: null, useOverride: false,
    appliedVehicleRate: {
      supplierId: 'S1',
      vehicle: { id: 'V1', name: 'Sedan', vehicleClass: 'Sedan', resolvedSupplierId: 'S1' },
      serviceType: { code: opts.code ?? 'POINT_TO_POINT', classification: opts.classification ?? 'ROUTE_TRANSFER' },
    },
    touringRoutePricing: null,
  };
}

function dayRow(dayNumber: number, opts: any = {}) {
  return {
    dayNumber,
    transportDayType: opts.transportDayType ?? null,
    vehicleRetained: opts.vehicleRetained ?? null,
    vehicleReleased: opts.vehicleReleased ?? null,
    inRetainedBlock: opts.inRetainedBlock ?? null,
    overnightCity: opts.overnightCity ?? null,
    vehicleReturnsToBase: opts.vehicleReturnsToBase ?? null,
    dayItems: (opts.items ?? [txItem({ totalCost: opts.totalCost })]).map((it: any) => ({ quoteService: it })),
  };
}

const CONTRACT = {
  id: 'C1', supplierId: 'S1', vehicleClass: 'Sedan', currency: 'JOD', regime: 'PACKAGE_MIN_FULL_DAY', active: true,
  minimumFullDays: 3, minimumDayPolicy: 'INELIGIBLE_UNDER_MIN',
  halfDayCountsTowardMin: false, halfDayChargedAsFullDay: false, stationaryCountsTowardMinDays: false, airportTransferIncluded: false,
  fullDayRate: 100, halfDayRate: 50,
  baseCityOverride: null, driverOvernightPolicy: 'SEPARATE', driverOvernightAmount: null,
  driverOvernightOnStationary: true, stationaryChargedSeparately: true, stationaryIncludedInPackage: false,
};

const PETRA_OVERNIGHT = { price: 45, currency: 'JOD', maxPax: 7, vehicleId: 'V1', routeName: null, serviceType: { name: 'Petra Overnight' } };
const STATIONARY_FULL = { price: 60, currency: 'JOD', maxPax: 7, vehicleId: 'V1', routeName: null, serviceType: { name: 'Stationary Full Day' } };

function fp(opts: any = {}) {
  const throwWrite = () => { throw new Error('write attempted in read-only shadow path'); };
  return {
    quoteItineraryDay: { findMany: async () => opts.days ?? [], create: throwWrite, update: throwWrite, updateMany: throwWrite, delete: throwWrite },
    transportContract: { findFirst: async () => opts.contract ?? CONTRACT },
    supplier: { findUnique: async () => ({ transportDiscountPercent: 25, baseCity: opts.supplierBaseCity === undefined ? 'Amman' : opts.supplierBaseCity }) },
    quote: { findUnique: async () => ({ quoteCurrency: opts.quoteCurrency ?? 'JOD', adults: 2, children: 0, excursionPackageRate: opts.excursion ?? false, travelStartDate: null }) },
    vehicleRate: { findMany: async () => opts.addOnRows ?? [] },
    $transaction: throwWrite,
  } as any;
}

const RETAINED = { vehicleRetained: true, inRetainedBlock: true };
function retainedOvernightDays(over: any = {}) {
  // 3 retained P2P days; day 1 carries the overnight metadata under test.
  return [
    dayRow(1, { ...RETAINED, overnightCity: over.overnightCity, vehicleReturnsToBase: over.vehicleReturnsToBase, totalCost: 100, items: over.items }),
    dayRow(2, { ...RETAINED, vehicleReturnsToBase: true, totalCost: 100 }),
    dayRow(3, { ...RETAINED, vehicleReturnsToBase: true, totalCost: 100 }),
  ];
}

test.afterEach?.(() => setFlag(false));

test('PR12C-2: response includes overnightStationaryShadow with notApplied:true', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(fp({ days: retainedOvernightDays({ overnightCity: 'Petra' }), addOnRows: [PETRA_OVERNIGHT] }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  assert.ok(r.overnightStationaryShadow, 'block present');
  assert.equal(r.overnightStationaryShadow.notApplied, true);
});

test('PR12C-2: out-of-base + SEPARATE + city ADD_ON rate → diagnostic overnight charge', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(fp({ days: retainedOvernightDays({ overnightCity: 'Petra' }), addOnRows: [PETRA_OVERNIGHT] }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  const charge = r.overnightStationaryShadow.overnightCharges.find((c: any) => c.dayNumber === 1);
  assert.equal(charge.outcome, 'separate');
  assert.equal(charge.rateSource, 'city-addon-rate');
  assert.equal(charge.amount, 45);
  assert.equal(r.overnightStationaryShadow.totalOvernightShadow, 45);
});

test('PR12C-2: missing base city → diagnostic blocker', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(fp({ days: retainedOvernightDays({ overnightCity: 'Petra' }), addOnRows: [PETRA_OVERNIGHT], supplierBaseCity: null }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  const charge = r.overnightStationaryShadow.overnightCharges.find((c: any) => c.dayNumber === 1);
  assert.equal(charge.blocker, 'base-city-missing');
  assert.ok(r.overnightStationaryShadow.blockers.includes('base-city-missing'));
});

test('PR12C-2: missing overnight city → diagnostic blocker', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(fp({ days: retainedOvernightDays({ overnightCity: null }), addOnRows: [PETRA_OVERNIGHT] }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  const charge = r.overnightStationaryShadow.overnightCharges.find((c: any) => c.dayNumber === 1);
  assert.equal(charge.blocker, 'overnight-city-missing');
});

test('PR12C-2: vehicleReturnsToBase=true → no-charge diagnostic', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(fp({ days: retainedOvernightDays({ overnightCity: 'Petra', vehicleReturnsToBase: true }), addOnRows: [PETRA_OVERNIGHT] }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  const charge = r.overnightStationaryShadow.overnightCharges.find((c: any) => c.dayNumber === 1);
  assert.equal(charge.outcome, 'no-charge');
  assert.equal(charge.reason, 'returns-to-base');
});

test('PR12C-2: stationary full-day + separate + rate → diagnostic stationary charge', async () => {
  setFlag(true);
  const days = [
    dayRow(1, { transportDayType: 'STATIONARY_FULL_DAY', vehicleReturnsToBase: true, totalCost: 100 }),
    dayRow(2, { ...RETAINED, vehicleReturnsToBase: true, totalCost: 100 }),
    dayRow(3, { ...RETAINED, vehicleReturnsToBase: true, totalCost: 100 }),
  ];
  const svc = new PackageEligibilityShadowService(fp({ days, addOnRows: [STATIONARY_FULL] }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  const charge = r.overnightStationaryShadow.stationaryCharges.find((c: any) => c.dayNumber === 1);
  assert.equal(charge.type, 'STATIONARY_FULL_DAY');
  assert.equal(charge.outcome, 'separate');
  assert.equal(charge.amount, 60);
  assert.equal(r.overnightStationaryShadow.totalStationaryShadow, 60);
});

test('PR12C-2: stationary included in package → included, no separate charge', async () => {
  setFlag(true);
  const contract = { ...CONTRACT, stationaryIncludedInPackage: true };
  const days = [dayRow(1, { transportDayType: 'STATIONARY_FULL_DAY', vehicleReturnsToBase: true, totalCost: 100 })];
  const svc = new PackageEligibilityShadowService(fp({ days, contract, addOnRows: [STATIONARY_FULL] }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  const charge = r.overnightStationaryShadow.stationaryCharges.find((c: any) => c.dayNumber === 1);
  assert.equal(charge.outcome, 'included');
  assert.equal(r.overnightStationaryShadow.totalStationaryShadow, 0);
});

test('PR12C-2: existing ADD_ON line on day → overnight blocked + warning', async () => {
  setFlag(true);
  const days = retainedOvernightDays({ overnightCity: 'Petra', items: [txItem({ classification: 'ADD_ON', code: 'PETRA_OVERNIGHT' })] });
  const svc = new PackageEligibilityShadowService(fp({ days, addOnRows: [PETRA_OVERNIGHT] }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  const charge = r.overnightStationaryShadow.overnightCharges.find((c: any) => c.dayNumber === 1);
  assert.equal(charge.blocker, 'existing-addon-on-day');
  assert.ok(r.overnightStationaryShadow.warnings.includes('addon-overnight-present'));
});

test('PR12C-2: existing comparison totals are IDENTICAL with vs without overnight data (additive only)', async () => {
  setFlag(true);
  const withOvernight: any = await new PackageEligibilityShadowService(
    fp({ days: retainedOvernightDays({ overnightCity: 'Petra' }), addOnRows: [PETRA_OVERNIGHT] }),
  ).evaluateQuotePackagePricingShadow('q1');
  const withoutOvernight: any = await new PackageEligibilityShadowService(
    fp({ days: retainedOvernightDays({ overnightCity: null }), addOnRows: [] }),
  ).evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  for (const k of ['currentTransportTotal', 'packageGrossTotal', 'packageNetTotal', 'packageCandidateTotal', 'difference', 'packageEligible', 'countedFullPackageDays', 'fullDayCount', 'halfDayCount']) {
    assert.deepEqual(withOvernight[k], withoutOvernight[k], `existing field changed: ${k}`);
  }
  // The overnight total is NOT folded into the package comparison.
  assert.equal(withOvernight.overnightStationaryShadow.totalOvernightShadow, 45);
  assert.notEqual(withOvernight.packageNetTotal, null);
});

test('PR12C-2: removing overnightStationaryShadow leaves a backward-compatible response', async () => {
  setFlag(true);
  const svc = new PackageEligibilityShadowService(fp({ days: retainedOvernightDays({ overnightCity: 'Petra' }), addOnRows: [PETRA_OVERNIGHT] }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  delete r.overnightStationaryShadow;
  for (const k of ['quoteId', 'currentTransportTotal', 'packageNetTotal', 'difference', 'packageEligible', 'allowlist', 'notApplied']) {
    assert.ok(k in r, `pre-existing key missing after removal: ${k}`);
  }
  assert.equal(r.notApplied, true);
});

test('PR12C-2: shadow path performs no DB writes (read-only fake throws on any write)', async () => {
  setFlag(true);
  // fp() wires create/update/delete/$transaction to throw; a successful run proves no writes.
  const svc = new PackageEligibilityShadowService(fp({ days: retainedOvernightDays({ overnightCity: 'Petra' }), addOnRows: [PETRA_OVERNIGHT] }));
  const r: any = await svc.evaluateQuotePackagePricingShadow('q1');
  setFlag(false);
  assert.ok(r.overnightStationaryShadow);
});

test('PR12C-2: helper is not imported/called by live apply or quotes.service.ts', () => {
  const shadowSrc = readFileSync(path.join(__dirname, 'package-eligibility-shadow.service.ts'), 'utf8');
  // The live-apply method (defined after the diagnostic) must not reference the helper.
  const liveApplyIdx = shadowSrc.indexOf('async computeQuotePackageLiveApply');
  assert.ok(liveApplyIdx > 0, 'computeQuotePackageLiveApply present');
  const liveApplyOnwards = shadowSrc.slice(liveApplyIdx);
  assert.ok(!/OvernightStationary/i.test(liveApplyOnwards), 'live apply must not reference the overnight helper');
  // quotes.service.ts must not import or call the helper.
  const quotesSrc = readFileSync(path.join(__dirname, '..', 'quotes', 'quotes.service.ts'), 'utf8');
  assert.ok(!quotesSrc.includes('overnight-stationary-shadow'), 'quotes.service.ts must not import the helper');
  assert.ok(!quotesSrc.includes('computeOvernightStationaryShadow'), 'quotes.service.ts must not call the helper');
});
