import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { QuotesService } from './quotes.service';

// PR 12F-2 — wiring of the overnight/stationary COST-ONLY delta into recalculateQuoteTotals. Proves:
//  - both flags OFF → overnight/stationary apply is NOT consulted; totals = baseline (parity).
//  - package apply + overnight/stationary flag ON + apply → totalCost includes the cost delta,
//    totalSell is UNCHANGED (supplier-cost / internal only), QuoteItems never mutated.
//  - the overnight/stationary apply is gated on package apply having applied.
//  - recalculation is idempotent (re-running yields the same total — no compounding).
// recalculateQuoteTotals is private; we drive it via `as any` + stub the heavy collaborators,
// mirroring the PR11A quote-package-live-apply test pattern.

const PKG_FLAG = 'TRANSPORT_PACKAGE_PRICING_LIVE_APPLY';
const OS_FLAG = 'TRANSPORT_OVERNIGHT_STATIONARY_LIVE_APPLY';
const clearFlags = () => { delete process.env[PKG_FLAG]; delete process.env[OS_FLAG]; };

function buildService(pkgResult: any, osResult: any) {
  const writes: any[] = [];
  let itemUpdateCalled = false;
  let osCalls = 0;
  const prisma = {
    quote: {
      findUnique: async () => ({
        id: 'q1', adults: 2, children: 0, roomCount: 1, nightCount: 3,
        focType: null, focRatio: null, focCount: null, focRoomType: null,
        pricingType: 'FIXED', pricingMode: 'FIXED', quoteCurrency: 'USD', jordanPassType: null, pricingSlabs: [],
      }),
      update: async ({ data }: any) => { writes.push(data); return { id: 'q1', ...data }; },
    },
    quoteItem: {
      findMany: async () => [
        { id: 'a', totalCost: 1000, totalSell: 1200, optionId: null },
        { id: 'b', totalCost: 500, totalSell: 600, optionId: null },
      ],
      update: async () => { itemUpdateCalled = true; return {}; },
    },
  } as any;

  const spyShadow: any = {
    computeQuotePackageLiveApply: async () => pkgResult,
    computeQuoteOvernightStationaryLiveApply: async () => { osCalls++; return osResult; },
  };
  const svc = new QuotesService(prisma, {} as any, {} as any, {} as any, {} as any, spyShadow) as any;
  svc.syncJordanPassEntranceFees = async () => {};
  svc.calculateJordanPassTotals = async () => ({ totalCost: 0, totalSell: 0 });
  svc.hydrateOneOffExternalPackageItem = (i: any) => i;
  svc.normalizeQuotePricingMode = () => 'FIXED';
  svc.normalizeQuotePricingType = () => 'FIXED';

  return { svc, writes, getItemUpdateCalled: () => itemUpdateCalled, getOsCalls: () => osCalls };
}

const PKG_APPLIED_NOOP = { apply: true, costDelta: 0, sellDelta: 0 }; // package applies, but 0 delta (isolate OS)
const OS_APPLIED = { apply: true, reason: 'applied', costDelta: 105, sellDelta: 0 };

test('12F-2 wiring: both flags OFF → overnight/stationary not consulted, totals = baseline', async () => {
  clearFlags();
  const { svc, writes, getOsCalls } = buildService(PKG_APPLIED_NOOP, OS_APPLIED);
  await svc.recalculateQuoteTotals('q1');
  assert.equal(getOsCalls(), 0);           // never consulted when its flag is OFF
  assert.equal(writes[0].totalCost, 1500); // 1000 + 500, identical to today
  assert.equal(writes[0].totalSell, 1800);
});

test('12F-2 wiring: package applied + OS flag ON + apply → totalCost includes delta, totalSell UNCHANGED', async () => {
  process.env[PKG_FLAG] = 'true';
  process.env[OS_FLAG] = 'true';
  const { svc, writes, getItemUpdateCalled, getOsCalls } = buildService(PKG_APPLIED_NOOP, OS_APPLIED);
  await svc.recalculateQuoteTotals('q1');
  clearFlags();
  assert.equal(getOsCalls(), 1);
  assert.equal(writes[0].totalCost, 1605);   // 1500 + 0 (package) + 105 (overnight/stationary)
  assert.equal(writes[0].totalSell, 1800);   // UNCHANGED — supplier-cost / internal only
  assert.equal(writes[0].totalPrice, 1800);  // totalPrice mirrors totalSell (no sell change)
  assert.equal(getItemUpdateCalled(), false); // QuoteItems never mutated
});

test('12F-2 wiring: recalculation is idempotent (running twice gives the same total)', async () => {
  process.env[PKG_FLAG] = 'true';
  process.env[OS_FLAG] = 'true';
  const { svc, writes } = buildService(PKG_APPLIED_NOOP, OS_APPLIED);
  await svc.recalculateQuoteTotals('q1');
  await svc.recalculateQuoteTotals('q1');
  clearFlags();
  assert.equal(writes[0].totalCost, 1605);
  assert.equal(writes[1].totalCost, 1605, 'no compounding — totals rebuilt from scratch each run');
});

test('12F-2 wiring: OS gated on package apply — package NOT applied → OS not consulted, baseline totals', async () => {
  process.env[PKG_FLAG] = 'true';
  process.env[OS_FLAG] = 'true';
  const { svc, writes, getOsCalls } = buildService({ apply: false, reason: 'not-pilot-contract', costDelta: 0, sellDelta: 0 }, OS_APPLIED);
  await svc.recalculateQuoteTotals('q1');
  clearFlags();
  assert.equal(getOsCalls(), 0, 'overnight/stationary apply only runs after package apply applies');
  assert.equal(writes[0].totalCost, 1500);
  assert.equal(writes[0].totalSell, 1800);
});

test('12F-2 wiring: OS flag OFF (package flag ON + applied) → OS not consulted, no cost delta', async () => {
  process.env[PKG_FLAG] = 'true';
  delete process.env[OS_FLAG];
  const { svc, writes, getOsCalls } = buildService(PKG_APPLIED_NOOP, OS_APPLIED);
  await svc.recalculateQuoteTotals('q1');
  clearFlags();
  assert.equal(getOsCalls(), 0);
  assert.equal(writes[0].totalCost, 1500);
  assert.equal(writes[0].totalSell, 1800);
});
