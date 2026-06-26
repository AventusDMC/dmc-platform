import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';
import { buildPreviewToken, getPreviewTokenSecret, normalizePayloadHash } from './quote-preview-token';

const ACTOR = { companyId: 'company-1' } as any;
const QUOTE_ID = 'q1';
const ITEM_ID = 'i1';
const MEAL_DATA = { quoteId: QUOTE_ID, quantity: 2, customServiceName: 'Lunch', unitCost: 50 } as any;

function enable(preview: boolean, apply: boolean) {
  if (preview) process.env.QUOTE_PRICING_PREVIEW = '1';
  else delete process.env.QUOTE_PRICING_PREVIEW;
  if (apply) process.env.QUOTE_PRICING_APPLY = '1';
  else delete process.env.QUOTE_PRICING_APPLY;
}

type Opts = {
  resolved?: { cost: number; sell: number };
  service?: any;
  entranceFeeId?: string | null;
  transport?: boolean;
  auditRows?: any[];
  users?: any[];
};

function makeService(opts: Opts = {}) {
  const resolved = opts.resolved ?? { cost: 100, sell: 120 };
  const service = opts.service ?? { category: 'meal', serviceType: { code: 'MEAL', name: 'Meal' } };
  const db: any = {
    quote: {
      id: QUOTE_ID, status: 'DRAFT', clientCompanyId: 'company-1', brandCompanyId: null,
      adults: 2, children: 0, roomCount: 1, nightCount: 1, quoteCurrency: 'USD', jordanPassType: 'NONE',
      pricingType: 'FIXED', pricingMode: null, totalCost: 1000, totalSell: 1200,
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    },
    item: {
      id: ITEM_ID, quoteId: QUOTE_ID, optionId: null, entranceFeeId: opts.entranceFeeId ?? null,
      serviceDate: new Date('2026-07-01T00:00:00.000Z'),
      transportServiceTypeId: opts.transport ? 'tt1' : null, routeId: null, touringRouteId: null,
      serviceId: 's1', quantity: 1, totalCost: 100, totalSell: 120,
      updatedAt: new Date('2026-06-01T00:00:00.000Z'), service,
    },
    agg: { count: 5, max: new Date('2026-06-01T00:00:00.000Z') },
    afterItem: null as any,
    afterQuote: null as any,
    auditRows: opts.auditRows ?? [],
    users: opts.users ?? [],
  };
  const calls = { updateItem: 0, writes: 0 };

  const prisma: any = {
    quote: {
      findFirst: async ({ where }: any) => (where.id === QUOTE_ID ? { ...db.quote } : null),
      findUnique: async () => db.afterQuote ?? { totalCost: db.quote.totalCost, totalSell: db.quote.totalSell },
    },
    quoteItem: {
      findFirst: async ({ where }: any) =>
        where.id === ITEM_ID && where.quoteId === QUOTE_ID ? { ...db.item } : null,
      findMany: async () => [],
      aggregate: async () => ({ _count: { _all: db.agg.count }, _max: { updatedAt: db.agg.max } }),
      findUnique: async () => db.afterItem ?? { totalCost: db.item.totalCost, totalSell: db.item.totalSell },
      update: async () => { calls.writes += 1; throw new Error('direct quoteItem.update must not run in apply'); },
      create: async () => { calls.writes += 1; throw new Error('create must not run'); },
      delete: async () => { calls.writes += 1; throw new Error('delete must not run'); },
    },
    jordanPassProduct: { findUnique: async () => null },
    ticketRateVariant: { findUnique: async () => null },
    auditLog: {
      // Mirror the Postgres JSON-path filter used by getPricingApplyAudit:
      // where action === X AND metadata->>quoteId === Y.
      findMany: async ({ where }: any) =>
        db.auditRows.filter(
          (r: any) =>
            (where?.action === undefined || r.action === where.action) &&
            (where?.metadata === undefined || (r.metadata ?? {})[where.metadata.path[0]] === where.metadata.equals),
        ),
    },
    user: {
      findMany: async ({ where }: any) => db.users.filter((u: any) => (where?.id?.in ?? []).includes(u.id)),
    },
  };

  const auditCalls: any[] = [];
  const svc = new QuotesService(
    prisma as any,
    { log: async (v: any) => { auditCalls.push(v); } } as any,
    { findMatchingRate: async () => { throw new Error('no transport lookup'); } } as any,
    { evaluate: async () => null } as any,
    new QuotePricingService(),
  );
  // Non-entrance preview resolves via resolveQuoteItemValues — stub deterministically.
  (svc as any).resolveQuoteItemValues = async () => ({
    data: {
      totalCost: resolved.cost, totalSell: resolved.sell,
      fxRate: 1, fxRateDate: new Date('2026-04-23T00:00:00.000Z'),
      appliedVehicleRateId: null, contractId: null, ticketRateVariantId: null,
      activityRateVariantId: null, touringRoutePricingId: null,
    },
  });
  // The real recalc/sync must never run from preview/apply guard logic.
  (svc as any).recalculateQuoteTotals = async () => { throw new Error('recalc must not run directly'); };
  // updateItem is the EXISTING write path apply delegates to — stub it to simulate the write.
  (svc as any).updateItem = async () => {
    calls.updateItem += 1;
    db.afterItem = { totalCost: resolved.cost, totalSell: resolved.sell };
    db.afterQuote = { totalCost: 1000 + (resolved.cost - 100), totalSell: 1200 + (resolved.sell - 120) };
    return {};
  };

  return { svc, db, calls, auditCalls };
}

async function mintToken(svc: any) {
  const res: any = await svc.previewUpdateQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, ACTOR);
  return res.previewToken as string;
}

async function expectHttp(fn: () => Promise<any>, status: number, codeOrMsg?: string) {
  try {
    await fn();
    assert.fail('expected an HTTP exception');
  } catch (err: any) {
    assert.equal(typeof err.getStatus === 'function' ? err.getStatus() : err.status, status, `status (${err?.message})`);
    if (codeOrMsg) {
      const body = typeof err.getResponse === 'function' ? err.getResponse() : {};
      const hay = JSON.stringify(body);
      assert.ok(hay.includes(codeOrMsg), `expected ${codeOrMsg} in ${hay}`);
    }
  }
}

test('preview now issues a signed previewToken for a meal item', async () => {
  enable(true, true);
  const { svc } = makeService();
  const res: any = await svc.previewUpdateQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, ACTOR);
  assert.ok(typeof res.previewToken === 'string' && res.previewToken.startsWith('v1.'));
});

test('flags: both OFF / preview-ON apply-OFF → feature_disabled, no write', async () => {
  for (const [p, a] of [[false, false], [true, false], [false, true]] as Array<[boolean, boolean]>) {
    enable(p, a);
    const { svc, calls } = makeService();
    const out: any = await svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, 'v1.x.y', false, ACTOR);
    assert.equal(out.applied, false);
    assert.equal(out.blockedReason, 'feature_disabled');
    assert.equal(calls.updateItem, 0);
    assert.equal(calls.writes, 0);
  }
});

test('valid token + zero delta → applies via updateItem; totals match projection', async () => {
  enable(true, true);
  const { svc, calls } = makeService({ resolved: { cost: 100, sell: 120 } }); // no-op
  const token = await mintToken(svc);
  const out: any = await svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, false, ACTOR);
  assert.equal(out.applied, true);
  assert.equal(out.matchedPreview, true);
  assert.equal(out.integrityOk, true);
  assert.deepEqual(out.item.after, { totalCost: 100, totalSell: 120 });
  assert.equal(calls.updateItem, 1);
  assert.equal(calls.writes, 0);
});

test('non-zero delta requires acknowledgedDelta', async () => {
  enable(true, true);
  const { svc, calls } = makeService({ resolved: { cost: 150, sell: 180 } });
  const token = await mintToken(svc);
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, false, ACTOR), 409, 'confirmation_required');
  assert.equal(calls.updateItem, 0);
  assert.equal(calls.writes, 0);
  // with acknowledgement → applies
  const out: any = await svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR);
  assert.equal(out.applied, true);
  assert.deepEqual(out.item.after, { totalCost: 150, totalSell: 180 });
  assert.equal(out.quote.after.totalCost, 1050);
});

test('token: invalid signature / malformed → 400 invalid_preview_token', async () => {
  enable(true, true);
  const { svc, calls } = makeService();
  const token = await mintToken(svc);
  const tampered = token.slice(0, -3) + 'zzz';
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, tampered, false, ACTOR), 400, 'invalid_preview_token');
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, 'not-a-token', false, ACTOR), 400, 'invalid_preview_token');
  assert.equal(calls.writes + calls.updateItem, 0);
});

test('token: expired → 409 stale_preview', async () => {
  enable(true, true);
  const { svc } = makeService();
  // Craft a correctly-signed but expired token with an otherwise-valid snapshot.
  const past = Math.floor(Date.now() / 1000) - 60;
  const token = buildPreviewToken(
    { quoteId: QUOTE_ID, itemId: ITEM_ID, companyId: 'company-1', normalizedPayloadHash: normalizePayloadHash(MEAL_DATA), issuedAt: past - 900, exp: past },
    getPreviewTokenSecret(),
  );
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR), 409, 'stale_preview');
});

test('token: wrong quote/item/company binding → 400', async () => {
  enable(true, true);
  const { svc } = makeService();
  const token = await mintToken(svc);
  await expectHttp(() => svc.applyPreviewQuoteItem('OTHER', ITEM_ID, MEAL_DATA, token, false, ACTOR), 400, 'invalid_preview_token');
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, 'OTHER', MEAL_DATA, token, false, ACTOR), 400, 'invalid_preview_token');
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, false, { companyId: 'other-co' } as any), 400, 'invalid_preview_token');
});

test('payload mismatch → 400 payload_mismatch', async () => {
  enable(true, true);
  const { svc } = makeService();
  const token = await mintToken(svc);
  await expectHttp(
    () => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, { ...MEAL_DATA, quantity: 9 }, token, true, ACTOR),
    400, 'payload_mismatch',
  );
});

test('stale: quote/item/sibling/maxUpdatedAt changed after preview → 409 stale_preview', async () => {
  for (const mutate of [
    (db: any) => { db.quote.updatedAt = new Date('2026-06-02T00:00:00.000Z'); },
    (db: any) => { db.item.updatedAt = new Date('2026-06-02T00:00:00.000Z'); },
    (db: any) => { db.agg.count = 6; },
    (db: any) => { db.agg.max = new Date('2026-06-02T00:00:00.000Z'); },
  ]) {
    enable(true, true);
    const { svc, db, calls } = makeService();
    const token = await mintToken(svc);
    mutate(db);
    await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR), 409, 'stale_preview');
    assert.equal(calls.updateItem, 0);
    assert.equal(calls.writes, 0);
  }
});

test('stale: projected totals drift after preview → 409 stale_preview', async () => {
  enable(true, true);
  const { svc, calls } = makeService({ resolved: { cost: 100, sell: 120 } });
  const token = await mintToken(svc);
  // Simulate rate drift: re-resolve now returns different numbers than at preview.
  (svc as any).resolveQuoteItemValues = async () => ({
    data: { totalCost: 130, totalSell: 150, fxRate: 1, fxRateDate: new Date('2026-04-23T00:00:00.000Z'), appliedVehicleRateId: null, contractId: null, ticketRateVariantId: null, activityRateVariantId: null, touringRoutePricingId: null },
  });
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR), 409, 'stale_preview');
  assert.equal(calls.updateItem, 0);
});

test('status: finalized status after preview → 409 status_blocked', async () => {
  enable(true, true);
  const { svc, db, calls } = makeService();
  const token = await mintToken(svc);
  db.quote.status = 'SENT';
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR), 409, 'status_blocked');
  assert.equal(calls.updateItem, 0);
});

test('secret safety: production without QUOTE_PREVIEW_TOKEN_SECRET → blocked, no write', async () => {
  enable(true, true);
  const prevNodeEnv = process.env.NODE_ENV;
  const prevSecret = process.env.QUOTE_PREVIEW_TOKEN_SECRET;
  delete process.env.QUOTE_PREVIEW_TOKEN_SECRET;
  (process.env as any).NODE_ENV = 'production';
  try {
    const { svc, calls } = makeService();
    // token value is irrelevant — the secret guard runs before token verification.
    const out: any = await svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, 'v1.x.y', true, ACTOR);
    assert.equal(out.applied, false);
    assert.equal(out.blockedReason, 'token_secret_not_configured');
    assert.equal(calls.updateItem, 0);
    assert.equal(calls.writes, 0);
  } finally {
    (process.env as any).NODE_ENV = prevNodeEnv;
    if (prevSecret === undefined) delete process.env.QUOTE_PREVIEW_TOKEN_SECRET;
    else process.env.QUOTE_PREVIEW_TOKEN_SECRET = prevSecret;
  }
});

test('unsupported type (transport) apply → 400 out-of-scope, no write', async () => {
  enable(true, true);
  const { svc, calls } = makeService({ transport: true, service: { category: 'transport', serviceType: { code: 'POINT_TO_POINT', name: 'Transfer' } } });
  const token = await mintToken(svc);
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR), 400, 'out of scope');
  assert.equal(calls.updateItem, 0);
  assert.equal(calls.writes, 0);
});

test('guide item apply succeeds (allowlist broadened to meal + activity + guide, PR B)', async () => {
  enable(true, true);
  const { svc, calls } = makeService({
    service: { category: 'guide', serviceType: { code: 'GUIDE', name: 'Guiding' } },
    resolved: { cost: 200, sell: 240 },
  });
  const token = await mintToken(svc);
  const out: any = await svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR);
  assert.equal(out.applied, true);
  assert.equal(out.matchedPreview, true);
  assert.deepEqual(out.item.after, { totalCost: 200, totalSell: 240 });
  assert.equal(calls.updateItem, 1); // delegates to the existing updateItem write path
  assert.equal(calls.writes, 0); // never writes via direct quoteItem.update
});

test('entrance item apply remains blocked (out of scope)', async () => {
  enable(true, true);
  const { svc, calls } = makeService({ service: { category: 'ticketing', serviceType: { code: 'ENTRANCE_TICKET', name: 'Entrance' } } });
  const token = await mintToken(svc);
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR), 400, 'out of scope');
  assert.equal(calls.updateItem, 0);
  assert.equal(calls.writes, 0);
});

test('external-package item apply remains blocked (out of scope)', async () => {
  enable(true, true);
  const { svc, calls } = makeService({ service: { category: 'external_package', serviceType: { code: 'EXTERNAL_PACKAGE', name: 'External package' } } });
  const token = await mintToken(svc);
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR), 400, 'out of scope');
  assert.equal(calls.updateItem, 0);
  assert.equal(calls.writes, 0);
});

test('hotel item apply remains blocked (out of scope)', async () => {
  enable(true, true);
  const { svc, calls } = makeService({ service: { category: 'hotel', serviceType: { code: 'HOTEL', name: 'Hotel' } } });
  const token = await mintToken(svc);
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR), 400, 'out of scope');
  assert.equal(calls.updateItem, 0);
  assert.equal(calls.writes, 0);
});

test('activity item apply succeeds (allowlist broadened to meal + activity)', async () => {
  enable(true, true);
  const { svc, calls } = makeService({
    service: { category: 'activity', serviceType: { code: 'ACTIVITY', name: 'Sightseeing' } },
    resolved: { cost: 150, sell: 180 },
  });
  const token = await mintToken(svc);
  const out: any = await svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR);
  assert.equal(out.applied, true);
  assert.equal(out.matchedPreview, true);
  assert.deepEqual(out.item.after, { totalCost: 150, totalSell: 180 });
  assert.equal(calls.updateItem, 1);
  assert.equal(calls.writes, 0);
});

test('scoping aligned with write path: actor whose company is NOT the quote client/brand can preview + apply', async () => {
  // Repro of the prod "Quote not found" bug: an internal/operations admin manages a quote
  // whose client is an Agent company and brand is a Supplier company — neither equals the
  // actor's own company. Preview/apply must now authorize like updateItem (assertQuoteMutationAccess).
  enable(true, true);
  const { svc, db, calls } = makeService({ resolved: { cost: 150, sell: 180 } });
  db.quote.clientCompanyId = 'client-agent-company';
  db.quote.brandCompanyId = 'supplier-brand-company';
  // mintToken runs a preview; it must succeed despite the company mismatch (previously threw "Quote not found").
  const token = await mintToken(svc);
  const out: any = await svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR);
  assert.equal(out.applied, true);
  assert.deepEqual(out.item.after, { totalCost: 150, totalSell: 180 });
  assert.equal(calls.updateItem, 1); // delegates to the existing write path
  assert.equal(calls.writes, 0);
});

test('missing quote still returns "Quote not found" via assertQuoteMutationAccess', async () => {
  enable(true, true);
  const { svc } = makeService();
  await expectHttp(() => svc.previewUpdateQuoteItem('missing-quote-id', ITEM_ID, MEAL_DATA, ACTOR), 400, 'Quote not found');
});

test('successful apply writes a quote.pricing.apply audit log entry with before/after/delta + payload summary', async () => {
  enable(true, true);
  const { svc, calls, auditCalls } = makeService({ resolved: { cost: 150, sell: 180 } });
  const token = await mintToken(svc);
  const out: any = await svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, { id: 'user-1', companyId: 'company-1' } as any);
  assert.equal(out.applied, true);
  assert.equal(calls.updateItem, 1);
  const entry = auditCalls.find((e: any) => e.action === 'quote.pricing.apply');
  assert.ok(entry, 'expected a quote.pricing.apply audit entry');
  assert.equal(entry.entity, 'quoteItem');
  assert.equal(entry.entityId, ITEM_ID);
  assert.equal(entry.actor.id, 'user-1');
  assert.equal(entry.actor.companyId, 'company-1');
  const m = entry.metadata;
  assert.equal(m.quoteId, QUOTE_ID);
  assert.equal(m.quoteItemId, ITEM_ID);
  assert.equal(m.serviceType, 'MEAL');
  assert.equal(m.previousItemTotalCost, 100);
  assert.equal(m.newItemTotalCost, 150);
  assert.equal(m.deltaItemCost, 50);
  assert.equal(m.newItemTotalSell, 180);
  assert.equal(m.deltaItemSell, 60);
  assert.equal(m.acknowledgedDelta, true);
  assert.equal(m.integrityOk, true);
  assert.equal(m.appliedPayload.customServiceName, 'Lunch'); // from MEAL_DATA, no token leaked
  assert.ok(!('previewToken' in m.appliedPayload), 'audit payload must not include the preview token');
});

test('apply still succeeds even if the audit log throws (audit must not block apply)', async () => {
  enable(true, true);
  const { svc, calls } = makeService({ resolved: { cost: 150, sell: 180 } });
  (svc as any).auditService = { log: async () => { throw new Error('audit DB down'); } };
  const token = await mintToken(svc);
  const out: any = await svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR);
  assert.equal(out.applied, true);
  assert.equal(calls.updateItem, 1);
});

// ── Read-only pricing-apply audit viewer (getPricingApplyAudit) ──────────────

const AUDIT_ROWS = [
  {
    id: 'a1', userId: 'user-1', entityId: ITEM_ID, action: 'quote.pricing.apply',
    createdAt: new Date('2026-06-10T09:30:00.000Z'),
    metadata: {
      quoteId: QUOTE_ID, quoteItemId: ITEM_ID, serviceType: 'MEAL',
      previousItemTotalCost: 100, previousItemTotalSell: 120,
      newItemTotalCost: 150, newItemTotalSell: 180,
      deltaItemCost: 50, deltaItemSell: 60,
      newQuoteTotalCost: 1050, newQuoteTotalSell: 1260,
      deltaQuoteCost: 50, deltaQuoteSell: 60,
      acknowledgedDelta: true, integrityOk: true,
      // Simulate a hostile metadata blob: a secret-looking key must NOT surface.
      previewToken: 'v1.SECRET.SIGNATURE',
      appliedPayload: { customServiceName: 'Lunch', unitCost: 75, quantity: 2, previewToken: 'v1.SECRET.SIGNATURE' },
    },
  },
  // Same quote but a DIFFERENT action — must be excluded by the action filter.
  {
    id: 'a2', userId: 'user-1', entityId: ITEM_ID, action: 'quote.update',
    createdAt: new Date('2026-06-11T09:30:00.000Z'),
    metadata: { quoteId: QUOTE_ID, secret: 'should-not-appear' },
  },
  // Right action but a DIFFERENT quote — must be excluded by the quote filter.
  {
    id: 'a3', userId: 'user-2', entityId: 'other-item', action: 'quote.pricing.apply',
    createdAt: new Date('2026-06-12T09:30:00.000Z'),
    metadata: { quoteId: 'OTHER-QUOTE', serviceType: 'GUIDE' },
  },
];

test('audit viewer returns only quote.pricing.apply entries for the requested quote', async () => {
  const { svc } = makeService({
    auditRows: AUDIT_ROWS,
    users: [{ id: 'user-1', firstName: 'Ada', lastName: 'Ops', email: 'ada@example.com' }],
  });
  const rows: any[] = await (svc as any).getPricingApplyAudit(QUOTE_ID, ACTOR);
  assert.equal(rows.length, 1, 'only the matching quote+action entry is returned');
  assert.equal(rows[0].id, 'a1');
  assert.equal(rows[0].serviceType, 'MEAL');
  assert.equal(rows[0].previousItemTotalCost, 100);
  assert.equal(rows[0].newItemTotalCost, 150);
  assert.equal(rows[0].deltaItemCost, 50);
  assert.equal(rows[0].acknowledgedDelta, true);
  assert.equal(rows[0].integrityOk, true);
  assert.equal(rows[0].actor.name, 'Ada Ops');
  assert.equal(rows[0].actor.email, 'ada@example.com');
});

test('audit viewer never leaks tokens/secrets from metadata or appliedPayload', async () => {
  const { svc } = makeService({ auditRows: AUDIT_ROWS, users: [] });
  const rows: any[] = await (svc as any).getPricingApplyAudit(QUOTE_ID, ACTOR);
  const hay = JSON.stringify(rows);
  assert.ok(!hay.includes('SECRET'), 'no preview-token secret in the serialized output');
  assert.ok(!hay.includes('previewToken'), 'no previewToken key surfaced');
  assert.ok(!('previewToken' in rows[0]), 'top-level previewToken absent');
  assert.ok(!('previewToken' in rows[0].appliedPayload), 'appliedPayload previewToken absent');
  // The whitelisted payload fields are still present.
  assert.equal(rows[0].appliedPayload.customServiceName, 'Lunch');
  assert.equal(rows[0].appliedPayload.quantity, 2);
});

test('audit viewer returns an empty list when there are no apply entries', async () => {
  const { svc } = makeService({ auditRows: [], users: [] });
  const rows: any[] = await (svc as any).getPricingApplyAudit(QUOTE_ID, ACTOR);
  assert.deepEqual(rows, []);
});

test('audit viewer is quote-access-scoped (missing quote → 400 Quote not found)', async () => {
  const { svc } = makeService({ auditRows: AUDIT_ROWS, users: [] });
  await expectHttp(() => (svc as any).getPricingApplyAudit('missing-quote-id', ACTOR), 400, 'Quote not found');
});
