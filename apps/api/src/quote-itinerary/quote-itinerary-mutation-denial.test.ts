import assert = require('node:assert/strict');
import test = require('node:test');
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { QuoteItineraryController } from './quote-itinerary.controller';
import { QuoteItineraryV2Controller } from './quote-itinerary-v2.controller';
const { ROLES_KEY } = require('../auth/auth.decorators');

// CP-N4d — itinerary mutation role gates (controller-boundary denial suite).
//
// Before CP-N4d, the LEGACY quote-itinerary mutation handlers carried only
// @Roles('admin','viewer','finance') with NO explicit assertion, so the coalescing
// roles.guard admitted `viewer` (read-only) and `agent_admin` (coalesced to 'admin')
// into itinerary mutations; the V2 handlers carried @Roles('admin','operations') and
// likewise admitted `agent_admin`. CP-N4d adds an explicit fail-closed assertion as
// the FIRST statement of each mutation handler, authoritative over the coalescing
// guard, on the ORIGINAL actor (before the reduced service-actor conversion).
//
//   LEGACY writes → admin / super_admin / finance   (QUOTE_WRITE_ROLES)
//   V2 writes     → admin / super_admin / operations (QUOTE_OPERATIONAL_WRITE_ROLES)
//
// Synthetic actors only — no real data, no DB. These tests invoke the handlers
// DIRECTLY (bypassing the guard) to prove the in-handler assertion cannot be bypassed.

const LEGACY_ALLOWED = ['admin', 'super_admin', 'finance'] as const;
const LEGACY_DENIED = ['operations', 'viewer', 'agent', 'agent_admin', 'some-unknown-future-role', undefined] as const;
const V2_ALLOWED = ['admin', 'super_admin', 'operations'] as const;
const V2_DENIED = ['finance', 'viewer', 'agent', 'agent_admin', 'some-unknown-future-role', undefined] as const;

// Read gates (regression — unchanged by CP-N4d).
const READ_COST_VISIBLE = ['admin', 'super_admin', 'finance'] as const;
const READ_INTERNAL = ['admin', 'super_admin', 'finance', 'operations', 'viewer'] as const;
const READ_DENIED = ['agent', 'agent_admin', 'some-unknown-future-role', undefined] as const;

function makeActor(role: string | undefined, companyId = 'dmc-company') {
  // role === undefined models the "missing role" fail-closed case.
  return (role === undefined ? { id: 'user-1', companyId } : { id: 'user-1', companyId, role }) as any;
}

// ---------------------------------------------------------------------------
// LEGACY controller — service spy counts EVERY method a mutation handler may call.
// ---------------------------------------------------------------------------
function createLegacy() {
  const calls = { total: 0, byMethod: {} as Record<string, number>, lastArgs: null as any };
  const spy = (name: string) => async (...args: any[]) => {
    calls.total += 1;
    calls.byMethod[name] = (calls.byMethod[name] ?? 0) + 1;
    calls.lastArgs = args;
    return { ok: name };
  };
  const service: any = {
    createDay: spy('createDay'),
    updateDay: spy('updateDay'),
    removeDay: spy('removeDay'),
    createDayItem: spy('createDayItem'),
    updateDayItem: spy('updateDayItem'),
    removeDayItem: spy('removeDayItem'),
    setDayPois: spy('setDayPois'),
    applyTailorMadeDraft: spy('applyTailorMadeDraft'),
    // Read paths (regression).
    findByQuoteId: spy('findByQuoteId'),
  };
  return { controller: new QuoteItineraryController(service), calls };
}

// Each legacy mutation handler + how to invoke it, and the service method it must reach.
const LEGACY_MUTATIONS: Array<{ name: string; serviceMethod: string; invoke: (c: any, actor: any) => Promise<any> }> = [
  { name: 'createDay', serviceMethod: 'createDay', invoke: (c, a) => c.createDay('quote-1', { dayNumber: 1, title: 'D1' }, a) },
  { name: 'updateDay', serviceMethod: 'updateDay', invoke: (c, a) => c.updateDay('day-1', { title: 'D1' }, a) },
  { name: 'removeDay', serviceMethod: 'removeDay', invoke: (c, a) => c.removeDay('day-1', a) },
  { name: 'createDayItem', serviceMethod: 'createDayItem', invoke: (c, a) => c.createDayItem('day-1', { quoteServiceId: 'qs-1' }, a) },
  { name: 'updateDayItem', serviceMethod: 'updateDayItem', invoke: (c, a) => c.updateDayItem('day-1', 'item-1', { quoteServiceId: 'qs-1' }, a) },
  { name: 'removeDayItem', serviceMethod: 'removeDayItem', invoke: (c, a) => c.removeDayItem('day-1', 'item-1', a) },
  { name: 'setDayPois', serviceMethod: 'setDayPois', invoke: (c, a) => c.setDayPois('day-1', { assignments: [] }, a) },
  { name: 'applyTailorMadeDraft', serviceMethod: 'applyTailorMadeDraft', invoke: (c, a) => c.applyTailorMadeDraft('quote-1', {}, a) },
];

for (const m of LEGACY_MUTATIONS) {
  for (const role of LEGACY_ALLOWED) {
    test(`legacy ${m.name}: allowed role "${role}" delegates to the service unchanged`, async () => {
      const { controller, calls } = createLegacy();
      const res = await m.invoke(controller, makeActor(role));
      assert.deepEqual(res, { ok: m.serviceMethod }, `${role} should receive the service result`);
      assert.equal(calls.total, 1, `${role} should make exactly one service call`);
      assert.equal(calls.byMethod[m.serviceMethod], 1, `${role} should reach ${m.serviceMethod}`);
    });
  }

  for (const role of LEGACY_DENIED) {
    test(`legacy ${m.name}: denied role "${role ?? '(missing)'}" → 403 with zero service calls`, async () => {
      const { controller, calls } = createLegacy();
      await assert.rejects(
        async () => {
          await m.invoke(controller, makeActor(role));
        },
        ForbiddenException,
        `${role ?? '(missing)'} must be 403`,
      );
      assert.equal(calls.total, 0, `${role ?? '(missing)'} must not reach any service method`);
    });
  }
}

// ---------------------------------------------------------------------------
// V2 controller — service spy for addDay / editDay / deleteDay.
// ---------------------------------------------------------------------------
function createV2(overrides: Record<string, any> = {}) {
  const calls = { total: 0, byMethod: {} as Record<string, number> };
  const spy = (name: string) => async () => {
    calls.total += 1;
    calls.byMethod[name] = (calls.byMethod[name] ?? 0) + 1;
    return { ok: name };
  };
  const service: any = {
    addDay: overrides.addDay ?? spy('addDay'),
    editDay: overrides.editDay ?? spy('editDay'),
    deleteDay: overrides.deleteDay ?? spy('deleteDay'),
  };
  return { controller: new QuoteItineraryV2Controller(service), calls };
}

const V2_MUTATIONS: Array<{ name: string; serviceMethod: string; invoke: (c: any, actor: any) => Promise<any> }> = [
  { name: 'addDay', serviceMethod: 'addDay', invoke: (c, a) => c.addDay('quote-1', { title: 'D1' }, a) },
  { name: 'editDay', serviceMethod: 'editDay', invoke: (c, a) => c.editDay('quote-1', 'day-1', { title: 'D1' }, a) },
  { name: 'deleteDay', serviceMethod: 'deleteDay', invoke: (c, a) => c.deleteDay('quote-1', 'day-1', a) },
];

for (const m of V2_MUTATIONS) {
  for (const role of V2_ALLOWED) {
    test(`v2 ${m.name}: allowed role "${role}" delegates to the service unchanged`, async () => {
      const { controller, calls } = createV2();
      const res = await m.invoke(controller, makeActor(role));
      assert.deepEqual(res, { ok: m.serviceMethod }, `${role} should receive the service result`);
      assert.equal(calls.total, 1, `${role} should make exactly one service call`);
      assert.equal(calls.byMethod[m.serviceMethod], 1, `${role} should reach ${m.serviceMethod}`);
    });
  }

  for (const role of V2_DENIED) {
    test(`v2 ${m.name}: denied role "${role ?? '(missing)'}" → 403 with zero service calls`, async () => {
      const { controller, calls } = createV2();
      await assert.rejects(
        async () => {
          await m.invoke(controller, makeActor(role));
        },
        ForbiddenException,
        `${role ?? '(missing)'} must be 403`,
      );
      assert.equal(calls.total, 0, `${role ?? '(missing)'} must not reach the service (nor the feature-flag check)`);
    });
  }
}

// V2 feature-flag behavior is UNCHANGED for allowed actors: the gate runs first but
// does not alter the flag path — an allowed actor still reaches the service, and a
// service-level feature_disabled (thrown when QUOTE_ITINERARY_EDIT is OFF) propagates
// verbatim. A denied actor is stopped BEFORE the service, so it never hits the flag.
test('v2 addDay: allowed actor still reaches the flag path (feature_disabled propagates unchanged)', async () => {
  const featureDisabled = async () => {
    throw new BadRequestException({ code: 'feature_disabled', message: 'Quote itinerary editing is not enabled.' });
  };
  const { controller } = createV2({ addDay: featureDisabled });
  await assert.rejects(
    async () => {
      await controller.addDay('quote-1', { title: 'D1' }, makeActor('admin'));
    },
    (err: any) => {
      const body = err instanceof BadRequestException ? (err.getResponse() as any) : null;
      return body?.code === 'feature_disabled';
    },
    'allowed actor must reach the service and receive the unchanged feature_disabled response',
  );
});

test('v2 addDay: denied actor is stopped before the flag check (feature_disabled never reached)', async () => {
  const featureDisabled = async () => {
    throw new BadRequestException({ code: 'feature_disabled' });
  };
  const { controller } = createV2({ addDay: featureDisabled });
  await assert.rejects(
    async () => {
      await controller.addDay('quote-1', { title: 'D1' }, makeActor('finance'));
    },
    ForbiddenException,
    'denied actor must get 403 (not feature_disabled) because the gate runs before the flag',
  );
});

// ---------------------------------------------------------------------------
// @Roles metadata is consistent with the explicit allowlists (no widening).
// ---------------------------------------------------------------------------
test('legacy @Roles metadata matches the allowlist (no viewer; super_admin explicit)', () => {
  for (const m of LEGACY_MUTATIONS) {
    const roles = (Reflect as any).getMetadata(ROLES_KEY, (QuoteItineraryController.prototype as any)[m.name]);
    assert.deepEqual(roles, ['admin', 'super_admin', 'finance'], `${m.name} @Roles must be admin/super_admin/finance`);
    assert.equal(roles.includes('viewer'), false, `${m.name} must not list viewer`);
    assert.equal(roles.includes('operations'), false, `${m.name} must not list operations`);
  }
});

test('v2 @Roles metadata matches the allowlist (admin/super_admin/operations)', () => {
  for (const m of V2_MUTATIONS) {
    const roles = (Reflect as any).getMetadata(ROLES_KEY, (QuoteItineraryV2Controller.prototype as any)[m.name]);
    assert.deepEqual(roles, ['admin', 'super_admin', 'operations'], `${m.name} @Roles must be admin/super_admin/operations`);
    assert.equal(roles.includes('viewer'), false, `${m.name} must not list viewer`);
    assert.equal(roles.includes('finance'), false, `${m.name} must not list finance`);
  }
});

test('v2 routes keep their paths', () => {
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuoteItineraryV2Controller.prototype.addDay), 'day');
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuoteItineraryV2Controller.prototype.editDay), 'day/:dayId');
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuoteItineraryV2Controller.prototype.deleteDay), 'day/:dayId');
});

// ---------------------------------------------------------------------------
// Regression: existing raw / operational itinerary READ gates remain intact.
// ---------------------------------------------------------------------------
for (const role of READ_COST_VISIBLE) {
  test(`read regression: raw itinerary allows cost-visible role "${role}"`, async () => {
    const { controller, calls } = createLegacy();
    await controller.findByQuoteId('quote-1', makeActor(role));
    assert.equal(calls.byMethod['findByQuoteId'], 1, `${role} should reach findByQuoteId`);
  });
}
for (const role of ['operations', 'viewer', ...READ_DENIED] as const) {
  test(`read regression: raw itinerary denies non-cost-visible role "${role ?? '(missing)'}" with zero service calls`, async () => {
    const { controller, calls } = createLegacy();
    await assert.rejects(async () => {
      await controller.findByQuoteId('quote-1', makeActor(role));
    }, ForbiddenException);
    assert.equal(calls.total, 0);
  });
}
for (const role of READ_INTERNAL) {
  test(`read regression: operational itinerary allows internal role "${role}"`, async () => {
    const { controller, calls } = createLegacy();
    await controller.findOperationalByQuoteId('quote-1', makeActor(role));
    assert.equal(calls.byMethod['findByQuoteId'], 1, `${role} should reach the underlying read`);
  });
}
for (const role of READ_DENIED) {
  test(`read regression: operational itinerary denies role "${role ?? '(missing)'}" with zero service calls`, async () => {
    const { controller, calls } = createLegacy();
    await assert.rejects(async () => {
      await controller.findOperationalByQuoteId('quote-1', makeActor(role));
    }, ForbiddenException);
    assert.equal(calls.total, 0);
  });
}
