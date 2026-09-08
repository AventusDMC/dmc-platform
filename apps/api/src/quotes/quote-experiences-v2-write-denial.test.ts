import assert = require('node:assert/strict');
import test = require('node:test');
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { QuoteExperiencesV2Controller } from './quote-experiences-v2.controller';
const { ROLES_KEY } = require('../auth/auth.decorators');

// CP-N4e — fail-closed authorization for the GENERIC V2 Experience item create + remove
// handlers and their preview handlers.
//
// Before CP-N4e these four handlers carried only @Roles('admin','operations','finance')
// with no explicit assertion, so the coalescing RolesGuard admitted `agent_admin`
// (via @Roles('admin')) into item create/remove and the signed create/remove PREVIEW
// tokens. CP-N4e adds an explicit fail-closed assertion as the FIRST statement of each
// handler, on the ORIGINAL actor (before actor conversion / flag / service / db / token),
// authoritative over the coalescing guard.
//
//   Generic create + remove (+ their previews) → admin / super_admin / operations / finance
//
// The narrower external_package (create/edit) and meal cost-override gates stay in the
// SERVICE (cost-visible roles only) and are NOT touched here. Synthetic actors only; the
// service is a spy so a denied handler proves ZERO service calls / no token / no result.

const ALLOWED = ['admin', 'super_admin', 'operations', 'finance'] as const;
const DENIED = ['viewer', 'agent', 'agent_admin', 'some-unknown-future-role', undefined] as const;

function makeActor(role: string | undefined, companyId = 'dmc-company') {
  // role === undefined models the "missing role" fail-closed case.
  return (role === undefined ? { id: 'u1', companyId } : { id: 'u1', companyId, role }) as any;
}

// Spy service: any reached method records a call and returns a sentinel token/result, so a
// denied caller that receives 403 provably got NO token and NO mutation result. Optionally
// throws feature_disabled to prove denial precedes the flag check.
function createController(opts: { featureDisabled?: boolean } = {}) {
  const calls = { total: 0, byMethod: {} as Record<string, number> };
  const impl = (name: string, sentinel: any) => async () => {
    calls.total += 1;
    calls.byMethod[name] = (calls.byMethod[name] ?? 0) + 1;
    if (opts.featureDisabled) {
      throw new BadRequestException({ code: 'feature_disabled', message: 'Quote item create is not enabled.' });
    }
    return sentinel;
  };
  const service: any = {
    previewActivityItem: impl('previewActivityItem', { previewToken: 'CREATE_TOKEN', itemType: 'activity' }),
    addActivityItem: impl('addActivityItem', { id: 'new-item', itemType: 'activity' }),
    previewRemoveItem: impl('previewRemoveItem', { previewToken: 'REMOVE_TOKEN' }),
    removeExperienceItem: impl('removeExperienceItem', { id: 'removed-item' }),
  };
  return { controller: new QuoteExperiencesV2Controller(service), calls };
}

// The four generic handlers + how to invoke them + the service method each must reach.
const HANDLERS: Array<{ name: string; serviceMethod: string; invoke: (c: any, actor: any) => Promise<any> }> = [
  { name: 'previewItem', serviceMethod: 'previewActivityItem', invoke: (c, a) => c.previewItem('q1', { itemType: 'activity' }, a) },
  { name: 'addItem', serviceMethod: 'addActivityItem', invoke: (c, a) => c.addItem('q1', { itemType: 'activity' }, a) },
  { name: 'removeItemPreview', serviceMethod: 'previewRemoveItem', invoke: (c, a) => c.removeItemPreview('q1', 'i1', a) },
  { name: 'removeItem', serviceMethod: 'removeExperienceItem', invoke: (c, a) => c.removeItem('q1', 'i1', {}, a) },
];

for (const h of HANDLERS) {
  for (const role of DENIED) {
    test(`CP-N4e ${h.name}: denied role "${role ?? '(missing)'}" → 403 with zero service calls, no token, no result`, async () => {
      const { controller, calls } = createController();
      let returned: any = 'UNSET';
      await assert.rejects(
        async () => {
          returned = await h.invoke(controller, makeActor(role));
        },
        ForbiddenException,
        `${role ?? '(missing)'} must be 403`,
      );
      assert.equal(calls.total, 0, `${role ?? '(missing)'} must not reach any service method`);
      assert.equal(returned, 'UNSET', `${role ?? '(missing)'} must receive no token/result`);
    });

    test(`CP-N4e ${h.name}: denied role "${role ?? '(missing)'}" is stopped BEFORE the feature-flag check`, async () => {
      // Even with a service that throws feature_disabled, a denied caller gets 403
      // (ForbiddenException), never feature_disabled — proving the gate runs first.
      const { controller, calls } = createController({ featureDisabled: true });
      await assert.rejects(
        async () => {
          await h.invoke(controller, makeActor(role));
        },
        (err: any) => err instanceof ForbiddenException,
        `${role ?? '(missing)'} must get 403 (not feature_disabled)`,
      );
      assert.equal(calls.total, 0, `${role ?? '(missing)'} must not reach the service or its flag check`);
    });
  }

  for (const role of ALLOWED) {
    test(`CP-N4e ${h.name}: allowed role "${role}" delegates to the service unchanged`, async () => {
      const { controller, calls } = createController();
      const res = await h.invoke(controller, makeActor(role));
      assert.equal(calls.total, 1, `${role} should make exactly one service call`);
      assert.equal(calls.byMethod[h.serviceMethod], 1, `${role} should reach ${h.serviceMethod}`);
      assert.ok(res, `${role} should receive the service result`);
    });

    test(`CP-N4e ${h.name}: allowed role "${role}" still hits the flag path (feature_disabled propagates)`, async () => {
      // Allowed roles pass the gate and reach the service, so a service-level
      // feature_disabled (flag OFF) still surfaces unchanged — the gate does not alter it.
      const { controller } = createController({ featureDisabled: true });
      await assert.rejects(
        async () => {
          await h.invoke(controller, makeActor(role));
        },
        (err: any) => err instanceof BadRequestException && (err.getResponse() as any)?.code === 'feature_disabled',
        `${role} must reach the service and receive the unchanged feature_disabled`,
      );
    });
  }
}

// agent_admin is the specific coalescing case CP-N4e closes — assert it explicitly on all four.
for (const h of HANDLERS) {
  test(`CP-N4e ${h.name}: agent_admin (RolesGuard-coalesced to admin) is denied 403 before service`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(async () => {
      await h.invoke(controller, makeActor('agent_admin'));
    }, ForbiddenException);
    assert.equal(calls.total, 0);
  });
}

// @Roles metadata is aligned with the allowlist (super_admin explicit; agent_admin/viewer absent).
test('CP-N4e: @Roles metadata on the four generic handlers matches the allowlist', () => {
  for (const h of HANDLERS) {
    const roles = (Reflect as any).getMetadata(ROLES_KEY, (QuoteExperiencesV2Controller.prototype as any)[h.name]);
    assert.deepEqual(roles, ['admin', 'super_admin', 'operations', 'finance'], `${h.name} @Roles must be the allowlist`);
    assert.equal(roles.includes('agent_admin'), false, `${h.name} must not list agent_admin`);
    assert.equal(roles.includes('viewer'), false, `${h.name} must not list viewer`);
  }
});

test('CP-N4e: routes keep their paths + methods (no route/shape change)', () => {
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuoteExperiencesV2Controller.prototype.previewItem), 'item/preview');
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuoteExperiencesV2Controller.prototype.addItem), 'item');
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuoteExperiencesV2Controller.prototype.removeItemPreview), 'item/:itemId/remove/preview');
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuoteExperiencesV2Controller.prototype.removeItem), 'item/:itemId');
});

// The generic gate covers ALL FIVE experience types (create) — an operations actor reaching
// the service (allowed) does NOT weaken the service's external_package / meal cost gates,
// which stay finance-only in the service; and the external-package EDIT routes keep their
// own narrower @Roles('admin','finance'). These are asserted structurally here; the actual
// cost-gate enforcement is covered by the unchanged service tests.
test('CP-N4e: external-package EDIT routes keep the narrower @Roles(admin,finance); generic gate is not applied to them', () => {
  const src = readFileSync(join(__dirname, 'quote-experiences-v2.controller.ts'), 'utf8');
  // Edit-preview + edit both keep the finance-only route metadata.
  assert.equal(src.split("@Roles('admin', 'finance')").length - 1, 2, 'both external-package edit routes keep admin/finance');
  // The generic gate is invoked exactly on the four generic handlers, never on the edit handlers.
  assert.equal(src.split('this.assertExperienceItemWriteAccess(actor);').length - 1, 4, 'gate applied to exactly the four generic handlers');
  // The service still receives the actor role (so its external_package/meal cost gates can fire).
  assert.ok(src.includes('role: actor.role ?? null'), 'controller still forwards the actor role to the service');
});
