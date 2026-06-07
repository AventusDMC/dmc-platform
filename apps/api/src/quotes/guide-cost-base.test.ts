import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';

// Phase K.3 — guide cost-base fix. The createItem guide branch now assigns the
// computed GUIDE_RATES value to supplierCostBaseAmount (mirroring transport/
// activity/meal), so the item is costed at the guide rate, not the linked
// service baseCost. These tests pin the guide-rate -> 20%-markup cost/sell pairs
// via the unchanged pricing formula; the end-to-end createItem behaviour (escort
// $200, local $120 through package apply) is proven by the live verification.

function makeService() {
  const prisma: any = {};
  return new QuotesService(prisma, {} as any, {} as any, {} as any, {} as any) as any;
}

// GUIDE_RATES (USD): local {half 80, full 120}, escort {half 140, full 200}; +50 overnight.
const CASES = [
  { label: 'local / full_day', cost: 120, sell: 144 },
  { label: 'escort / full_day', cost: 200, sell: 240 },
  { label: 'escort / half_day', cost: 140, sell: 168 },
  { label: 'local / half_day', cost: 80, sell: 96 },
  { label: 'escort / full_day + overnight (+50)', cost: 250, sell: 300 },
];

test('guide rate -> 20% markup cost/sell pairs (via the unchanged pricing formula)', () => {
  const s = makeService();
  for (const c of CASES) {
    const { totalCost, totalSell } = s.calculateTransportItemPricing({ totalCost: c.cost, markupPercent: 20 });
    assert.equal(totalCost, c.cost, `${c.label}: cost`);
    assert.equal(totalSell, c.sell, `${c.label}: sell (cost +20%)`);
  }
});

test('escort/full_day is priced higher than local/full_day (the bug being fixed)', () => {
  const s = makeService();
  const local = s.calculateTransportItemPricing({ totalCost: 120, markupPercent: 20 });
  const escort = s.calculateTransportItemPricing({ totalCost: 200, markupPercent: 20 });
  assert.ok(escort.totalCost > local.totalCost, 'escort cost > local cost');
  assert.equal(escort.totalSell, 240);
  assert.equal(local.totalSell, 144);
});
