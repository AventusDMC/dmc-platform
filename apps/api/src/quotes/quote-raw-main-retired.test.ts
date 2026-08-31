import assert = require('node:assert/strict');
import test = require('node:test');
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuotesController } from './quotes.controller';

// CP-N3b2c2c — raw main GET /quotes/:id retired fail-closed. Synthetic actors/quotes
// only. Proves: every role gets 404 before any service call on the raw handler; the
// safe finance-detail + operational endpoints remain gated and functional; and the
// three main-detail routes still resolve to their specific handlers.

const ALL_ROLES = [
  'admin', 'super_admin', 'finance', 'operations', 'viewer', 'agent', 'agent_admin', 'some-unknown-future-role',
] as const;
const COST_VISIBLE = ['admin', 'super_admin', 'finance'] as const;
const COST_DENIED = ['operations', 'viewer', 'agent', 'agent_admin', 'some-unknown-future-role'] as const;
const INTERNAL_READ = ['admin', 'super_admin', 'finance', 'operations', 'viewer'] as const;
const INTERNAL_DENIED = ['agent', 'agent_admin', 'some-unknown-future-role'] as const;

function makeActor(role: string | undefined) {
  return (role === undefined ? { id: 'u1', companyId: 'dmc' } : { id: 'u1', companyId: 'dmc', role }) as any;
}

// A quote shaped so the operational + finance mappers run without throwing.
function rawQuote() {
  return {
    id: 'q1', clientCompanyId: 'client-company', pricingType: 'simple', pricingMode: 'FIXED',
    totalCost: 0, totalSell: 0, quoteItems: [], quoteOptions: [], quoteItineraryDays: [],
    itineraries: [], passengers: [], pricingSlabs: [], scenarios: [], company: null, contact: null,
    agent: null, booking: null, invoice: null,
  };
}

function createController() {
  // Count EVERY service method so "no service method is called" can be proven.
  const calls = { total: 0, findOne: 0, findAll: 0, findPassengers: 0, findRoomingGroups: 0 };
  const quotesService: any = {
    findOne: async (id: string) => { calls.total += 1; calls.findOne += 1; return { ...rawQuote(), id }; },
    findAll: async () => { calls.total += 1; calls.findAll += 1; return []; },
    findPassengers: async () => { calls.total += 1; calls.findPassengers += 1; return []; },
    findRoomingGroups: async () => { calls.total += 1; calls.findRoomingGroups += 1; return []; },
  };
  return { controller: new QuotesController(quotesService, {} as any), calls };
}

// 1+2+3: raw main findOne → 404 for every role, with ZERO service method calls.
for (const role of ALL_ROLES) {
  test(`raw main GET :id → 404 for role "${role}" (no findOne, no other service call)`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(() => controller.findOne('q1', makeActor(role)), NotFoundException);
    assert.equal(calls.findOne, 0);
    assert.equal(calls.total, 0);
  });
}
test('raw main GET :id → 404 for missing role, zero service calls', async () => {
  const { controller, calls } = createController();
  await assert.rejects(() => controller.findOne('q1', makeActor(undefined)), NotFoundException);
  assert.equal(calls.total, 0);
});

// 4: finance-detail remains available to cost-visible; denied rejected BEFORE service.
for (const role of COST_VISIBLE) {
  test(`finance-detail remains available to "${role}"`, async () => {
    const { controller, calls } = createController();
    const res: any = await controller.findOneFinanceDetail('q1', makeActor(role));
    assert.equal(calls.findOne, 1);
    assert.equal(res.id, 'q1');
  });
}
for (const role of COST_DENIED) {
  test(`finance-detail denies "${role}" before service`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(() => controller.findOneFinanceDetail('q1', makeActor(role)), ForbiddenException);
    assert.equal(calls.total, 0);
  });
}
test('finance-detail denies missing role before service', async () => {
  const { controller, calls } = createController();
  await assert.rejects(() => controller.findOneFinanceDetail('q1', makeActor(undefined)), ForbiddenException);
  assert.equal(calls.total, 0);
});

// 5: operational remains available to every internal-read role; denied before service.
for (const role of INTERNAL_READ) {
  test(`operational remains available to internal role "${role}"`, async () => {
    const { controller, calls } = createController();
    const res: any = await controller.findOneOperational('q1', makeActor(role));
    assert.equal(calls.findOne, 1);
    assert.equal(res.id, 'q1');
  });
}
for (const role of INTERNAL_DENIED) {
  test(`operational denies "${role}" before service`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(() => controller.findOneOperational('q1', makeActor(role)), ForbiddenException);
    assert.equal(calls.total, 0);
  });
}

// 8: route resolution — the three main-detail routes resolve to distinct handlers.
test('route resolution: :id (retired) vs :id/finance-detail vs :id/operational', () => {
  const R = (globalThis as { Reflect: { getMetadata(k: string, t: unknown): unknown } }).Reflect;
  // GET === 0 in @nestjs/common RequestMethod
  assert.equal(R.getMetadata('path', QuotesController.prototype.findOne), ':id');
  assert.equal(R.getMetadata('method', QuotesController.prototype.findOne), 0);
  assert.equal(R.getMetadata('path', QuotesController.prototype.findOneFinanceDetail), ':id/finance-detail');
  assert.equal(R.getMetadata('method', QuotesController.prototype.findOneFinanceDetail), 0);
  assert.equal(R.getMetadata('path', QuotesController.prototype.findOneOperational), ':id/operational');
  assert.equal(R.getMetadata('method', QuotesController.prototype.findOneOperational), 0);
});
