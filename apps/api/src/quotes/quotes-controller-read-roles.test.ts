import assert = require('node:assert/strict');
import test = require('node:test');
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuotesController } from './quotes.controller';

// CP-N3a′: explicit internal-role allowlist on the generic quote read endpoints
// (GET /quotes, GET /quotes/:id). Synthetic actors/quotes only — no real data.
const ALLOWED = ['admin', 'super_admin', 'finance', 'operations', 'viewer'] as const;
const DENIED = ['agent', 'agent_admin', 'some-unknown-future-role'] as const;

function makeActor(role: string | undefined, companyId = 'dmc-company') {
  // role === undefined models the "missing role" fail-closed case.
  return (role === undefined ? { id: 'user-1', companyId } : { id: 'user-1', companyId, role }) as any;
}

function createController() {
  const calls = { findAll: 0, findOne: 0, lastActor: null as any };
  const quotesService: any = {
    findAll: async (actor: any) => {
      calls.findAll += 1;
      calls.lastActor = actor;
      // A quote whose clientCompanyId differs from the actor's companyId — the
      // intentional multi-company contract (managed client company != DMC tenant).
      return [{ id: 'quote-1', clientCompanyId: 'client-company' }];
    },
    findOne: async (id: string, actor: any) => {
      calls.findOne += 1;
      calls.lastActor = actor;
      return { id, clientCompanyId: 'client-company' };
    },
  };
  const controller = new QuotesController(quotesService, {} as any);
  return { controller, calls };
}

for (const role of ALLOWED) {
  test(`CP-N3a'/CP-N3b2c2c: allowed role "${role}" reaches the LIST; raw detail is retired (404 before service)`, async () => {
    const { controller, calls } = createController();
    const list: any = await controller.findAll(makeActor(role));
    assert.equal(calls.findAll, 1);
    assert.equal(list[0].id, 'quote-1');
    // CP-N3b2c2c: raw GET /quotes/:id is retired — 404 for every role before findOne.
    await assert.rejects(() => controller.findOne('quote-1', makeActor(role)), NotFoundException);
    assert.equal(calls.findOne, 0);
  });
}

for (const role of DENIED) {
  test(`CP-N3a': denied role "${role}" is rejected from the list and never invokes the quote service`, async () => {
    const { controller, calls } = createController();
    // findAll is a sync method that throws before returning the service promise.
    assert.throws(() => controller.findAll(makeActor(role)), ForbiddenException);
    // CP-N3b2c2c: raw detail is retired — 404 for every role (denied included) before findOne.
    await assert.rejects(() => controller.findOne('quote-1', makeActor(role)), NotFoundException);
    assert.equal(calls.findAll, 0);
    assert.equal(calls.findOne, 0);
  });
}

test(`CP-N3a': missing role fails closed without invoking the service (list 403, raw detail 404)`, async () => {
  const { controller, calls } = createController();
  assert.throws(() => controller.findAll(makeActor(undefined)), ForbiddenException);
  await assert.rejects(() => controller.findOne('quote-1', makeActor(undefined)), NotFoundException);
  assert.equal(calls.findAll, 0);
  assert.equal(calls.findOne, 0);
});

test(`CP-N3a': internal role still reads a LIST quote whose clientCompanyId differs from actor.companyId (no tenant filter added)`, async () => {
  const { controller, calls } = createController();
  const actor = makeActor('operations', 'dmc-company');
  const list: any = await controller.findAll(actor);
  assert.equal(list[0].clientCompanyId, 'client-company');
  assert.notEqual(list[0].clientCompanyId, actor.companyId);
  // CP-N3b2c2c: raw detail retired — 404 before findOne (no detail service call).
  await assert.rejects(() => controller.findOne('quote-1', actor), NotFoundException);
  assert.equal(calls.findOne, 0);
  // The LIST service received only the actor, unchanged — no injected where/tenant predicate.
  assert.equal(calls.lastActor.companyId, 'dmc-company');
  assert.equal('where' in (calls.lastActor as Record<string, unknown>), false);
});

test(`CP-N3b2c2c: raw detail is retired — every role gets 404 before the service (no pass-through)`, async () => {
  const { controller, calls } = createController();
  await assert.rejects(() => controller.findOne('quote-1', makeActor('viewer')), NotFoundException);
  await assert.rejects(() => controller.findOne('quote-1', makeActor('admin')), NotFoundException);
  assert.equal(calls.findOne, 0);
});
