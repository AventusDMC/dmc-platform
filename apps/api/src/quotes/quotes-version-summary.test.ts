import test = require('node:test');
import assert = require('node:assert/strict');
import { PATH_METADATA } from '@nestjs/common/constants';
const { QuotesController } = require('./quotes.controller');
const { QuotesService } = require('./quotes.service');
const { QuotePricingService } = require('./quote-pricing.service');
const { ROLES_KEY } = require('../auth/auth.decorators');

// VV-3 Slice 2A — safe version summary endpoint. GET /quotes/:id/versions/:versionId/summary
// returns a WHITELIST-CURATED summary (never snapshotJson / PII / contact / company /
// notes / diagnostics / booking / invoice / publicToken). Cost block only for
// cost-visible roles (admin/super_admin/finance). Completeness reuses the VV-2
// evaluator on the SAVED snapshot. Read-only.

function createService(prisma: any = {}) {
  return new QuotesService(prisma, { log: async () => null } as any, {} as any, {} as any, new QuotePricingService());
}

// A complete snapshot (passes assertQuoteWorkflowStateIsComplete) carrying cost + PII +
// internal fields that MUST NOT appear in the summary.
const SNAPSHOT = {
  title: 'Trip to Petra',
  status: 'DRAFT',
  quoteNumber: 'Q-TEST-1',
  travelStartDate: '2026-06-01T00:00:00.000Z',
  validUntil: '2026-05-01T00:00:00.000Z',
  nightCount: 3,
  roomCount: 2,
  adults: 2,
  children: 0,
  quoteCurrency: 'USD',
  totalSell: 1000,
  totalCost: 600,
  totalPrice: 1000,
  pricePerPax: 500,
  pricingMode: 'FIXED',
  pricingType: 'simple',
  fixedPricePerPerson: 500,
  inclusionsText: 'Breakfast included',
  exclusionsText: 'Flights excluded',
  itineraries: [{ id: 'day-1', dayNumber: 1 }],
  quoteItineraryDays: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }],
  quoteItems: [
    {
      id: 'item-1', quantity: 1, paxCount: 2, totalCost: 300, totalSell: 500, itineraryId: 'day-1',
      startTime: '09:00', pickupLocation: 'Hotel', meetingPoint: 'Center', participantCount: 2,
      adultCount: 2, childCount: 0, reconfirmationRequired: true, reconfirmationDueAt: '2026-05-31T18:00:00.000Z',
      service: { name: 'Tour', serviceType: { name: 'Activity', code: 'ACTIVITY' } },
    },
  ],
  // ---- fields that MUST NEVER be exposed ----
  passengers: [{ firstName: 'Jane', lastName: 'Doe', passportNumber: 'X123', dateOfBirth: '1990-01-01' }],
  contact: { firstName: 'John', lastName: 'Client', email: 'client@example.com', phone: '+100000' },
  contactId: 'contact-1',
  clientCompany: { id: 'c1', name: 'Client Co', taxId: 'TAX' },
  brandCompany: { id: 'b1', name: 'Brand Co' },
  note: 'internal note',
  termsNotesText: 'internal terms',
  workflowDiagnostics: [{ itemId: 'x', missingWorkflowFields: [] }],
  convertBlockers: [],
  transportSelectionByUserId: 'u9',
  publicToken: 'secret-token',
  agentId: 'agent-1',
  booking: { id: 'bk1' },
  invoice: { id: 'inv1' },
  scenarios: [{ id: 's1' }],
  revisedFromId: 'q-old',
};

const FORBIDDEN_KEYS = [
  'snapshotJson', 'passengers', 'contact', 'contactId', 'clientCompany', 'brandCompany',
  'company', 'note', 'termsNotesText', 'workflowDiagnostics', 'convertBlockers',
  'transportSelectionByUserId', 'publicToken', 'agentId', 'booking', 'invoice',
  'scenarios', 'revisedFromId', 'inclusionsText', 'exclusionsText',
];

function versionPrisma(rows: any) {
  const writeGuard = (n: string) => async () => { throw new Error(`unexpected write: ${n}`); };
  return {
    quoteVersion: {
      findFirst: async ({ where }: any) =>
        rows.find((r: any) => r.id === where.id && r.quoteId === where.quoteId) ?? null,
      create: writeGuard('qv.create'), update: writeGuard('qv.update'), delete: writeGuard('qv.delete'),
    },
    quote: { update: writeGuard('quote.update') },
    invoice: { create: writeGuard('invoice.create') },
    booking: { create: writeGuard('booking.create') },
    auditLog: { create: writeGuard('auditLog.create') },
  };
}

const VERSION_ROW = { id: 'ver-1', quoteId: 'quote-1', versionNumber: 1, label: 'v1', createdAt: 'ts', snapshotJson: SNAPSHOT };

test('summary route is gated to admin/viewer/finance and keeps its path', () => {
  const roles = (Reflect as any).getMetadata(ROLES_KEY, QuotesController.prototype.findVersionSummary);
  assert.deepEqual(roles, ['admin', 'viewer', 'finance']);
  assert.equal(roles.includes('operations'), false);
  assert.equal(roles.includes('agent'), false);
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, QuotesController.prototype.findVersionSummary), ':id/versions/:versionId/summary');
});

test('admin receives curated summary WITH cost block; no forbidden fields', async () => {
  const service = createService(versionPrisma([VERSION_ROW]));
  const summary = await service.getVersionSummary('quote-1', 'ver-1', { role: 'admin', companyId: 'company-1' });
  // Whitelisted client-facing fields present.
  assert.equal(summary.title, 'Trip to Petra');
  assert.equal(summary.statusAtSnapshot, 'DRAFT');
  assert.equal(summary.quoteNumber, 'Q-TEST-1');
  assert.equal(summary.nightCount, 3);
  assert.equal(summary.adults, 2);
  assert.equal(summary.quoteCurrency, 'USD');
  assert.equal(summary.totalSell, 1000);
  assert.equal(summary.pricePerPax, 500);
  assert.equal(summary.itemCount, 1);
  assert.equal(summary.dayCount, 3);
  assert.equal(summary.hasInclusions, true);
  assert.equal(summary.hasExclusions, true);
  // Completeness via the VV-2 evaluator.
  assert.equal(summary.completeness.ok, true);
  assert.deepEqual(summary.completeness.reasons, []);
  assert.equal(summary.acceptWillSucceed, true);
  // Cost block for admin (curated, no per-item internals).
  assert.deepEqual(summary.cost, { totalCost: 600, margin: 400, marginPercent: 40 });
  // No forbidden fields anywhere.
  for (const k of FORBIDDEN_KEYS) assert.equal(k in summary, false, `summary must not include ${k}`);
  // No raw snapshot / per-item cost internals leaked via any value.
  const json = JSON.stringify(summary);
  assert.equal(/passportNumber|dateOfBirth|client@example\.com|secret-token|internal note/.test(json), false);
});

test('finance also receives the cost block', async () => {
  const service = createService(versionPrisma([VERSION_ROW]));
  const summary = await service.getVersionSummary('quote-1', 'ver-1', { role: 'finance', companyId: 'company-1' });
  assert.deepEqual(summary.cost, { totalCost: 600, margin: 400, marginPercent: 40 });
});

test('viewer receives curated summary WITHOUT cost (omitted, not zeroed/null)', async () => {
  const service = createService(versionPrisma([VERSION_ROW]));
  const summary = await service.getVersionSummary('quote-1', 'ver-1', { role: 'viewer', companyId: 'company-1' });
  assert.equal('cost' in summary, false);
  // Client-facing selling data still present.
  assert.equal(summary.totalSell, 1000);
  assert.equal(summary.pricePerPax, 500);
  for (const k of FORBIDDEN_KEYS) assert.equal(k in summary, false);
});

test('operations receives curated summary WITHOUT cost (role reaches service but is not cost-visible)', async () => {
  // (The controller @Roles blocks operations at the HTTP layer; at the service layer
  // the cost gate must also exclude operations.)
  const service = createService(versionPrisma([VERSION_ROW]));
  const summary = await service.getVersionSummary('quote-1', 'ver-1', { role: 'operations', companyId: 'company-1' });
  assert.equal('cost' in summary, false);
});

test('cross-quote version and missing version return null (→ controller 404)', async () => {
  const service = createService(versionPrisma([VERSION_ROW]));
  assert.equal(await service.getVersionSummary('quote-1', 'missing', { role: 'admin' }), null);
  assert.equal(await service.getVersionSummary('other-quote', 'ver-1', { role: 'admin' }), null);
});

test('response never contains snapshotJson key even for cost-visible roles', async () => {
  const service = createService(versionPrisma([VERSION_ROW]));
  const summary = await service.getVersionSummary('quote-1', 'ver-1', { role: 'admin' });
  assert.equal('snapshotJson' in summary, false);
});

test('controller enforces actor scope + version 404 and delegates to getVersionSummary', async () => {
  const actor = { id: 'u1', role: 'admin', companyId: 'company-1' };
  // Out-of-scope quote → findOne null → 404, summary not fetched.
  let summaryCalls = 0;
  const denyQuote = new QuotesController(
    { findOne: async () => null, getVersionSummary: async () => { summaryCalls += 1; return {}; } } as any,
    {} as any,
  );
  await assert.rejects(() => denyQuote.findVersionSummary('quote-1', 'ver-1', actor as any), /Quote not found/);
  assert.equal(summaryCalls, 0);
  // In scope but summary null (missing/cross-quote) → 404.
  const denyVersion = new QuotesController(
    { findOne: async () => ({ id: 'quote-1' }), getVersionSummary: async () => null } as any,
    {} as any,
  );
  await assert.rejects(() => denyVersion.findVersionSummary('quote-1', 'nope', actor as any), /Quote version not found/);
  // Happy path → returns the curated summary from the service.
  const okController = new QuotesController(
    { findOne: async () => ({ id: 'quote-1' }), getVersionSummary: async () => ({ id: 'ver-1', versionNumber: 1 }) } as any,
    {} as any,
  );
  const res = await okController.findVersionSummary('quote-1', 'ver-1', actor as any);
  assert.deepEqual(res, { id: 'ver-1', versionNumber: 1 });
});

test('getVersionSummary performs no writes (prisma stub throws on any write)', async () => {
  const service = createService(versionPrisma([VERSION_ROW]));
  await assert.doesNotReject(() => service.getVersionSummary('quote-1', 'ver-1', { role: 'admin' }));
  await assert.doesNotReject(() => service.getVersionSummary('quote-1', 'ver-1', { role: 'viewer' }));
});

test('incomplete snapshot surfaces completeness reasons + acceptWillSucceed false', async () => {
  const incomplete = { ...SNAPSHOT, quoteItems: [{ id: 'item-1', paxCount: 0, totalCost: 0, totalSell: 0, itineraryId: 'day-1', service: { name: 'Tour', serviceType: { name: 'Activity', code: 'ACTIVITY' } } }] };
  const service = createService(versionPrisma([{ ...VERSION_ROW, snapshotJson: incomplete }]));
  const summary = await service.getVersionSummary('quote-1', 'ver-1', { role: 'admin' });
  assert.equal(summary.completeness.ok, false);
  assert.ok(Array.isArray(summary.completeness.reasons) && summary.completeness.reasons.length > 0);
  assert.equal(summary.acceptWillSucceed, false);
});
