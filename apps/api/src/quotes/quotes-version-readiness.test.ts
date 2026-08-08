import test = require('node:test');
import assert = require('node:assert/strict');
import { PATH_METADATA } from '@nestjs/common/constants';
const { QuotesService } = require('./quotes.service');
const { QuotesController } = require('./quotes.controller');
const { QuotePricingService } = require('./quote-pricing.service');
const { ROLES_KEY } = require('../auth/auth.decorators');

// VV-2 Slice A — read-only version-readiness endpoint. Verifies the endpoint
// reports whether a saved proposal version would satisfy the SAME completeness
// rule Accept enforces, using the shared (non-throwing) evaluator — with no
// writes and no lifecycle/financial side effects.

function createQuotesService(prisma: any = {}) {
  return new QuotesService(
    prisma,
    { log: async () => null } as any,
    {} as any,
    {} as any,
    new QuotePricingService(),
  );
}

// Passes assertQuoteWorkflowStateIsComplete (mirrors the booking-conversion
// "completed imported activity" fixture).
const COMPLETE_SNAPSHOT = {
  adults: 2,
  children: 0,
  pricingMode: 'FIXED',
  pricingType: 'simple',
  fixedPricePerPerson: 100,
  travelStartDate: '2026-06-01T00:00:00.000Z',
  itineraries: [{ id: 'day-1', dayNumber: 1 }],
  quoteItems: [
    {
      id: 'item-1',
      quantity: 1,
      paxCount: 2,
      totalCost: 80,
      totalSell: 120,
      itineraryId: 'day-1',
      serviceDate: null,
      startTime: '09:00',
      pickupTime: null,
      pickupLocation: 'Hotel lobby',
      meetingPoint: 'Visitor center',
      participantCount: 2,
      adultCount: 2,
      childCount: 0,
      reconfirmationRequired: true,
      reconfirmationDueAt: '2026-05-31T18:00:00.000Z',
      service: { name: 'Imported Activity', category: 'Activity', serviceType: { name: 'Activity', code: 'ACTIVITY' } },
    },
  ],
};

// Fails assertQuoteWorkflowStateIsComplete (missing operational fields).
const INCOMPLETE_SNAPSHOT = {
  adults: 2,
  children: 0,
  pricingMode: 'FIXED',
  pricingType: 'simple',
  fixedPricePerPerson: 100,
  travelStartDate: '2026-06-01T00:00:00.000Z',
  itineraries: [{ id: 'day-1', dayNumber: 1 }],
  quoteItems: [
    {
      id: 'item-1',
      quantity: 1,
      paxCount: 0,
      totalCost: 0,
      totalSell: 0,
      itineraryId: 'day-1',
      serviceDate: null,
      startTime: null,
      pickupTime: null,
      pickupLocation: null,
      meetingPoint: null,
      participantCount: null,
      adultCount: null,
      childCount: null,
      reconfirmationRequired: true,
      reconfirmationDueAt: null,
      service: { name: 'Imported Activity', category: 'Activity', serviceType: { name: 'Activity', code: 'ACTIVITY' } },
    },
  ],
};

// A prisma stub that records findMany calls and FAILS LOUDLY on any write.
function createVersionPrisma(rows: any[]) {
  const calls: { findMany: any[] } = { findMany: [] };
  const writeGuard = (name: string) => async () => {
    throw new Error(`unexpected write: ${name}`);
  };
  const prisma = {
    quoteVersion: {
      findMany: async (args: any) => {
        calls.findMany.push(args);
        return rows;
      },
      create: writeGuard('quoteVersion.create'),
      update: writeGuard('quoteVersion.update'),
      updateMany: writeGuard('quoteVersion.updateMany'),
      delete: writeGuard('quoteVersion.delete'),
    },
    quote: {
      update: writeGuard('quote.update'),
      create: writeGuard('quote.create'),
    },
    invoice: { create: writeGuard('invoice.create') },
    booking: { create: writeGuard('booking.create') },
  };
  return { prisma, calls };
}

test('version-readiness: no versions → hasSavedVersion=false, acceptWillSucceed=false', async () => {
  const { prisma } = createVersionPrisma([]);
  const service = createQuotesService(prisma);
  const result = await service.getVersionReadiness('quote-1');
  assert.equal(result.versionCount, 0);
  assert.equal(result.hasSavedVersion, false);
  assert.equal(result.hasCompleteVersion, false);
  assert.equal(result.latestVersionNumber, null);
  assert.equal(result.latestVersionComplete, false);
  assert.equal(result.acceptWillSucceed, false);
  assert.deepEqual(result.reasons, ['Accepted quotes require at least one saved quote version']);
});

test('version-readiness: version exists but incomplete → hasCompleteVersion=false, acceptWillSucceed=false', async () => {
  const { prisma } = createVersionPrisma([{ id: 'v1', versionNumber: 1, snapshotJson: INCOMPLETE_SNAPSHOT }]);
  const service = createQuotesService(prisma);
  const result = await service.getVersionReadiness('quote-1');
  assert.equal(result.versionCount, 1);
  assert.equal(result.hasSavedVersion, true);
  assert.equal(result.hasCompleteVersion, false);
  assert.equal(result.latestVersionNumber, 1);
  assert.equal(result.latestVersionComplete, false);
  assert.equal(result.acceptWillSucceed, false);
  assert.deepEqual(result.reasons, [
    'Accepted quotes require a saved quote version with complete pricing and workflow details',
  ]);
});

test('version-readiness: complete version → hasCompleteVersion=true, acceptWillSucceed=true, no reasons', async () => {
  const { prisma } = createVersionPrisma([{ id: 'v1', versionNumber: 1, snapshotJson: COMPLETE_SNAPSHOT }]);
  const service = createQuotesService(prisma);
  const result = await service.getVersionReadiness('quote-1');
  assert.equal(result.hasSavedVersion, true);
  assert.equal(result.hasCompleteVersion, true);
  assert.equal(result.latestVersionNumber, 1);
  assert.equal(result.latestVersionComplete, true);
  assert.equal(result.acceptWillSucceed, true);
  assert.deepEqual(result.reasons, []);
});

test('version-readiness: newest-first — latest complete wins immediately', async () => {
  const { prisma, calls } = createVersionPrisma([
    { id: 'v3', versionNumber: 3, snapshotJson: COMPLETE_SNAPSHOT },
    { id: 'v2', versionNumber: 2, snapshotJson: INCOMPLETE_SNAPSHOT },
  ]);
  const service = createQuotesService(prisma);
  const result = await service.getVersionReadiness('quote-1');
  assert.equal(result.hasCompleteVersion, true);
  assert.equal(result.latestVersionComplete, true);
  assert.equal(result.latestVersionNumber, 3);
  assert.equal(result.acceptWillSucceed, true);
  // Ordered newest-first (matches Accept's resolveAcceptedQuoteVersion).
  assert.deepEqual(calls.findMany[0].orderBy, [{ versionNumber: 'desc' }, { createdAt: 'desc' }]);
});

test('version-readiness: newest-first — older complete version still satisfies accept, latest flagged incomplete', async () => {
  const { prisma } = createVersionPrisma([
    { id: 'v3', versionNumber: 3, snapshotJson: INCOMPLETE_SNAPSHOT },
    { id: 'v2', versionNumber: 2, snapshotJson: COMPLETE_SNAPSHOT },
  ]);
  const service = createQuotesService(prisma);
  const result = await service.getVersionReadiness('quote-1');
  assert.equal(result.hasCompleteVersion, true); // an older complete version exists
  assert.equal(result.latestVersionComplete, false); // but the latest is not complete
  assert.equal(result.latestVersionNumber, 3);
  assert.equal(result.acceptWillSucceed, true);
  assert.deepEqual(result.reasons, []);
});

test('version-readiness: response omits snapshotJson and financial fields', async () => {
  const { prisma } = createVersionPrisma([{ id: 'v1', versionNumber: 1, snapshotJson: COMPLETE_SNAPSHOT }]);
  const service = createQuotesService(prisma);
  const result = await service.getVersionReadiness('quote-1');
  assert.deepEqual(Object.keys(result).sort(), [
    'acceptWillSucceed',
    'hasCompleteVersion',
    'hasSavedVersion',
    'latestVersionComplete',
    'latestVersionNumber',
    'reasons',
    'versionCount',
  ]);
  assert.equal('snapshotJson' in result, false);
  assert.equal('totalCost' in result, false);
  assert.equal('totalSell' in result, false);
  assert.equal('markupPercent' in result, false);
});

test('version-readiness performs no writes', async () => {
  // createVersionPrisma throws on any create/update/delete; reaching here == no writes.
  const { prisma } = createVersionPrisma([{ id: 'v1', versionNumber: 1, snapshotJson: INCOMPLETE_SNAPSHOT }]);
  const service = createQuotesService(prisma);
  await assert.doesNotReject(() => service.getVersionReadiness('quote-1'));
});

test('non-throwing evaluator matches existing assertQuoteWorkflowStateIsComplete behavior', () => {
  const service = createQuotesService();

  // Complete snapshot: assert does not throw; evaluator ok=true, no reasons.
  assert.doesNotThrow(() => (service as any).assertQuoteWorkflowStateIsComplete(COMPLETE_SNAPSHOT));
  const okResult = (service as any).evaluateQuoteWorkflowCompleteness(COMPLETE_SNAPSHOT);
  assert.equal(okResult.ok, true);
  assert.deepEqual(okResult.reasons, []);

  // Incomplete snapshot: assert throws; evaluator ok=false with the SAME message.
  let thrownMessage = '';
  try {
    (service as any).assertQuoteWorkflowStateIsComplete(INCOMPLETE_SNAPSHOT);
    assert.fail('expected assertQuoteWorkflowStateIsComplete to throw');
  } catch (error: any) {
    thrownMessage = error?.message ?? '';
  }
  const failResult = (service as any).evaluateQuoteWorkflowCompleteness(INCOMPLETE_SNAPSHOT);
  assert.equal(failResult.ok, false);
  assert.equal(failResult.reasons[0], thrownMessage);
});

test('quotes controller exposes read-only version-readiness route gated to admin/viewer/finance', () => {
  const routePath = (Reflect as any).getMetadata(PATH_METADATA, QuotesController.prototype.getVersionReadiness);
  assert.equal(routePath, ':id/version-readiness');
  const roles = (Reflect as any).getMetadata(ROLES_KEY, QuotesController.prototype.getVersionReadiness);
  assert.deepEqual(roles, ['admin', 'viewer', 'finance']);
  // operations must NOT be granted access.
  assert.equal(roles.includes('operations'), false);
});

test('controller enforces tenant/company scope via findOne(actor) before returning readiness', async () => {
  const actor = { id: 'u1', role: 'admin', companyId: 'company-1' };

  // Out-of-scope quote → findOne returns null → NotFound, service not called.
  let readinessCalls = 0;
  const denyingService: any = {
    findOne: async (_id: string, _actor: any) => null,
    getVersionReadiness: async () => {
      readinessCalls += 1;
      return {};
    },
  };
  const denyingController = new QuotesController(denyingService, {} as any);
  await assert.rejects(() => denyingController.getVersionReadiness('quote-1', actor as any));
  assert.equal(readinessCalls, 0);

  // In-scope quote → findOne returns a quote → delegates to service.getVersionReadiness.
  const seen: string[] = [];
  const allowingService: any = {
    findOne: async (id: string, a: any) => {
      seen.push(`findOne:${id}:${a.companyId}`);
      return { id };
    },
    getVersionReadiness: async (id: string) => {
      seen.push(`readiness:${id}`);
      return { versionCount: 0 };
    },
  };
  const allowingController = new QuotesController(allowingService, {} as any);
  const result = await allowingController.getVersionReadiness('quote-1', actor as any);
  assert.deepEqual(seen, ['findOne:quote-1:company-1', 'readiness:quote-1']);
  assert.deepEqual(result, { versionCount: 0 });
});
