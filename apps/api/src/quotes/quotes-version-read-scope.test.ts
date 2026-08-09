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

test('both version read routes are gated to admin/viewer/finance (operations excluded)', () => {
  for (const handler of ['findVersions', 'findVersion']) {
    const roles = (Reflect as any).getMetadata(ROLES_KEY, QuotesController.prototype[handler]);
    assert.deepEqual(roles, ['admin', 'viewer', 'finance'], `${handler} roles`);
    assert.equal(roles.includes('operations'), false, `${handler} excludes operations`);
    assert.equal(roles.includes('agent'), false, `${handler} excludes agent`);
  }
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

test('findVersion: scoped to the quote; 404 when quote out-of-scope or version not in quote', async () => {
  // In-scope + version belongs to quote → returns the version row unchanged.
  const okController = new QuotesController(
    {
      findOne: async () => ({ id: 'quote-1' }),
      findVersion: async (quoteId: string, versionId: string) => ({ id: versionId, quoteId, versionNumber: 2, label: 'x', snapshotJson: { totalCost: 1 } }),
    } as any,
    {} as any,
  );
  const v = await okController.findVersion('quote-1', 'ver-2', ACTOR as any);
  assert.equal(v.id, 'ver-2');
  assert.equal(v.quoteId, 'quote-1');

  // Out-of-scope quote → 404 before touching the version.
  let vCalled = 0;
  const denyQuote = new QuotesController(
    { findOne: async () => null, findVersion: async () => { vCalled += 1; return {}; } } as any,
    {} as any,
  );
  await assert.rejects(() => denyQuote.findVersion('quote-x', 'ver-2', ACTOR as any), /Quote not found/);
  assert.equal(vCalled, 0);

  // Quote in scope but version belongs to another quote → service returns null → 404.
  const denyVersion = new QuotesController(
    { findOne: async () => ({ id: 'quote-1' }), findVersion: async () => null } as any,
    {} as any,
  );
  await assert.rejects(() => denyVersion.findVersion('quote-1', 'ver-other', ACTOR as any), /Quote version not found/);
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
