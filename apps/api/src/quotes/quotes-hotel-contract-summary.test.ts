import test = require('node:test');
import assert = require('node:assert/strict');
import { PATH_METADATA } from '@nestjs/common/constants';
const { QuotesController } = require('./quotes.controller');
const { QuotesService } = require('./quotes.service');
const { QuotePricingService } = require('./quote-pricing.service');
const { ROLES_KEY } = require('../auth/auth.decorators');

// HC-1 — safe hotel contract/rate summary endpoint.
// GET /quotes/:id/v2/items/:itemId/hotel-contract-summary returns a WHITELIST-CURATED
// summary anchored on a priced hotel QuoteItem. Never returns raw hotel/contract/rate/
// item objects, ratePolicies, verificationNotes, supplier contact, PII, booking,
// invoice, or publicToken. Cost block only for cost-visible roles. Read-only.

function createService(prisma: any = {}) {
  return new QuotesService(prisma, { log: async () => null } as any, {} as any, {} as any, new QuotePricingService());
}

const HOTEL_ITEM = {
  id: 'item-1',
  quoteId: 'quote-1',
  hotelId: 'hotel-1',
  contractId: 'contract-1',
  mealPlan: 'BB',
  occupancyType: 'DBL',
  seasonName: 'High',
  baseCost: 300,
  costBaseAmount: 300,
  costCurrency: 'USD',
  salesTaxPercent: 16,
  serviceChargePercent: 10,
  tourismFeeAmount: 5,
  tourismFeeCurrency: 'USD',
  hotel: { name: 'Petra Palace', city: 'Petra', category: '4', preferenceRank: 2 },
  roomCategory: { name: 'Deluxe Double' },
  contract: {
    name: 'Petra Palace 2026',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: new Date('2999-12-31T00:00:00.000Z'), // far future → no expiry warning
    currency: 'USD',
    confidence: 'IMPORTED_UNVERIFIED', // → UNVERIFIED_HOTEL_CONTRACT
    lastVerifiedAt: null,
    cancellationPolicy: { id: 'canc-1' },
    childPolicy: null,
    mealPlans: [{ code: 'BB', isActive: true }, { code: 'HB', isActive: true }, { code: 'RO', isActive: false }],
    _count: { supplements: 3 },
    // The following would be present on the raw row but MUST NOT be selected/returned:
    ratePolicies: { secret: true },
    verificationNotes: 'internal note',
  },
};

const FORBIDDEN_KEYS = [
  'ratePolicies', 'verificationNotes', 'supplements', 'passengers', 'passport', 'contact',
  'contactId', 'booking', 'invoice', 'publicToken', 'quoteItems', 'workflowDiagnostics',
];

function hotelPrisma(rows: any[]) {
  const writeGuard = (n: string) => async () => { throw new Error(`unexpected write: ${n}`); };
  return {
    quoteItem: {
      findFirst: async ({ where }: any) => rows.find((r) => r.id === where.id && r.quoteId === where.quoteId) ?? null,
      update: writeGuard('quoteItem.update'),
      create: writeGuard('quoteItem.create'),
    },
    quote: { update: writeGuard('quote.update') },
    invoice: { create: writeGuard('invoice.create') },
    booking: { create: writeGuard('booking.create') },
    auditLog: { create: writeGuard('auditLog.create') },
  };
}

function deepKeys(obj: any, acc = new Set<string>()) {
  if (Array.isArray(obj)) obj.forEach((v) => deepKeys(v, acc));
  else if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) { acc.add(k); deepKeys(obj[k], acc); }
  return acc;
}

test('route is gated to admin/super_admin/operations/viewer/finance and keeps its path', () => {
  const roles = (Reflect as any).getMetadata(ROLES_KEY, QuotesController.prototype.findHotelContractSummary);
  assert.deepEqual(roles, ['admin', 'super_admin', 'operations', 'viewer', 'finance']);
  assert.equal(roles.includes('agent'), false);
  assert.equal(roles.includes('agent_admin'), false);
  assert.equal(
    (Reflect as any).getMetadata(PATH_METADATA, QuotesController.prototype.findHotelContractSummary),
    ':id/v2/items/:itemId/hotel-contract-summary',
  );
});

test('HC-1A: explicit exact-role allowlist — allowed roles reach the service, agent/agent_admin are 403', async () => {
  const build = () => {
    const calls: string[] = [];
    const controller = new QuotesController(
      {
        findOne: async () => { calls.push('findOne'); return { id: 'quote-1' }; },
        getHotelContractSummary: async () => { calls.push('summary'); return { itemId: 'item-1' }; },
      } as any,
      {} as any,
    );
    return { controller, calls };
  };

  // Allowed roles reach the service (guard coalescing of super_admin is preserved here explicitly).
  for (const role of ['admin', 'super_admin', 'operations', 'viewer', 'finance']) {
    const { controller, calls } = build();
    const res = await controller.findHotelContractSummary('quote-1', 'item-1', { id: 'u1', role, companyId: 'c1' } as any);
    assert.deepEqual(res, { itemId: 'item-1' }, `${role} should receive the summary`);
    assert.deepEqual(calls, ['findOne', 'summary'], `${role} should reach findOne + service`);
  }

  // agent_admin — coalesced to admin by the roles.guard, but blocked by the explicit
  // exact-role check BEFORE any quote is loaded.
  for (const role of ['agent_admin', 'agent']) {
    const { controller, calls } = build();
    await assert.rejects(
      () => controller.findHotelContractSummary('quote-1', 'item-1', { id: 'u1', role, companyId: 'c1' } as any),
      /permission to view hotel contract details/,
      `${role} must be 403`,
    );
    assert.deepEqual(calls, [], `${role} must not reach findOne or the service`);
  }

  // No actor at all → also blocked (defensive).
  const { controller, calls } = build();
  await assert.rejects(() => controller.findHotelContractSummary('quote-1', 'item-1', null as any), /permission/);
  assert.deepEqual(calls, []);
});

test('admin receives curated summary WITH cost block; no forbidden fields', async () => {
  const service = createService(hotelPrisma([HOTEL_ITEM]));
  const s = await service.getHotelContractSummary('quote-1', 'item-1', { role: 'admin', companyId: 'c1' });
  assert.equal(s.itemId, 'item-1');
  assert.equal(s.quoteId, 'quote-1');
  assert.deepEqual(s.hotel, { name: 'Petra Palace', city: 'Petra', category: '4', preferenceRank: 2 });
  assert.equal(s.contract.status, 'contracted');
  assert.equal(s.contract.name, 'Petra Palace 2026');
  assert.equal(s.contract.currency, 'USD');
  assert.equal(s.contract.confidence, 'IMPORTED_UNVERIFIED');
  assert.deepEqual(s.room, { categoryName: 'Deluxe Double', mealPlan: 'BB', occupancyType: 'DBL', seasonName: 'High' });
  assert.equal(s.policies.hasCancellationPolicy, true);
  assert.equal(s.policies.hasChildPolicy, false);
  assert.equal(s.policies.supplementsCount, 3); // COUNT only — no amounts
  assert.deepEqual(s.policies.mealPlanCodes, ['BB', 'HB']); // active only
  assert.deepEqual(s.warnings, ['UNVERIFIED_HOTEL_CONTRACT']);
  // Cost block (finance-visible), curated + minimal.
  assert.deepEqual(Object.keys(s.cost).sort(), ['baseCost', 'costBaseAmount', 'costCurrency', 'salesTaxPercent', 'serviceChargePercent', 'tourismFeeAmount', 'tourismFeeCurrency']);
  assert.equal(s.cost.baseCost, 300);
  // No forbidden keys anywhere; no leaked ratePolicies/verificationNotes/supplement detail.
  const keys = [...deepKeys(s)];
  for (const k of FORBIDDEN_KEYS) assert.equal(keys.includes(k), false, `must not include ${k}`);
  assert.equal(/internal note|"secret"/.test(JSON.stringify(s)), false);
  // Money must live ONLY inside the cost block — never at the top level.
  assert.equal((s as any).baseCost, undefined);
  assert.equal((s as any).costCurrency, undefined);
  assert.equal((s as any).salesTaxPercent, undefined);
});

test('finance also receives the cost block', async () => {
  const service = createService(hotelPrisma([HOTEL_ITEM]));
  const s = await service.getHotelContractSummary('quote-1', 'item-1', { role: 'finance', companyId: 'c1' });
  assert.equal('cost' in s, true);
  assert.equal(s.cost.costCurrency, 'USD');
});

test('viewer receives curated summary WITHOUT cost (omitted, not zeroed/null)', async () => {
  const service = createService(hotelPrisma([HOTEL_ITEM]));
  const s = await service.getHotelContractSummary('quote-1', 'item-1', { role: 'viewer', companyId: 'c1' });
  assert.equal('cost' in s, false);
  // No monetary value anywhere for non-finance.
  const keys = [...deepKeys(s)];
  for (const k of ['baseCost', 'costBaseAmount', 'salesTaxPercent', 'serviceChargePercent', 'tourismFeeAmount']) {
    assert.equal(keys.includes(k), false, `viewer must not receive ${k}`);
  }
  // Contract/room/policy story still present.
  assert.equal(s.contract.status, 'contracted');
  assert.equal(s.policies.supplementsCount, 3);
});

test('operations receives curated summary WITHOUT cost', async () => {
  const service = createService(hotelPrisma([HOTEL_ITEM]));
  const s = await service.getHotelContractSummary('quote-1', 'item-1', { role: 'operations', companyId: 'c1' });
  assert.equal('cost' in s, false);
});

test('missing item, cross-quote item, and non-hotel item all return null (→ 404)', async () => {
  const nonHotel = { ...HOTEL_ITEM, id: 'item-2', hotelId: null, contractId: null, contract: null, hotel: null };
  const service = createService(hotelPrisma([HOTEL_ITEM, nonHotel]));
  assert.equal(await service.getHotelContractSummary('quote-1', 'missing', { role: 'admin' }), null);
  assert.equal(await service.getHotelContractSummary('other-quote', 'item-1', { role: 'admin' }), null);
  assert.equal(await service.getHotelContractSummary('quote-1', 'item-2', { role: 'admin' }), null); // non-hotel
});

test('warnings surface EXPIRED_CONTRACT for a past validTo', async () => {
  const expired = { ...HOTEL_ITEM, id: 'item-3', contract: { ...HOTEL_ITEM.contract, validTo: new Date('2000-01-01T00:00:00.000Z'), confidence: 'VERIFIED' } };
  const service = createService(hotelPrisma([expired]));
  const s = await service.getHotelContractSummary('quote-1', 'item-3', { role: 'admin' });
  assert.deepEqual(s.warnings, ['EXPIRED_CONTRACT']);
});

test('on-request status when the hotel line has no contract', async () => {
  const noContract = { ...HOTEL_ITEM, id: 'item-4', contractId: null, contract: null };
  const service = createService(hotelPrisma([noContract]));
  const s = await service.getHotelContractSummary('quote-1', 'item-4', { role: 'admin' });
  assert.equal(s.contract.status, 'on-request');
  assert.deepEqual(s.warnings, []);
  assert.equal(s.policies.supplementsCount, 0);
  assert.deepEqual(s.policies.mealPlanCodes, []);
});

test('getHotelContractSummary performs no writes', async () => {
  const service = createService(hotelPrisma([HOTEL_ITEM]));
  await assert.doesNotReject(() => service.getHotelContractSummary('quote-1', 'item-1', { role: 'admin' }));
  await assert.doesNotReject(() => service.getHotelContractSummary('quote-1', 'item-1', { role: 'viewer' }));
});

test('controller enforces actor scope + 404 and delegates to the service', async () => {
  const actor = { id: 'u1', role: 'admin', companyId: 'c1' };
  // Out-of-scope quote → findOne null → 404, summary not fetched.
  let calls = 0;
  const denyQuote = new QuotesController(
    { findOne: async () => null, getHotelContractSummary: async () => { calls += 1; return {}; } } as any,
    {} as any,
  );
  await assert.rejects(() => denyQuote.findHotelContractSummary('quote-1', 'item-1', actor as any), /Quote not found/);
  assert.equal(calls, 0);
  // In scope but summary null (missing/cross-quote/non-hotel) → 404.
  const denyItem = new QuotesController(
    { findOne: async () => ({ id: 'quote-1' }), getHotelContractSummary: async () => null } as any,
    {} as any,
  );
  await assert.rejects(() => denyItem.findHotelContractSummary('quote-1', 'nope', actor as any), /Hotel contract summary not found/);
  // Happy path → returns the curated summary.
  const ok = new QuotesController(
    { findOne: async () => ({ id: 'quote-1' }), getHotelContractSummary: async () => ({ itemId: 'item-1' }) } as any,
    {} as any,
  );
  assert.deepEqual(await ok.findHotelContractSummary('quote-1', 'item-1', actor as any), { itemId: 'item-1' });
});
