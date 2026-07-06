import test = require('node:test');
import assert = require('node:assert/strict');
import { buildCatalogV2Summary, roleSeesPricing, type CatalogV2Input } from './catalog-v2-summary';

/**
 * Product Catalog V2 — Slice 1 pure builder tests.
 * Covers every warning branch, derived active/validity/currency behavior, and
 * role-based pricing redaction. `now` is injected for deterministic expiry.
 */

const NOW = '2026-07-06T00:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.parse(NOW) + offsetDays * DAY).toISOString();

const EMPTY_COUNTS = { services: 0, activities: 0, activitiesActive: 0, guides: 0, guidesActive: 0, restaurants: 0, restaurantsActive: 0 };

function input(over: Partial<CatalogV2Input> = {}): CatalogV2Input {
  return {
    suppliers: [],
    supplierServices: [],
    serviceRates: [],
    transportContracts: [],
    vehicleRates: [],
    hotelContracts: [],
    catalogCounts: EMPTY_COUNTS,
    ...over,
  };
}

const supplier = (over: any = {}) => ({
  id: 'sup-1',
  name: 'Supplier One',
  type: 'transport',
  email: 'ops@supplier.example',
  phone: null,
  baseCity: 'Amman',
  transportDiscountPercent: 25,
  ...over,
});

function codes(res: any, supIdx = 0): string[] {
  return res.suppliers[supIdx].warnings.map((w: any) => w.code);
}

test('roleSeesPricing: pricing roles vs redacted roles', () => {
  for (const r of ['admin', 'operations', 'super_admin', 'finance'] as const) assert.equal(roleSeesPricing(r), true, r);
  for (const r of ['agent', 'viewer', 'agent_admin'] as const) assert.equal(roleSeesPricing(r), false, r);
  assert.equal(roleSeesPricing(null), false);
});

test('healthy supplier (email + service + rate + valid contract) → no warnings', () => {
  const res = buildCatalogV2Summary(
    input({
      suppliers: [supplier()],
      supplierServices: [{ id: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, name: 'X', category: 'transport', currency: 'JOD', baseCost: 10, serviceTypeActive: true }],
      serviceRates: [{ serviceId: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, costCurrency: 'JOD', costBaseAmount: 8 }],
      transportContracts: [{ supplierId: 'sup-1', currency: 'JOD', validFrom: iso(-10), validTo: iso(200), active: true }],
    }),
    'admin',
    NOW,
  );
  assert.deepEqual(codes(res), []);
  assert.equal(res.suppliers[0].operationallyActive, true);
  assert.deepEqual(res.suppliers[0].currencies, ['JOD']);
  assert.equal(res.suppliers[0].contractValidity.active, 1);
});

test('MISSING_EMAIL when email blank', () => {
  const res = buildCatalogV2Summary(input({ suppliers: [supplier({ email: '  ' })] }), 'admin', NOW);
  assert.ok(codes(res).includes('MISSING_EMAIL'));
});

test('MULTIPLE_EMAILS when field holds >1 address', () => {
  const res = buildCatalogV2Summary(input({ suppliers: [supplier({ email: 'a@x.example, b@y.example' })] }), 'admin', NOW);
  assert.ok(codes(res).includes('MULTIPLE_EMAILS'));
  assert.ok(!codes(res).includes('MISSING_EMAIL'));
});

test('MISSING_RATES when supplier has a service but no rate', () => {
  const res = buildCatalogV2Summary(
    input({
      suppliers: [supplier()],
      supplierServices: [{ id: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, name: 'X', category: 'c', currency: 'JOD', baseCost: 10, serviceTypeActive: true }],
    }),
    'admin',
    NOW,
  );
  assert.ok(codes(res).includes('MISSING_RATES'));
});

test('EXPIRED_CONTRACT and NO_ACTIVE_SERVICES for an expired-only transport supplier', () => {
  const res = buildCatalogV2Summary(
    input({
      suppliers: [supplier()],
      transportContracts: [{ supplierId: 'sup-1', currency: 'JOD', validFrom: iso(-100), validTo: iso(-1), active: true }],
    }),
    'admin',
    NOW,
  );
  assert.ok(codes(res).includes('EXPIRED_CONTRACT'));
  assert.ok(codes(res).includes('NO_ACTIVE_SERVICES'), 'expired contract does not count as valid');
  assert.equal(res.suppliers[0].contractValidity.expired, 1);
});

test('EXPIRING_SOON within the window', () => {
  const res = buildCatalogV2Summary(
    input({
      suppliers: [supplier()],
      transportContracts: [{ supplierId: 'sup-1', currency: 'JOD', validFrom: iso(-10), validTo: iso(10), active: true }],
    }),
    'admin',
    NOW,
  );
  assert.ok(codes(res).includes('EXPIRING_SOON'));
  assert.equal(res.suppliers[0].contractValidity.expiringSoon, 1);
});

test('CURRENCY_MISMATCH when services/contracts mix currencies', () => {
  const res = buildCatalogV2Summary(
    input({
      suppliers: [supplier()],
      supplierServices: [{ id: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, name: 'X', category: 'c', currency: 'JOD', baseCost: 10, serviceTypeActive: true }],
      serviceRates: [{ serviceId: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, costCurrency: 'USD', costBaseAmount: 8 }],
    }),
    'admin',
    NOW,
  );
  assert.ok(codes(res).includes('CURRENCY_MISMATCH'));
  assert.deepEqual(res.suppliers[0].currencies, ['JOD', 'USD']);
});

test('MISSING_BASE_CITY only for transport suppliers with no baseCity', () => {
  const transport = buildCatalogV2Summary(input({ suppliers: [supplier({ baseCity: null })] }), 'admin', NOW);
  assert.ok(codes(transport).includes('MISSING_BASE_CITY'));
  const activityType = buildCatalogV2Summary(input({ suppliers: [supplier({ type: 'activity', baseCity: null })] }), 'admin', NOW);
  assert.ok(!codes(activityType).includes('MISSING_BASE_CITY'));
});

test('NO_ACTIVE_SERVICES when only an inactive serviceType service exists', () => {
  const res = buildCatalogV2Summary(
    input({
      suppliers: [supplier()],
      supplierServices: [{ id: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, name: 'X', category: 'c', currency: 'JOD', baseCost: 1, serviceTypeActive: false }],
      serviceRates: [{ serviceId: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, costCurrency: 'JOD', costBaseAmount: 1 }],
    }),
    'admin',
    NOW,
  );
  assert.ok(codes(res).includes('NO_ACTIVE_SERVICES'));
  assert.equal(res.suppliers[0].operationallyActive, false);
});

test('hotel contracts: EXPIRED / EXPIRING_SOON / UNVERIFIED', () => {
  const res = buildCatalogV2Summary(
    input({
      hotelContracts: [
        { id: 'h1', name: 'C1', hotelName: 'Hotel A', validFrom: iso(-100), validTo: iso(-1), currency: 'USD', confidence: 'VERIFIED' },
        { id: 'h2', name: 'C2', hotelName: 'Hotel B', validFrom: iso(-10), validTo: iso(5), currency: 'USD', confidence: 'VERIFIED' },
        { id: 'h3', name: 'C3', hotelName: 'Hotel C', validFrom: iso(-10), validTo: iso(200), currency: 'USD', confidence: 'IMPORTED_UNVERIFIED' },
      ],
    }),
    'admin',
    NOW,
  );
  const byId = Object.fromEntries(res.hotelContracts.map((c: any) => [c.id, c.warnings.map((w: any) => w.code)]));
  assert.ok(byId['h1'].includes('EXPIRED_CONTRACT'));
  assert.ok(byId['h2'].includes('EXPIRING_SOON'));
  assert.ok(byId['h3'].includes('UNVERIFIED_HOTEL_CONTRACT'));
  assert.equal(res.warningCounts.UNVERIFIED_HOTEL_CONTRACT, 1);
  assert.equal(res.warningCounts.EXPIRED_CONTRACT, 1);
});

test('warningCounts aggregate across suppliers + hotel contracts', () => {
  const res = buildCatalogV2Summary(
    input({
      suppliers: [supplier({ email: null, baseCity: null })],
      hotelContracts: [{ id: 'h1', name: 'C', hotelName: 'H', validFrom: iso(-100), validTo: iso(-1), currency: 'USD', confidence: 'NEEDS_REVIEW' }],
    }),
    'admin',
    NOW,
  );
  assert.equal(res.warningCounts.MISSING_EMAIL, 1);
  assert.equal(res.warningCounts.MISSING_BASE_CITY, 1);
  assert.equal(res.warningCounts.EXPIRED_CONTRACT, 1);
  assert.equal(res.warningCounts.UNVERIFIED_HOTEL_CONTRACT, 1);
  assert.equal(res.meta.counts.totalWarnings, Object.values(res.warningCounts).reduce((a: number, b: number) => a + b, 0));
});

test('pricing VISIBLE for admin/operations/super_admin/finance', () => {
  for (const role of ['admin', 'operations', 'super_admin', 'finance'] as const) {
    const res = buildCatalogV2Summary(
      input({
        suppliers: [supplier()],
        supplierServices: [{ id: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, name: 'X', category: 'c', currency: 'JOD', baseCost: 10, serviceTypeActive: true }],
        serviceRates: [{ serviceId: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, costCurrency: 'JOD', costBaseAmount: 8 }],
      }),
      role,
      NOW,
    );
    assert.equal(res.meta.pricingRedacted, false, role);
    assert.equal(res.suppliers[0].pricingRedacted, false, role);
    assert.ok(res.suppliers[0].pricing, `${role} sees pricing`);
    assert.equal(res.suppliers[0].pricing.transportDiscountPercent, 25);
    assert.equal(res.suppliers[0].pricing.serviceBaseCosts[0].baseCost, 10);
  }
});

test('pricing REDACTED for agent/viewer/agent_admin (figures gone, structure kept)', () => {
  for (const role of ['agent', 'viewer', 'agent_admin'] as const) {
    const res = buildCatalogV2Summary(
      input({
        suppliers: [supplier()],
        supplierServices: [{ id: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, name: 'X', category: 'c', currency: 'JOD', baseCost: 10, serviceTypeActive: true }],
        serviceRates: [{ serviceId: 'sv1', resolvedSupplierId: 'sup-1', supplierId: null, costCurrency: 'JOD', costBaseAmount: 8 }],
      }),
      role,
      NOW,
    );
    assert.equal(res.meta.pricingRedacted, true, role);
    assert.equal(res.suppliers[0].pricingRedacted, true, role);
    assert.equal(res.suppliers[0].pricing, null, `${role} must not see pricing`);
    // structure still present
    assert.equal(res.suppliers[0].serviceCount, 1);
    assert.deepEqual(res.suppliers[0].currencies, ['JOD']);
    const blob = JSON.stringify(res.suppliers[0]);
    assert.ok(!blob.includes('transportDiscountPercent'), 'no pricing keys leak');
    assert.ok(!/"baseCost"|"costBaseAmount"/.test(blob), 'no cost figures leak');
  }
});
