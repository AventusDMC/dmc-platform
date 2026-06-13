import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  classifyTransportDay,
  classifyItinerary,
  resolveRetention,
} from './transport-day-classification';

// PR3 — transport day-classification (shadow mode). Classify-only; no pricing.

test('direct airport transfer → weight 0, separate-transfer', () => {
  const c = classifyTransportDay({ operationalType: 'AIRPORT_TRANSFER' });
  assert.equal(c.packageDayWeight, 0);
  assert.equal(c.countsTowardMinimum, false);
  assert.equal(c.billedAs, 'separate-transfer');
});

test('airport transfer included by contract → weight 1, full-day', () => {
  const c = classifyTransportDay({ operationalType: 'AIRPORT_TRANSFER' }, { airportTransferIncluded: true });
  assert.equal(c.packageDayWeight, 1);
  assert.equal(c.countsAsFullPackageDay, true);
  assert.equal(c.billedAs, 'full-day');
});

test('direct point-to-point with vehicle released → weight 0', () => {
  const c = classifyTransportDay({ operationalType: 'POINT_TO_POINT', vehicleRetained: false, retentionReason: 'released' });
  assert.equal(c.packageDayWeight, 0);
  assert.equal(c.billedAs, 'separate-transfer');
  assert.equal(c.vehicleRetained, false);
});

test('point-to-point retained → weight 1, full-day', () => {
  const c = classifyTransportDay({ operationalType: 'POINT_TO_POINT', vehicleRetained: true, retentionReason: 'explicit-retained' });
  assert.equal(c.packageDayWeight, 1);
  assert.equal(c.countsAsFullPackageDay, true);
  assert.equal(c.billedAs, 'full-day');
});

test('touring day → weight 1, full-day', () => {
  const c = classifyTransportDay({ operationalType: 'TOURING_ROUTE' });
  assert.equal(c.packageDayWeight, 1);
  assert.equal(c.billedAs, 'full-day');
});

test('half-day default → weight 0 (does not count by default)', () => {
  const c = classifyTransportDay({ operationalType: 'HALF_DAY_SERVICE' });
  assert.equal(c.packageDayWeight, 0);
  assert.equal(c.countsTowardMinimum, false);
  assert.equal(c.billedAs, 'half-day');
});

test('half-day with contract halfDayCountsTowardMin → weight 0.5', () => {
  const c = classifyTransportDay({ operationalType: 'HALF_DAY_SERVICE' }, { halfDayCountsTowardMin: true });
  assert.equal(c.packageDayWeight, 0.5);
  assert.equal(c.countsTowardMinimum, true);
  assert.equal(c.countsAsFullPackageDay, false);
  assert.equal(c.billedAs, 'half-day');
});

test('half-day charged as full day → weight 1', () => {
  const c = classifyTransportDay({ operationalType: 'HALF_DAY_SERVICE' }, { halfDayChargedAsFullDay: true });
  assert.equal(c.packageDayWeight, 1);
  assert.equal(c.billedAs, 'full-day');
});

test('stationary full day → charged, counts only when contract allows', () => {
  const off = classifyTransportDay({ operationalType: 'STATIONARY_FULL_DAY' });
  assert.equal(off.packageDayWeight, 0);
  assert.equal(off.billedAs, 'stationary');
  const on = classifyTransportDay({ operationalType: 'STATIONARY_FULL_DAY' }, { stationaryCountsTowardMinDays: true });
  assert.equal(on.packageDayWeight, 1);
  assert.equal(on.billedAs, 'stationary');
});

test('free day with vehicle released → weight 0, free', () => {
  const c = classifyTransportDay({ operationalType: 'FREE_DAY_NO_VEHICLE' });
  assert.equal(c.packageDayWeight, 0);
  assert.equal(c.billedAs, 'free');
});

test('airport + sightseeing reclassified upstream as TOURING/FULL_DAY → counts', () => {
  const touring = classifyTransportDay({ operationalType: 'TOURING_ROUTE' });
  assert.equal(touring.packageDayWeight, 1);
  const fullDay = classifyTransportDay({ operationalType: 'FULL_DAY_SERVICE' });
  assert.equal(fullDay.packageDayWeight, 1);
});

// ---- retention resolution (the locked correction: adjacency alone never counts) ----

test('3-day retained block (explicit retained) → 3 counted full days', () => {
  const days = [
    { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', retained: true },
    { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', retained: true },
    { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', retained: true },
  ] as const;
  const r = classifyItinerary(days as any);
  assert.equal(r.countedFullPackageDays, 3);
  assert.ok(r.days.every((d) => d.packageDayWeight === 1 && d.retentionReason === 'explicit-retained'));
});

test('lone released drop-off → 0; retention reason released', () => {
  const r = classifyItinerary([{ operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', vehicleReleased: true }] as any);
  assert.equal(r.countedFullPackageDays, 0);
  assert.equal(r.days[0].retentionReason, 'released');
});

test('adjacency ALONE is a candidate only — NOT counted (manual-required)', () => {
  // same supplier+vehicle on consecutive days, but NO release/block info.
  const days = [
    { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1' },
    { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1' },
  ] as const;
  const r = classifyItinerary(days as any);
  assert.equal(r.countedFullPackageDays, 0);
  assert.ok(r.days.every((d) => d.retentionCandidate === true && d.billedAs === 'manual-required' && d.retentionReason === 'not-retained-default'));
});

test('same supplier+vehicle adjacent + not-released signal → retained (continuous-same-vehicle)', () => {
  const days = [
    { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', vehicleReleased: false },
    { operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', vehicleReleased: false },
  ] as const;
  const r = classifyItinerary(days as any);
  assert.equal(r.countedFullPackageDays, 2);
  assert.ok(r.days.every((d) => d.vehicleRetained === true && d.retentionReason === 'continuous-same-vehicle'));
});

test('explicit retained override wins over a release signal absence', () => {
  const ret = resolveRetention({ operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', retained: true });
  assert.equal(ret.vehicleRetained, true);
  assert.equal(ret.retentionReason, 'explicit-retained');
});

test('inRetainedBlock flag → retained via retained-block', () => {
  const ret = resolveRetention({ operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1', inRetainedBlock: true });
  assert.equal(ret.vehicleRetained, true);
  assert.equal(ret.retentionReason, 'retained-block');
});

test('lone P2P, no neighbours, no flags → not-retained-default, not a candidate', () => {
  const ret = resolveRetention({ operationalType: 'POINT_TO_POINT', supplierKey: 'S1', vehicleKey: 'V1' });
  assert.equal(ret.vehicleRetained, false);
  assert.equal(ret.retentionCandidate, false);
  assert.equal(ret.retentionReason, 'not-retained-default');
});
