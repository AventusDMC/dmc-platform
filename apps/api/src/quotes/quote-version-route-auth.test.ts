import assert = require('node:assert/strict');
import test = require('node:test');
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuotesController } from './quotes.controller';

// CP-N3b2c3a — generic quote-version route authorization hardening + create-response
// projection. Synthetic actors/quotes only. The version-lifecycle handlers are
// restricted to admin/super_admin/finance/viewer (agent_admin — which the coalescing
// @Roles guard would admit — plus operations/agent/missing/unknown/future fail closed
// BEFORE any service call). The POST /versions response is projected to metadata only.
//
// CP-N3b2c3c UPDATE: the raw version-DETAIL route (findVersion) is now RETIRED — it
// returns an unconditional 404 for every role and no longer participates in the
// allowlist matrix (it carries no @Roles and never calls a service). It is therefore
// excluded from HANDLERS below and covered by its own retirement assertions (test 9
// here + the dedicated quote-raw-version-detail-retired.test.ts). The remaining six
// lifecycle handlers keep their explicit allowlist behavior unchanged.

// CP-N4a UPDATE: strict read-only Viewer. Version READS stay open to Viewer; version
// WRITES (create / convert-to-booking / status) are now quote-write roles only and deny
// Viewer before any service call.
const READ_HANDLERS = ['findVersions', 'getVersionReadiness', 'findVersionSummary'] as const;
const WRITE_HANDLERS = ['createVersion', 'convertToBooking', 'updateStatus'] as const;
const READ_ALLOWED = ['admin', 'super_admin', 'finance', 'viewer'] as const;
const WRITE_ALLOWED = ['admin', 'super_admin', 'finance'] as const;
const READ_DENIED = ['operations', 'agent', 'agent_admin', 'some-unknown-future-role'] as const;
const WRITE_DENIED = ['viewer', 'operations', 'agent', 'agent_admin', 'some-unknown-future-role'] as const;

function makeActor(role: string | undefined) {
  return (role === undefined ? { id: 'u1', companyId: 'dmc' } : { id: 'u1', companyId: 'dmc', role }) as any;
}

// The raw QuoteVersion row a create would persist — carries sensitive fields that the
// projected response must NEVER serialize. All sensitive values are SENTINEL_-prefixed.
const CREATED_ROW = {
  id: 'v1', quoteId: 'q1', versionNumber: 3, label: 'My label', createdAt: '2026-01-01T00:00:00.000Z',
  snapshotJson: {
    booking: { accessToken: 'SENTINEL_ACCESS_TOKEN', snapshotJson: { x: 'SENTINEL_NESTED_SNAPSHOT' } },
    passengers: [{ passportNumber: 'SENTINEL_PASSPORT', dateOfBirth: 'SENTINEL_DOB' }],
    contact: { email: 'SENTINEL_EMAIL' },
    totalCost: 999, externalPackagePricingMatrixJson: 'SENTINEL_ARBITRARY_JSON',
    publicUrl: 'https://x/SENTINEL_CAPABILITY_URL',
  },
  accessToken: 'SENTINEL_ACCESS_TOKEN_TOP',
  futureRawColumn: 'SENTINEL_FUTURE',
};
const RAW_VERSION = { id: 'v1', quoteId: 'q1', versionNumber: 1, label: 'x', snapshotJson: { totalCost: 1 } };

function createController() {
  const calls = {
    total: 0, findOne: 0, findVersions: 0, getVersionReadiness: 0, createVersion: 0,
    findVersion: 0, getVersionSummary: 0, convertToBooking: 0, updateStatus: 0,
  };
  const quotesService: any = {
    findOne: async (id: string) => { calls.total += 1; calls.findOne += 1; return { id }; },
    findVersions: async () => { calls.total += 1; calls.findVersions += 1; return [{ id: 'v1', quoteId: 'q1', versionNumber: 1, label: null, createdAt: 'ts' }]; },
    getVersionReadiness: async () => { calls.total += 1; calls.getVersionReadiness += 1; return { versionCount: 1, hasSavedVersion: true }; },
    createVersion: async () => { calls.total += 1; calls.createVersion += 1; return CREATED_ROW; },
    findVersion: async () => { calls.total += 1; calls.findVersion += 1; return { ...RAW_VERSION }; },
    getVersionSummary: async () => { calls.total += 1; calls.getVersionSummary += 1; return { id: 'v1', title: 't', totalSell: 10, cost: { totalCost: 1, margin: 1, marginPercent: 10 } }; },
    convertToBooking: async () => { calls.total += 1; calls.convertToBooking += 1; return { bookingId: 'b1', status: 'confirmed' }; },
    updateStatus: async () => { calls.total += 1; calls.updateStatus += 1; return { id: 'q1', status: 'SENT' }; },
  };
  return { controller: new QuotesController(quotesService, {} as any), calls };
}

async function invoke(controller: any, name: string, actor: any) {
  switch (name) {
    case 'findVersions': return controller.findVersions('q1', actor);
    case 'getVersionReadiness': return controller.getVersionReadiness('q1', actor);
    case 'createVersion': return controller.createVersion('q1', { label: 'x' }, {}, actor);
    case 'findVersion': return controller.findVersion('q1', 'v1', actor);
    case 'findVersionSummary': return controller.findVersionSummary('q1', 'v1', actor);
    case 'convertToBooking': return controller.convertToBooking('q1', actor);
    case 'updateStatus': return controller.updateStatus('q1', { status: 'SENT' }, {}, actor);
    default: throw new Error(`unknown handler ${name}`);
  }
}

// 1. Version READ handlers allow admin/super_admin/finance/viewer (reach the service);
//    version WRITE handlers allow admin/super_admin/finance only (Viewer denied).
for (const handler of READ_HANDLERS) {
  for (const role of READ_ALLOWED) {
    test(`1. read "${handler}" allows role "${role}" (reaches service)`, async () => {
      const { controller, calls } = createController();
      await invoke(controller, handler, makeActor(role));
      assert.ok(calls.total >= 1, `${handler}/${role} should reach a service method`);
    });
  }
}
for (const handler of WRITE_HANDLERS) {
  for (const role of WRITE_ALLOWED) {
    test(`1. write "${handler}" allows role "${role}" (reaches service)`, async () => {
      const { controller, calls } = createController();
      await invoke(controller, handler, makeActor(role));
      assert.ok(calls.total >= 1, `${handler}/${role} should reach a service method`);
    });
  }
}

// 2. READ handlers reject operations/agent/agent_admin/missing/unknown/future; WRITE
//    handlers additionally reject viewer — all BEFORE any service call.
for (const handler of READ_HANDLERS) {
  for (const role of [...READ_DENIED, undefined]) {
    test(`2. read "${handler}" rejects role "${role ?? 'missing'}" before any service call`, async () => {
      const { controller, calls } = createController();
      await assert.rejects(() => invoke(controller, handler, makeActor(role)), ForbiddenException);
      assert.equal(calls.total, 0, `${handler}/${role ?? 'missing'} must not call any service method`);
    });
  }
}
for (const handler of WRITE_HANDLERS) {
  for (const role of [...WRITE_DENIED, undefined]) {
    test(`2. write "${handler}" rejects role "${role ?? 'missing'}" before any service call`, async () => {
      const { controller, calls } = createController();
      await assert.rejects(() => invoke(controller, handler, makeActor(role)), ForbiddenException);
      assert.equal(calls.total, 0, `${handler}/${role ?? 'missing'} must not call any service method`);
    });
  }
}

// 3. Version creation still calls the service once for each write-allowed role.
for (const role of WRITE_ALLOWED) {
  test(`3. createVersion calls the service exactly once for "${role}"`, async () => {
    const { controller, calls } = createController();
    await controller.createVersion('q1', { label: 'x' }, {}, makeActor(role));
    assert.equal(calls.createVersion, 1);
  });
}

// 4. Create response has EXACTLY the five approved metadata keys, with correct values.
test('4. createVersion response = exactly {id,quoteId,versionNumber,label,createdAt}', async () => {
  const { controller } = createController();
  const res: any = await controller.createVersion('q1', { label: 'x' }, {}, makeActor('admin'));
  assert.deepEqual(Object.keys(res).sort(), ['createdAt', 'id', 'label', 'quoteId', 'versionNumber']);
  assert.equal(res.id, 'v1');
  assert.equal(res.quoteId, 'q1');
  assert.equal(res.versionNumber, 3);
  assert.equal(res.label, 'My label');
  assert.equal(res.createdAt, '2026-01-01T00:00:00.000Z');
});

// 5. Recursive sentinel scan — no snapshot/token/PII/nested/arbitrary/capability-URL/future field survives.
test('5. createVersion response leaks no snapshotJson/accessToken/PII/nested/arbitrary/URL/future field', async () => {
  const { controller } = createController();
  const res: any = await controller.createVersion('q1', { label: 'x' }, {}, makeActor('finance'));
  const s = JSON.stringify(res);
  assert.equal(/SENTINEL_/.test(s), false, 'no SENTINEL_ value leaks');
  for (const k of ['snapshotJson', 'accessToken', 'passengers', 'contact', 'totalCost', 'futureRawColumn', 'externalPackagePricingMatrixJson', 'publicUrl']) {
    assert.equal(s.includes(k), false, `must not contain "${k}"`);
    assert.equal(k in res, false, `top-level "${k}" absent`);
  }
});

// 6. Builder V2's versionNumber consumer + Classic's response-ignored save flow remain
//    compatible for a write-allowed role (CP-N4a: viewer can no longer create versions).
test('6. create response exposes a numeric versionNumber (builder-v2 consumer) and is body-safe (Classic)', async () => {
  const { controller } = createController();
  const res: any = await controller.createVersion('q1', { label: 'x' }, {}, makeActor('finance'));
  assert.equal(typeof res.versionNumber, 'number');
  assert.equal(res.versionNumber, 3);
});

// 7. List remains metadata-only.
test('7. findVersions returns metadata-only rows (no snapshotJson)', async () => {
  const { controller } = createController();
  const list: any = await controller.findVersions('q1', makeActor('admin'));
  assert.deepEqual(Object.keys(list[0]).sort(), ['createdAt', 'id', 'label', 'quoteId', 'versionNumber']);
  assert.equal('snapshotJson' in list[0], false);
});

// 8. Summary remains unchanged (returned as-is from the cost-gated service).
test('8. findVersionSummary returns the service summary unchanged (incl. its cost block)', async () => {
  const { controller } = createController();
  const sum: any = await controller.findVersionSummary('q1', 'v1', makeActor('admin'));
  assert.equal(sum.title, 't');
  assert.deepEqual(sum.cost, { totalCost: 1, margin: 1, marginPercent: 10 });
});

// 9. Raw version detail is RETIRED (CP-N3b2c3c): 404 for every role, no service call.
test('9. findVersion is retired — 404 for every role, reaches no service method', async () => {
  for (const role of ['admin', 'super_admin', 'finance', 'viewer', 'operations', 'agent', 'agent_admin', 'some-unknown-future-role', undefined]) {
    const { controller, calls } = createController();
    await assert.rejects(
      () => (controller as any).findVersion('q1', 'v1', makeActor(role)),
      NotFoundException,
      `findVersion/${role ?? 'missing'} must 404`,
    );
    assert.equal(calls.total, 0, `findVersion/${role ?? 'missing'} must not call any service method`);
  }
});

// 10. Accepted-version status + booking conversion behavior unchanged for allowed roles.
test('10. updateStatus + convertToBooking return the service result unchanged for allowed roles', async () => {
  const { controller, calls } = createController();
  const status: any = await controller.updateStatus('q1', { status: 'SENT', acceptedVersionId: 'v1' }, {}, makeActor('admin'));
  assert.deepEqual(status, { id: 'q1', status: 'SENT' });
  const booking: any = await controller.convertToBooking('q1', makeActor('admin'));
  assert.deepEqual(booking, { bookingId: 'b1', status: 'confirmed' });
  assert.equal(calls.updateStatus, 1);
  assert.equal(calls.convertToBooking, 1);
});
