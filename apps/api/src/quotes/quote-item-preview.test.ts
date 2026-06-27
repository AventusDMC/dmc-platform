import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';
import { isQuotePricingPreviewEnabled } from './quote-pricing-preview-flags';

const ACTOR = { companyId: 'company-1' } as any;

function enablePreview() {
  process.env.QUOTE_PRICING_PREVIEW = '1';
  // Entrance preview is a separate scope (default OFF); reset it here so only the
  // entrance test that opts in exercises the Jordan-Pass branch.
  delete process.env.QUOTE_PRICING_ENTRANCE_PREVIEW;
}
function disablePreview() {
  delete process.env.QUOTE_PRICING_PREVIEW;
  delete process.env.QUOTE_PRICING_ENTRANCE_PREVIEW;
}

type Opts = {
  quote?: any;
  item?: any;
  entranceItems?: any[];
  passProduct?: any;
  variants?: Record<string, any>;
  resolveStub?: (input: any) => Promise<any>;
  pricingStub?: (args: any) => any;
};

function makeService(opts: Opts) {
  const writes: Array<{ op: string; args: any }> = [];
  const prisma = {
    quote: {
      findFirst: async ({ where }: any) => {
        if (!opts.quote || where.id !== opts.quote.id) return null;
        return {
          clientCompanyId: 'company-1',
          brandCompanyId: null,
          ...opts.quote,
        };
      },
      findUnique: async () => {
        throw new Error('recalc quote.findUnique must not run during preview');
      },
    },
    quoteItem: {
      findFirst: async ({ where }: any) => {
        if (opts.item && where.id === opts.item.id && where.quoteId === opts.item.quoteId) {
          return opts.item;
        }
        return null;
      },
      findMany: async () => opts.entranceItems ?? [],
      aggregate: async () => ({ _count: { _all: (opts.entranceItems?.length ?? 1) }, _max: { updatedAt: null } }),
      update: async (args: any) => {
        writes.push({ op: 'update', args });
        throw new Error('quoteItem.update must not run during preview');
      },
      create: async (args: any) => {
        writes.push({ op: 'create', args });
        throw new Error('quoteItem.create must not run during preview');
      },
      delete: async (args: any) => {
        writes.push({ op: 'delete', args });
        throw new Error('quoteItem.delete must not run during preview');
      },
    },
    jordanPassProduct: {
      findUnique: async () => opts.passProduct ?? null,
    },
    ticketRateVariant: {
      findUnique: async ({ where }: any) => opts.variants?.[where.id] ?? null,
    },
  };

  const service = new QuotesService(
    prisma as any,
    {} as any,
    { findMatchingRate: async () => { throw new Error('Unexpected transport pricing lookup'); } } as any,
    { evaluate: async () => null } as any,
    new QuotePricingService(),
  );

  // Guard rails: any write-heavy/recalc path is a hard failure for a dry-run preview.
  (service as any).recalculateQuoteTotals = async () => {
    throw new Error('recalculateQuoteTotals must not run during preview');
  };
  (service as any).syncJordanPassEntranceFees = async () => {
    throw new Error('syncJordanPassEntranceFees must not run during preview');
  };
  if (opts.resolveStub) (service as any).resolveQuoteItemValues = opts.resolveStub;
  if (opts.pricingStub) (service as any).calculateCentralizedQuoteItemPricing = opts.pricingStub;

  return { service, writes };
}

const baseQuote = {
  id: 'q1',
  status: 'DRAFT',
  adults: 2,
  children: 0,
  roomCount: 1,
  nightCount: 1,
  quoteCurrency: 'USD',
  jordanPassType: 'NONE',
  pricingType: 'FIXED',
  pricingMode: null,
  totalCost: 1000,
  totalSell: 1200,
};

const baseItem = {
  id: 'i1',
  quoteId: 'q1',
  optionId: null,
  entranceFeeId: null,
  serviceDate: null,
  transportServiceTypeId: null,
  routeId: null,
  touringRouteId: null,
  serviceId: 's1',
  quantity: 1,
  totalCost: 100,
  totalSell: 120,
};

test('flag default is OFF', () => {
  disablePreview();
  assert.equal(isQuotePricingPreviewEnabled(), false);
});

test('flag OFF → not available, no compute', async () => {
  disablePreview();
  const { service, writes } = makeService({ quote: baseQuote, item: baseItem });
  const res: any = await service.previewUpdateQuoteItem('q1', 'i1', { quantity: 2 }, ACTOR);
  assert.equal(res.available, false);
  assert.equal(res.blocked, true);
  assert.equal(res.blockedReason, 'feature_disabled');
  assert.equal(writes.length, 0);
});

test('status not in allowlist → blocked (SENT and unknown)', async () => {
  enablePreview();
  for (const status of ['SENT', 'ACCEPTED', 'CONFIRMED', 'CANCELLED', 'CONVERTED', '']) {
    const { service } = makeService({ quote: { ...baseQuote, status }, item: baseItem });
    const res: any = await service.previewUpdateQuoteItem('q1', 'i1', { quantity: 2 }, ACTOR);
    assert.equal(res.blocked, true, `status ${status}`);
    assert.equal(res.blockedReason, 'status', `status ${status}`);
  }
});

test('allowed statuses are not status-blocked', async () => {
  enablePreview();
  for (const status of ['DRAFT', 'READY', 'REVISION_REQUESTED']) {
    const { service } = makeService({
      quote: { ...baseQuote, status },
      item: baseItem,
      resolveStub: async () => ({ data: { totalCost: 100, totalSell: 120 } }),
    });
    const res: any = await service.previewUpdateQuoteItem('q1', 'i1', {}, ACTOR);
    assert.notEqual(res.blockedReason, 'status', `status ${status}`);
  }
});

test('cross-quote item id is rejected', async () => {
  enablePreview();
  const { service } = makeService({ quote: baseQuote, item: { ...baseItem, quoteId: 'OTHER' } });
  await assert.rejects(() => service.previewUpdateQuoteItem('q1', 'i1', { quantity: 2 }, ACTOR), /not found for this quote/);
});

test('invalid payload (quantity <= 0) returns a clear error', async () => {
  enablePreview();
  const { service } = makeService({ quote: baseQuote, item: baseItem });
  await assert.rejects(() => service.previewUpdateQuoteItem('q1', 'i1', { quantity: 0 }, ACTOR), /quantity must be a positive number/);
});

test('transport item without an effective serviceDate is rejected', async () => {
  enablePreview();
  const transportItem = { ...baseItem, routeId: 'r1' };
  const { service } = makeService({ quote: baseQuote, item: transportItem });
  await assert.rejects(
    () => service.previewUpdateQuoteItem('q1', 'i1', { quantity: 2 }, ACTOR),
    /serviceDate is required/,
  );
});

test('non-entrance edit: projects item + quote totals via delta, persists nothing', async () => {
  enablePreview();
  const { service, writes } = makeService({
    quote: baseQuote,
    item: baseItem,
    resolveStub: async () => ({ data: { totalCost: 150, totalSell: 180 } }),
  });
  const res: any = await service.previewUpdateQuoteItem('q1', 'i1', { quantity: 2 }, ACTOR);

  assert.equal(res.blocked, false);
  assert.equal(res.pricingResolvable, true);
  // item deltas
  assert.deepEqual(res.item.current, { totalCost: 100, totalSell: 120 });
  assert.deepEqual(res.item.projected, { totalCost: 150, totalSell: 180 });
  assert.deepEqual(res.item.delta, { totalCost: 50, totalSell: 60 });
  // quote deltas (FIXED → additive)
  assert.deepEqual(res.quote.current, { totalCost: 1000, totalSell: 1200 });
  assert.deepEqual(res.quote.projected, { totalCost: 1050, totalSell: 1260 });
  assert.deepEqual(res.quote.delta, { totalCost: 50, totalSell: 60 });
  assert.equal(res.affectedItemCount, 1);
  assert.equal(res.jordanPass, null);
  assert.deepEqual(res.reResolved, { rates: true, fx: false });
  assert.equal(writes.length, 0);
});

test('SLAB mode: selling price is slab-driven so the edit changes cost only', async () => {
  enablePreview();
  const { service } = makeService({
    quote: { ...baseQuote, pricingMode: 'SLAB', pricingType: 'GROUP' },
    item: baseItem,
    resolveStub: async () => ({ data: { totalCost: 150, totalSell: 180 } }),
  });
  const res: any = await service.previewUpdateQuoteItem('q1', 'i1', { quantity: 2 }, ACTOR);
  assert.equal(res.quote.projected.totalSell, 1200); // unchanged
  assert.equal(res.quote.delta.totalSell, 0);
  assert.equal(res.quote.delta.totalCost, 50);
  assert.ok(res.warnings.some((w: string) => /SLAB/.test(w)));
});

test('no-op edit projects totals identical to current (delta zero)', async () => {
  enablePreview();
  const { service } = makeService({
    quote: baseQuote,
    item: baseItem,
    resolveStub: async () => ({ data: { totalCost: 100, totalSell: 120 } }),
  });
  const res: any = await service.previewUpdateQuoteItem('q1', 'i1', {}, ACTOR);
  assert.deepEqual(res.quote.projected, res.quote.current);
  assert.deepEqual(res.item.delta, { totalCost: 0, totalSell: 0 });
  assert.equal(res.affectedItemCount, 0);
});

test('entrance-fee edit: Jordan Pass projection (PR #547 pure path), persists nothing', async () => {
  enablePreview();
  // Entrance preview is gated behind its own flag (PR #561, default OFF).
  process.env.QUOTE_PRICING_ENTRANCE_PREVIEW = '1';
  const entranceItem = {
    id: 'e1',
    quoteId: 'q1',
    optionId: null,
    entranceFeeId: 'ef1',
    serviceId: 's-ent',
    serviceDate: null,
    transportServiceTypeId: null,
    routeId: null,
    touringRouteId: null,
    quantity: 1,
    paxCount: 1,
    markupPercent: 0,
    totalCost: 10,
    totalSell: 10,
    entranceFee: { siteName: 'Jerash', includedInJordanPass: false, foreignerFeeJod: 10 },
    ticketRateVariant: null,
    service: { category: 'TICKET', unitType: 'per_person', serviceType: { name: 'Entrance', code: 'ENTRANCE' } },
  };
  // Deterministic pricing: cost = unitCost * quantity (covered → unitCost 0).
  const pricingStub = (args: any) => ({
    totalCost: Number(args.unitCost) * Number(args.quantity ?? 1),
    totalSell: Number(args.unitCost) * Number(args.quantity ?? 1),
    quoteCurrency: 'USD',
    fxRate: 1,
    fxFromCurrency: 'USD',
    fxToCurrency: 'USD',
    fxRateDate: new Date('2026-04-23T00:00:00.000Z'),
  });
  const { service, writes } = makeService({
    quote: baseQuote,
    item: entranceItem,
    entranceItems: [entranceItem],
    pricingStub,
  });
  const res: any = await service.previewUpdateQuoteItem('q1', 'e1', { quantity: 2 }, ACTOR);

  assert.equal(res.blocked, false);
  // uncovered Jerash entrance, fee 10: cost 10 (qty1) → 20 (qty2)
  assert.equal(res.item.delta.totalCost, 10);
  assert.equal(res.quote.delta.totalCost, 10);
  assert.equal(res.quote.projected.totalCost, 1010);
  assert.ok(res.jordanPass && (res.jordanPass as any).changed === true);
  assert.equal((res.jordanPass as any).affectedEntranceItems[0].itemId, 'e1');
  assert.equal(res.affectedItemCount, 1);
  assert.equal(writes.length, 0);
});

test('controller exposes the preview route, admin/operations only', () => {
  const src = readFileSync(join(__dirname, 'quotes.controller.ts'), 'utf8');
  assert.ok(src.includes("@Post(':id/items/:itemId/preview')"));
  assert.ok(src.includes('previewUpdateQuoteItem'));
  // The preview route is gated to admin/operations (stricter than the item PATCH).
  const idx = src.indexOf("@Post(':id/items/:itemId/preview')");
  const window = src.slice(idx, idx + 200);
  assert.ok(window.includes("@Roles('admin', 'operations')"), 'preview route must be admin/operations only');
});
