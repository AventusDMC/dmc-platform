import assert = require('node:assert/strict');
import test = require('node:test');
import { NotFoundException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { QuotesController } from './quotes.controller';
import { ROLES_KEY, IS_PUBLIC_KEY } from '../auth/auth.decorators';

// CP-N3b2c3c — the raw historical version-DETAIL route GET /quotes/:id/versions/:versionId
// is RETIRED. The route declaration is kept (the path still resolves) but the handler's
// first and only behavior is an unconditional 404: every authenticated role receives 404,
// no role reaches findVersion / findOne / snapshot loading / any other service call, no
// snapshot / token / PII / cost / supplier / note / arbitrary JSON is serialized, there is
// no redirect or fallback to /summary, and nothing is logged. The safe curated summary
// remains at GET /quotes/:id/versions/:versionId/summary. Synthetic actors/quotes only.

const ALL_ROLES = [
  'admin', 'super_admin', 'finance', 'viewer', 'operations', 'agent', 'agent_admin',
  'some-unknown-future-role',
] as const;

function makeActor(role: string | undefined) {
  return (role === undefined ? { id: 'u1', companyId: 'dmc' } : { id: 'u1', companyId: 'dmc', role }) as any;
}

// A service whose EVERY method is a tripwire: reaching any of them fails the test. The
// version rows carry SENTINEL_-prefixed sensitive values that must never surface.
function createTripwireController() {
  const calls = { total: 0 };
  const trip = (name: string) => async () => {
    calls.total += 1;
    throw new Error(`retired route must not call quotesService.${name}`);
  };
  const SENTINEL_ROW = {
    id: 'v1', quoteId: 'q1', versionNumber: 1, label: 'x', createdAt: 'ts',
    snapshotJson: {
      booking: { accessToken: 'SENTINEL_ACCESS_TOKEN', snapshotJson: { x: 'SENTINEL_NESTED_SNAPSHOT' } },
      passengers: [{ passportNumber: 'SENTINEL_PASSPORT' }],
      contact: { email: 'SENTINEL_EMAIL' },
      totalCost: 999, supplierName: 'SENTINEL_SUPPLIER', internalNotes: 'SENTINEL_NOTE',
      externalPackagePricingMatrixJson: 'SENTINEL_ARBITRARY_JSON',
      publicUrl: 'https://x/SENTINEL_CAPABILITY_URL',
    },
    accessToken: 'SENTINEL_ACCESS_TOKEN_TOP', futureRawColumn: 'SENTINEL_FUTURE',
  };
  const quotesService: any = {
    findOne: trip('findOne'),
    // findVersion is a tripwire that WOULD return the sentinel row if ever reached.
    findVersion: async () => { calls.total += 1; return SENTINEL_ROW; },
    findVersions: trip('findVersions'),
    getVersionReadiness: trip('getVersionReadiness'),
    createVersion: trip('createVersion'),
    getVersionSummary: trip('getVersionSummary'),
    convertToBooking: trip('convertToBooking'),
    updateStatus: trip('updateStatus'),
  };
  return { controller: new QuotesController(quotesService, {} as any), calls, SENTINEL_ROW };
}

// 1. + 2. Retired raw detail returns 404 for every role and reaches no service method.
for (const role of [...ALL_ROLES, undefined]) {
  test(`1/2. findVersion → 404 and no service call for role "${role ?? 'missing'}"`, async () => {
    const { controller, calls } = createTripwireController();
    await assert.rejects(
      () => (controller as any).findVersion('q1', 'v1', makeActor(role)),
      NotFoundException,
    );
    assert.equal(calls.total, 0, 'no service method may be reached');
  });
}

// 3. The retired handler carries NO @Roles metadata → route-level role metadata cannot
//    reject an authenticated role with a 403 before the handler's 404 runs.
test('3. findVersion has no @Roles metadata (no pre-handler 403 by role)', () => {
  const roles = (Reflect as any).getMetadata(ROLES_KEY, QuotesController.prototype.findVersion);
  assert.equal(roles, undefined, 'retired handler must not declare @Roles');
});

// 4. Global authentication is unchanged: the handler is NOT marked @Public, so the global
//    auth guard still applies (unauthenticated requests get the normal auth rejection).
test('4. findVersion is not @Public — global authentication still applies', () => {
  const isPublic = (Reflect as any).getMetadata(IS_PUBLIC_KEY, QuotesController.prototype.findVersion);
  assert.notEqual(isPublic, true, 'retired handler must not be public');
});

// 5. + 9. The safe /summary route resolves as a SEPARATE handler with its own path, and
//    still enforces its approved allowlist (reaches the service for an allowed role).
test('5/9. summary route is distinct (own path) and still serves approved roles', async () => {
  assert.equal(
    (Reflect as any).getMetadata(PATH_METADATA, QuotesController.prototype.findVersion),
    ':id/versions/:versionId',
  );
  assert.equal(
    (Reflect as any).getMetadata(PATH_METADATA, QuotesController.prototype.findVersionSummary),
    ':id/versions/:versionId/summary',
  );
  assert.notEqual(QuotesController.prototype.findVersion, QuotesController.prototype.findVersionSummary);

  let summaryReached = 0;
  const svc: any = {
    findOne: async () => ({ id: 'q1' }),
    getVersionSummary: async () => { summaryReached += 1; return { id: 'v1', title: 't', totalSell: 10 }; },
  };
  const controller = new QuotesController(svc, {} as any);
  const summary: any = await controller.findVersionSummary('q1', 'v1', makeActor('finance'));
  assert.equal(summaryReached, 1);
  assert.equal(summary.title, 't');
  assert.equal('snapshotJson' in summary, false);
});

// 6. The other six lifecycle handlers retain their explicit allowlist + denied-role
//    behavior (agent_admin — admitted by the coalescing @Roles guard — is rejected before
//    any service call by assertVersionRouteAccess).
const RETAINED_HANDLERS = [
  'findVersions', 'getVersionReadiness', 'createVersion',
  'findVersionSummary', 'convertToBooking', 'updateStatus',
] as const;

function invokeRetained(controller: any, name: string, actor: any) {
  switch (name) {
    case 'findVersions': return controller.findVersions('q1', actor);
    case 'getVersionReadiness': return controller.getVersionReadiness('q1', actor);
    case 'createVersion': return controller.createVersion('q1', { label: 'x' }, {}, actor);
    case 'findVersionSummary': return controller.findVersionSummary('q1', 'v1', actor);
    case 'convertToBooking': return controller.convertToBooking('q1', actor);
    case 'updateStatus': return controller.updateStatus('q1', { status: 'SENT' }, {}, actor);
    default: throw new Error(`unknown handler ${name}`);
  }
}

function retainedController() {
  const calls = { total: 0 };
  const bump = <T>(v: T) => { calls.total += 1; return v; };
  const quotesService: any = {
    findOne: async (id: string) => bump({ id }),
    findVersions: async () => bump([{ id: 'v1', quoteId: 'q1', versionNumber: 1, label: null, createdAt: 'ts' }]),
    getVersionReadiness: async () => bump({ versionCount: 1 }),
    createVersion: async () => bump({ id: 'v1', quoteId: 'q1', versionNumber: 3, label: 'My label', createdAt: 'ts', snapshotJson: { totalCost: 1 } }),
    getVersionSummary: async () => bump({ id: 'v1', title: 't' }),
    convertToBooking: async () => bump({ bookingId: 'b1', status: 'confirmed' }),
    updateStatus: async () => bump({ id: 'q1', status: 'SENT' }),
  };
  return { controller: new QuotesController(quotesService, {} as any), calls };
}

for (const handler of RETAINED_HANDLERS) {
  test(`6. "${handler}" still reaches the service for an allowed role (admin)`, async () => {
    const { controller, calls } = retainedController();
    await invokeRetained(controller, handler, makeActor('admin'));
    assert.ok(calls.total >= 1, `${handler} should reach the service for admin`);
  });
  test(`6. "${handler}" still rejects agent_admin before any service call`, async () => {
    const { controller, calls } = retainedController();
    // async wrapper: some handlers (e.g. the non-async updateStatus) throw the guard
    // synchronously; wrapping normalizes that to a rejection for assert.rejects.
    await assert.rejects(async () => invokeRetained(controller, handler, makeActor('agent_admin')));
    assert.equal(calls.total, 0, `${handler} must not reach the service for agent_admin`);
  });
}

// 7. Create response remains EXACTLY metadata-only (the five approved keys).
test('7. createVersion response = exactly {id,quoteId,versionNumber,label,createdAt}', async () => {
  const { controller } = retainedController();
  const res: any = await controller.createVersion('q1', { label: 'x' }, {}, makeActor('admin'));
  assert.deepEqual(Object.keys(res).sort(), ['createdAt', 'id', 'label', 'quoteId', 'versionNumber']);
  assert.equal('snapshotJson' in res, false);
});

// 8. Server-side persistence/accepted-version/conversion paths remain wired: create still
//    delegates to the service (snapshot persistence unchanged), and status/convert still
//    reach the service unchanged.
test('8. create persists via the service; status + convert still delegate to the service', async () => {
  const seen: string[] = [];
  const svc: any = {
    findOne: async () => ({ id: 'q1' }),
    createVersion: async () => { seen.push('createVersion'); return { id: 'v1', quoteId: 'q1', versionNumber: 3, label: 'l', createdAt: 'ts' }; },
    updateStatus: async () => { seen.push('updateStatus'); return { id: 'q1', status: 'SENT' }; },
    convertToBooking: async () => { seen.push('convertToBooking'); return { bookingId: 'b1', status: 'confirmed' }; },
  };
  const controller = new QuotesController(svc, {} as any);
  await controller.createVersion('q1', { label: 'l' }, {}, makeActor('admin'));
  await controller.updateStatus('q1', { status: 'SENT', acceptedVersionId: 'v1' }, {}, makeActor('admin'));
  await controller.convertToBooking('q1', makeActor('admin'));
  assert.deepEqual(seen, ['createVersion', 'updateStatus', 'convertToBooking']);
});

// 10. Recursive sentinel proof — because the retired route throws before findVersion is
//     reached, the SENTINEL-laden version row can never surface. Nothing the retired route
//     could produce serializes any accessToken / publicToken / snapshotJson / nested
//     snapshot / PII / supplier / note / arbitrary JSON / capability URL / future field.
test('10. no sensitive field can leave the retired route (row never fetched, never serialized)', async () => {
  const { controller, calls, SENTINEL_ROW } = createTripwireController();
  let threw: unknown = null;
  let returned: unknown = 'NO_RETURN';
  try {
    returned = await (controller as any).findVersion('q1', 'v1', makeActor('admin'));
  } catch (e) {
    threw = e;
  }
  assert.ok(threw instanceof NotFoundException, 'retired route throws 404');
  assert.equal(returned, 'NO_RETURN', 'retired route returns nothing');
  assert.equal(calls.total, 0, 'the SENTINEL version row was never fetched');
  // Guard against accidental serialization: confirm the sentinel row (had it been
  // returned) contains the markers we are proving never leave the route.
  const s = JSON.stringify(SENTINEL_ROW);
  for (const marker of ['SENTINEL_ACCESS_TOKEN', 'SENTINEL_NESTED_SNAPSHOT', 'SENTINEL_PASSPORT', 'SENTINEL_SUPPLIER', 'SENTINEL_NOTE', 'SENTINEL_ARBITRARY_JSON', 'SENTINEL_CAPABILITY_URL', 'SENTINEL_FUTURE']) {
    assert.ok(s.includes(marker), `fixture sanity: ${marker} present in the row that is never returned`);
  }
});
