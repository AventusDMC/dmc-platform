import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { QuotesService } from './quotes.service';

// PR11A — wiring of the live-apply delta into recalculateQuoteTotals. Proves:
//  - flag OFF → the shadow service is NOT consulted; totals = baseline item sum (rollback).
//  - flag ON + apply → totals = baseline + cost/sell delta at total level only.
//  - NO QuoteItem rows are mutated in either case.
// recalculateQuoteTotals is private; we drive it via `as any` and stub the heavy collaborators,
// mirroring the existing quotes.service test pattern.

const LIVE_FLAG = 'TRANSPORT_PACKAGE_PRICING_LIVE_APPLY';

function buildService(applyResult: any) {
  const writes: any[] = [];
  let itemUpdateCalled = false;
  let spyCalls = 0;
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

  const spyShadow: any = { computeQuotePackageLiveApply: async () => { spyCalls++; return applyResult; } };
  const svc = new QuotesService(prisma, {} as any, {} as any, {} as any, {} as any, spyShadow) as any;
  // Stub heavy collaborators so recalculateQuoteTotals runs in isolation.
  svc.syncJordanPassEntranceFees = async () => {};
  svc.calculateJordanPassTotals = async () => ({ totalCost: 0, totalSell: 0 });
  svc.hydrateOneOffExternalPackageItem = (i: any) => i;
  svc.normalizeQuotePricingMode = () => 'FIXED';
  svc.normalizeQuotePricingType = () => 'FIXED';

  return { svc, writes, getItemUpdateCalled: () => itemUpdateCalled, getSpyCalls: () => spyCalls };
}

test('PR11A wiring: flag OFF → no apply call, totals are the baseline item sum (rollback)', async () => {
  delete process.env[LIVE_FLAG];
  const { svc, writes, getItemUpdateCalled, getSpyCalls } = buildService({ apply: true, costDelta: -624, sellDelta: -748.8 });
  await svc.recalculateQuoteTotals('q1');
  assert.equal(getSpyCalls(), 0);            // shadow not consulted when flag OFF
  assert.equal(writes[0].totalCost, 1500);   // 1000 + 500
  assert.equal(writes[0].totalSell, 1800);   // 1200 + 600
  assert.equal(getItemUpdateCalled(), false);
});

test('PR11A wiring: flag ON + apply → totals include the cost/sell delta; no item mutation', async () => {
  process.env[LIVE_FLAG] = 'true';
  const { svc, writes, getItemUpdateCalled, getSpyCalls } = buildService({ apply: true, costDelta: -624, sellDelta: -748.8 });
  await svc.recalculateQuoteTotals('q1');
  assert.equal(getSpyCalls(), 1);
  assert.equal(writes[0].totalCost, 876);    // 1500 − 624
  assert.equal(writes[0].totalSell, 1051.2); // 1800 − 748.8
  assert.equal(writes[0].totalPrice, 1051.2);
  assert.equal(getItemUpdateCalled(), false); // QuoteItem rows never mutated
  delete process.env[LIVE_FLAG];
});

test('PR11A wiring: flag ON but apply:false → totals unchanged (fallback to existing pricing)', async () => {
  process.env[LIVE_FLAG] = 'true';
  const { svc, writes, getSpyCalls } = buildService({ apply: false, reason: 'not-pilot-contract', costDelta: 0, sellDelta: 0 });
  await svc.recalculateQuoteTotals('q1');
  assert.equal(getSpyCalls(), 1);
  assert.equal(writes[0].totalCost, 1500);
  assert.equal(writes[0].totalSell, 1800);
  delete process.env[LIVE_FLAG];
});
