import test = require('node:test');
import assert = require('node:assert/strict');
import { PATH_METADATA } from '@nestjs/common/constants';
const { QuotesController } = require('./quotes.controller');
const { QuotesService } = require('./quotes.service');
const { QuotePricingService } = require('./quote-pricing.service');
const { ROLES_KEY } = require('../auth/auth.decorators');

// Version read-route hardening. Both GET /quotes/:id/versions and
// /quotes/:id/versions/:versionId are now @Roles('admin','viewer','finance') and
// resolve findOne(id, actor) first (actor company context + existence) before
// returning versions — mirroring createVersion / version-readiness. Response
// shapes are unchanged; these are read-only routes (no writes).

const ACTOR = { id: 'u1', role: 'admin', companyId: 'company-1' };

function createService(prisma: any = {}) {
  return new QuotesService(prisma, { log: async () => null } as any, {} as any, {} as any, new QuotePricingService());
}

test('version LIST route is gated to admin/viewer/finance (operations excluded)', () => {
  // CP-N3b2c3c: findVersion (the raw version-DETAIL route) is now RETIRED and
  // deliberately carries NO @Roles metadata (see the retirement test below); only the
  // LIST route retains the explicit allowlist. Its role-gating is unchanged.
  const roles = (Reflect as any).getMetadata(ROLES_KEY, QuotesController.prototype.findVersions);
  assert.deepEqual(roles, ['admin', 'viewer', 'finance'], 'findVersions roles');
  assert.equal(roles.includes('operations'), false, 'findVersions excludes operations');
  assert.equal(roles.includes('agent'), false, 'findVersions excludes agent');
});

test('version read routes keep their existing paths', () => {
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuotesController.prototype.findVersions), ':id/versions');
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuotesController.prototype.findVersion), ':id/versions/:versionId');
});

test('findVersions: allowed actor lists versions; out-of-scope/nonexistent quote → 404', async () => {
  // In-scope: findOne(actor) returns a quote → delegates to findVersions(id).
  const seen: string[] = [];
  const okController = new QuotesController(
    {
      findOne: async (id: string, a: any) => { seen.push(`findOne:${id}:${a.companyId}`); return { id }; },
      findVersions: async (id: string) => { seen.push(`list:${id}`); return [{ id: 'v1', quoteId: id, versionNumber: 1, label: null, createdAt: 'ts' }]; },
    } as any,
    {} as any,
  );
  const list = await okController.findVersions('quote-1', ACTOR as any);
  assert.deepEqual(seen, ['findOne:quote-1:company-1', 'list:quote-1']);
  // Response shape preserved: metadata only, no snapshotJson.
  assert.deepEqual(Object.keys(list[0]).sort(), ['createdAt', 'id', 'label', 'quoteId', 'versionNumber']);
  assert.equal('snapshotJson' in list[0], false);

  // Out-of-scope / nonexistent: findOne returns null → 404, list never called.
  let called = 0;
  const denyController = new QuotesController(
    { findOne: async () => null, findVersions: async () => { called += 1; return []; } } as any,
    {} as any,
  );
  await assert.rejects(() => denyController.findVersions('quote-x', ACTOR as any), /Quote not found/);
  assert.equal(called, 0);
});

test('findVersion (raw version DETAIL route) is RETIRED — unconditional 404, no service call', async () => {
  // CP-N3b2c3c: the raw version-detail route no longer scopes, loads, or returns a
  // version. It fails closed with a 404 and never reaches findOne or findVersion,
  // regardless of the actor. (Comprehensive per-role coverage lives in
  // quote-raw-version-detail-retired.test.ts.)
  let findOneCalled = 0;
  let findVersionCalled = 0;
  const controller = new QuotesController(
    {
      findOne: async () => { findOneCalled += 1; return { id: 'quote-1' }; },
      findVersion: async () => { findVersionCalled += 1; return { id: 'ver-2', quoteId: 'quote-1', snapshotJson: { totalCost: 1 } }; },
    } as any,
    {} as any,
  );
  await assert.rejects(() => (controller as any).findVersion('quote-1', 'ver-2', ACTOR as any), /Quote version not found/);
  assert.equal(findOneCalled, 0, 'retired route must not call findOne');
  assert.equal(findVersionCalled, 0, 'retired route must not call findVersion');
});

test('service findVersion filters by BOTH versionId and quoteId (version cannot cross quotes)', async () => {
  let where: any = null;
  const service = createService({
    quoteVersion: { findFirst: async (args: any) => { where = args.where; return null; } },
  });
  await service.findVersion('quote-1', 'ver-2');
  assert.deepEqual(where, { id: 'ver-2', quoteId: 'quote-1' });
});

test('version read routes perform no writes (service reads only)', async () => {
  const writeGuard = (n: string) => async () => { throw new Error(`unexpected write: ${n}`); };
  const service = createService({
    quoteVersion: {
      findMany: async () => [{ id: 'v1', quoteId: 'quote-1', versionNumber: 1, label: null, createdAt: 'ts' }],
      findFirst: async () => ({ id: 'ver-2', quoteId: 'quote-1', snapshotJson: {} }),
      create: writeGuard('create'), update: writeGuard('update'), delete: writeGuard('delete'),
    },
    quote: { update: writeGuard('quote.update') },
  });
  await assert.doesNotReject(() => service.findVersions('quote-1'));
  await assert.doesNotReject(() => service.findVersion('quote-1', 'ver-2'));
});
