import assert = require('node:assert/strict');
import test = require('node:test');
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuotesController } from './quotes.controller';

// CP-N3b2c1 — Secondary Raw-Route Gates (quotes.controller).
//
// Fail-closed allowlist gates on the RAW passenger + rooming reads, asserted BEFORE
// any service call. Synthetic actors/quotes only — no real data.
//
//   GET /quotes/:id/passengers  → admin, super_admin, operations (PII_FULL_ROLES)
//   GET /quotes/:id/rooming     → admin, super_admin only
//
// The raw main detail (findOne) and the operational companions are intentionally
// left untouched and are re-verified here as regressions.

const PASSENGERS_ALLOWED = ['admin', 'super_admin', 'operations'] as const;
const PASSENGERS_DENIED = ['finance', 'viewer', 'agent', 'agent_admin', 'some-unknown-future-role'] as const;

const ROOMING_ALLOWED = ['admin', 'super_admin'] as const;
const ROOMING_DENIED = ['finance', 'operations', 'viewer', 'agent', 'agent_admin', 'some-unknown-future-role'] as const;

// The five internal read roles keep operational-companion + raw-main access.
const INTERNAL_READ = ['admin', 'super_admin', 'finance', 'operations', 'viewer'] as const;

// Sentinel service payloads: rich enough to prove verbatim raw pass-through, and
// shaped so the operational mappers still project them without error.
const RAW_PASSENGERS = [
  { id: 'p1', firstName: 'Alice', lastName: 'Roe', passportNumber: 'SENTINEL_PASSPORT', dateOfBirth: '1990-01-01' },
];
const RAW_ROOMING = [
  { id: 'g1', pricingDescription: 'SENTINEL_PRICING_NOTE', occupancyType: 'double', assignments: [] as any[] },
];

function makeActor(role: string | undefined, companyId = 'dmc-company') {
  // role === undefined models the "missing role" fail-closed case.
  return (role === undefined ? { id: 'user-1', companyId } : { id: 'user-1', companyId, role }) as any;
}

function createController() {
  const calls = { findOne: 0, findPassengers: 0, findRoomingGroups: 0, lastActor: null as any };
  const quotesService: any = {
    findOne: async (id: string, actor: any) => {
      calls.findOne += 1;
      calls.lastActor = actor;
      return { id, clientCompanyId: 'client-company' };
    },
    findPassengers: async (_id: string, actor: any) => {
      calls.findPassengers += 1;
      calls.lastActor = actor;
      return RAW_PASSENGERS;
    },
    findRoomingGroups: async (_id: string, actor: any) => {
      calls.findRoomingGroups += 1;
      calls.lastActor = actor;
      return RAW_ROOMING;
    },
  };
  const controller = new QuotesController(quotesService, {} as any);
  return { controller, calls };
}

// ---------------------------------------------------------------------------
// RAW passengers gate
// ---------------------------------------------------------------------------
for (const role of PASSENGERS_ALLOWED) {
  test(`raw passengers: allowed role "${role}" reaches the service with unchanged pass-through`, async () => {
    const { controller, calls } = createController();
    const res: any = await controller.findPassengers('quote-1', makeActor(role));
    assert.equal(calls.findOne, 1);
    assert.equal(calls.findPassengers, 1);
    // Verbatim pass-through — the gate does not project or strip the raw PII.
    assert.deepEqual(res, RAW_PASSENGERS);
    // No tenant predicate injected: the service saw exactly the actor.
    assert.equal(calls.lastActor.companyId, 'dmc-company');
    assert.equal('where' in (calls.lastActor as Record<string, unknown>), false);
  });
}

for (const role of PASSENGERS_DENIED) {
  test(`raw passengers: denied role "${role}" gets 403 before any service call`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(() => controller.findPassengers('quote-1', makeActor(role)), ForbiddenException);
    assert.equal(calls.findOne, 0);
    assert.equal(calls.findPassengers, 0);
  });
}

test('raw passengers: missing role fails closed before any service call', async () => {
  const { controller, calls } = createController();
  await assert.rejects(() => controller.findPassengers('quote-1', makeActor(undefined)), ForbiddenException);
  assert.equal(calls.findOne, 0);
  assert.equal(calls.findPassengers, 0);
});

// ---------------------------------------------------------------------------
// RAW rooming gate
// ---------------------------------------------------------------------------
for (const role of ROOMING_ALLOWED) {
  test(`raw rooming: allowed role "${role}" reaches the service with unchanged pass-through`, async () => {
    const { controller, calls } = createController();
    const res: any = await controller.findRoomingGroups('quote-1', makeActor(role));
    assert.equal(calls.findOne, 1);
    assert.equal(calls.findRoomingGroups, 1);
    assert.deepEqual(res, RAW_ROOMING);
    assert.equal(calls.lastActor.companyId, 'dmc-company');
    assert.equal('where' in (calls.lastActor as Record<string, unknown>), false);
  });
}

for (const role of ROOMING_DENIED) {
  test(`raw rooming: denied role "${role}" gets 403 before any service call`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(() => controller.findRoomingGroups('quote-1', makeActor(role)), ForbiddenException);
    assert.equal(calls.findOne, 0);
    assert.equal(calls.findRoomingGroups, 0);
  });
}

test('raw rooming: missing role fails closed before any service call', async () => {
  const { controller, calls } = createController();
  await assert.rejects(() => controller.findRoomingGroups('quote-1', makeActor(undefined)), ForbiddenException);
  assert.equal(calls.findOne, 0);
  assert.equal(calls.findRoomingGroups, 0);
});

// ---------------------------------------------------------------------------
// Regression: operational companions remain open to every internal-read role,
// including the ones now DENIED on the raw counterpart (finance/viewer for
// passengers; finance/operations/viewer for rooming).
// ---------------------------------------------------------------------------
for (const role of INTERNAL_READ) {
  test(`operational passengers companion still reached by internal role "${role}"`, async () => {
    const { controller, calls } = createController();
    const res: any = await controller.findOperationalPassengers('quote-1', makeActor(role));
    assert.equal(calls.findPassengers, 1);
    // Name-only projection — never the raw findOne main gate here.
    assert.deepEqual(res, [{ id: 'p1', firstName: 'Alice', lastName: 'Roe' }]);
  });

  test(`operational rooming companion still reached by internal role "${role}"`, async () => {
    const { controller, calls } = createController();
    const res: any = await controller.findOperationalRooming('quote-1', makeActor(role));
    assert.equal(calls.findRoomingGroups, 1);
    assert.equal(Array.isArray(res), true);
    // The internal pricing note never survives the operational projection.
    assert.equal(JSON.stringify(res).includes('SENTINEL_PRICING_NOTE'), false);
  });
}

// ---------------------------------------------------------------------------
// CP-N3b2c2c: the RAW main detail (findOne) is now RETIRED fail-closed — 404 for
// every role before any service call (cost-visible roles use /finance-detail,
// non-finance internal roles use /operational). This supersedes the CP-N3b2c1
// "still open" regression.
// ---------------------------------------------------------------------------
for (const role of INTERNAL_READ) {
  test(`raw main detail (findOne) is retired — 404 before service for internal role "${role}"`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(() => controller.findOne('quote-1', makeActor(role)), NotFoundException);
    assert.equal(calls.findOne, 0);
  });
}
