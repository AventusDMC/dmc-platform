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
  };

  const svc = new QuotesService(
    prisma as any,
    {} as any,
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

  return { svc, db, calls };
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

test('meal-only: non-meal (transport) item apply → 400 out-of-scope, no write', async () => {
  enable(true, true);
  const { svc, calls } = makeService({ transport: true, service: { category: 'transport', serviceType: { code: 'POINT_TO_POINT', name: 'Transfer' } } });
  const token = await mintToken(svc);
  await expectHttp(() => svc.applyPreviewQuoteItem(QUOTE_ID, ITEM_ID, MEAL_DATA, token, true, ACTOR), 400, 'meal items');
  assert.equal(calls.updateItem, 0);
  assert.equal(calls.writes, 0);
});
