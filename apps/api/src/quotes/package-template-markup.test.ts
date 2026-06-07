import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';

// Phase A (markup policy) — PackageTemplate apply must stamp a per-item default
// markup instead of 0, so created items have sell > cost. Approved per-type
// defaults: HOTEL 15% (largest cost line, more conservative), every other
// component type 20% (the ERP's standard default). This is a creation-time
// value only — the pricing engine/formula and any later manual override are
// unchanged.

function makeService() {
  const prisma: any = {};
  return new QuotesService(prisma, {} as any, {} as any, {} as any, {} as any) as any;
}

const QUOTE = { id: 'q1', adults: 2, children: 0, roomCount: 1, nightCount: 1 };
const PKG = { id: 'pkg1' };
const DAY = { id: 'day1', dayNumber: 1 };
const QDAY = { id: 'qday1' };

function buildPayload(service: any, component: any) {
  return service.buildPackageComponentQuoteItemPayload({
    quote: QUOTE,
    packageTemplate: PKG,
    packageDay: DAY,
    packageComponent: component,
    quoteDay: QDAY,
  });
}

test('default markup helper: HOTEL is 15%, every other component type is 20%', () => {
  const s = makeService();
  assert.equal(s.defaultPackageComponentMarkupPercent('HOTEL'), 15);
  for (const t of ['TRANSPORT', 'TICKET', 'ENTRANCE', 'ACTIVITY', 'GUIDE', 'SERVICE', 'DINING', 'MEAL', 'OTHER']) {
    assert.equal(s.defaultPackageComponentMarkupPercent(t), 20, `${t} should default to 20`);
  }
});

test('default markup helper: unknown / null / undefined type falls back to 20%', () => {
  const s = makeService();
  assert.equal(s.defaultPackageComponentMarkupPercent('EXCURSION_TEMPLATE'), 20);
  assert.equal(s.defaultPackageComponentMarkupPercent('SOMETHING_NEW'), 20);
  assert.equal(s.defaultPackageComponentMarkupPercent(null), 20);
  assert.equal(s.defaultPackageComponentMarkupPercent(undefined), 20);
});

test('HOTEL package component payload is stamped with 15% markup', async () => {
  const s = makeService();
  s.resolvePackageHotelMapping = async () => ({ serviceId: 'hotel-svc', hotelContractId: 'hc1' });
  const payload = await buildPayload(s, { id: 'c-hotel', componentType: 'HOTEL' });
  assert.ok(payload, 'hotel payload should resolve');
  assert.equal(payload.markupPercent, 15);
  assert.equal(payload.packageTemplateComponentId, 'c-hotel');
});

test('TRANSPORT package component payload is stamped with 20% markup', async () => {
  const s = makeService();
  s.resolvePackageTransportMapping = async () => ({ serviceId: 'transport-svc', routeId: 'r1', vehicleRateId: 'vr1' });
  const payload = await buildPayload(s, { id: 'c-transport', componentType: 'TRANSPORT' });
  assert.ok(payload, 'transport payload should resolve');
  assert.equal(payload.markupPercent, 20);
});

test('TICKET package component payload is stamped with 20% markup', async () => {
  const s = makeService();
  s.isTicketPackageService = () => true;
  const payload = await buildPayload(s, {
    id: 'c-ticket',
    componentType: 'TICKET',
    supplierServiceId: 'svc-ticket',
    supplierService: { id: 'svc-ticket' },
  });
  assert.ok(payload, 'ticket payload should resolve');
  assert.equal(payload.markupPercent, 20);
});

test('SERVICE package component payload is stamped with 20% markup', async () => {
  const s = makeService();
  const payload = await buildPayload(s, { id: 'c-svc', componentType: 'SERVICE', supplierServiceId: 'svc-1' });
  assert.ok(payload, 'service payload should resolve');
  assert.equal(payload.markupPercent, 20);
});

test('a positive default markup yields sell > cost via the unchanged pricing formula', () => {
  const s = makeService();
  for (const t of ['HOTEL', 'TRANSPORT', 'TICKET', 'ACTIVITY', 'SERVICE']) {
    const markup = s.defaultPackageComponentMarkupPercent(t);
    const { totalCost, totalSell } = s.calculateTransportItemPricing({ totalCost: 100, markupPercent: markup });
    assert.ok(totalSell > totalCost, `${t}: sell (${totalSell}) should exceed cost (${totalCost})`);
  }
  // Exact formula spot-checks (engine unchanged): 15% -> 115, 20% -> 120 on a 100 cost.
  assert.equal(s.calculateTransportItemPricing({ totalCost: 100, markupPercent: 15 }).totalSell, 115);
  assert.equal(s.calculateTransportItemPricing({ totalCost: 100, markupPercent: 20 }).totalSell, 120);
});
