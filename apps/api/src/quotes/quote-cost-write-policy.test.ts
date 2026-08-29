import assert = require('node:assert/strict');
import test = require('node:test');
import { QuotesController } from './quotes.controller';
import {
  NON_FINANCE_RESTRICTED_QUOTE_ITEM_WRITE_KEYS,
  stripRestrictedQuoteCostWriteFields,
} from './quote-cost-write-policy';

// Synthetic sentinels only — never real cost/supplier/business values.
const COST_SENTINEL = 999999;
const SUPPLIER_SENTINEL = 'SENTINEL-SUPPLIER';
const NOTE_SENTINEL = 'SENTINEL-INTERNAL-NOTE';
const MATRIX_SENTINEL = { SENTINEL: 1 };
const SELL_SENTINEL = 4242;

function restrictedBody(extra: Record<string, any> = {}) {
  return {
    // restricted (must be stripped for non-finance)
    totalCost: COST_SENTINEL, baseCost: COST_SENTINEL, costBaseAmount: COST_SENTINEL,
    overrideCost: COST_SENTINEL, useOverride: true, finalCost: COST_SENTINEL, netCost: COST_SENTINEL,
    cost: COST_SENTINEL, markupPercent: COST_SENTINEL, markupAmount: COST_SENTINEL,
    externalNetCost: COST_SENTINEL, externalPackagePricingMatrixJson: MATRIX_SENTINEL,
    externalSupplierName: SUPPLIER_SENTINEL, externalInternalNotes: NOTE_SENTINEL,
    overrideReason: NOTE_SENTINEL, fxRate: COST_SENTINEL, fxFromCurrency: 'USD', fxToCurrency: 'JOD',
    fxRateDate: '2026-01-01', jordanPassSavingsJod: COST_SENTINEL,
    unitCost: COST_SENTINEL, supplierName: SUPPLIER_SENTINEL, internalNotes: NOTE_SENTINEL,
    pricingMatrixJson: MATRIX_SENTINEL,
    // sell-side / operational (must be preserved)
    sellPrice: SELL_SENTINEL, sellPriceOverrideExplicit: true, singleSupplement: 50,
    quantity: 2, serviceDate: '2026-05-01', pickupLocation: 'Airport',
    ...extra,
  };
}

const FINANCE_ROLES = ['admin', 'super_admin', 'finance'];
const NON_FINANCE_ROLES = ['operations', 'viewer', 'agent', 'agent_admin', 'marketing-unknown', undefined];

// ---------------------------------------------------------------------------
// Policy helper
// ---------------------------------------------------------------------------

for (const role of FINANCE_ROLES) {
  test(`policy: finance role "${role}" keeps the body unchanged (same reference, cost intact)`, () => {
    const body = restrictedBody();
    const out = stripRestrictedQuoteCostWriteFields(body, { role } as any);
    assert.equal(out, body); // unchanged reference
    assert.equal(out.overrideCost, COST_SENTINEL);
    assert.equal(out.netCost, COST_SENTINEL);
    assert.equal(out.markupPercent, COST_SENTINEL);
  });
}

for (const role of NON_FINANCE_ROLES) {
  test(`policy: non-finance role "${role ?? 'missing'}" strips every restricted key, keeps sell-side, no mutation`, () => {
    const body = restrictedBody();
    const before = { ...body };
    const out = stripRestrictedQuoteCostWriteFields(body, (role === undefined ? undefined : { role }) as any);
    // Fresh object — input not mutated.
    assert.notEqual(out, body);
    assert.deepEqual(body, before);
    // Every restricted key removed.
    for (const key of NON_FINANCE_RESTRICTED_QUOTE_ITEM_WRITE_KEYS) {
      assert.equal(key in out, false, `restricted key ${key} must be absent`);
    }
    // No sentinel value survives anywhere.
    const serialized = JSON.stringify(out);
    assert.equal(serialized.includes(String(COST_SENTINEL)), false);
    assert.equal(serialized.includes(SUPPLIER_SENTINEL), false);
    assert.equal(serialized.includes(NOTE_SENTINEL), false);
    assert.equal(serialized.includes('SENTINEL'), false);
    // Sell-side / operational preserved.
    assert.equal(out.sellPrice, SELL_SENTINEL);
    assert.equal(out.sellPriceOverrideExplicit, true);
    assert.equal(out.singleSupplement, 50);
    assert.equal(out.quantity, 2);
    assert.equal(out.pickupLocation, 'Airport');
  });
}

// ---------------------------------------------------------------------------
// Controller wiring — each non-finance-reachable mutation strips before the service
// ---------------------------------------------------------------------------

function makeActor(role: string) {
  return { id: 'user-1', companyId: 'dmc-company', role } as any;
}

function createController() {
  const captured: Record<string, any> = {};
  const quotesService: any = {
    findOne: async () => ({ id: 'quote-1', clientCompanyId: 'dmc-company' }),
    createItem: async (input: any) => { captured.createItem = input; return { id: 'item-1' }; },
    updateItem: async (_itemId: string, input: any) => { captured.updateItem = input; return { id: 'item-1' }; },
    createOptionItem: async (_optionId: string, input: any) => { captured.createOptionItem = input; return { id: 'oi-1' }; },
    updateOptionItem: async (_optionId: string, _itemId: string, input: any) => { captured.updateOptionItem = input; return { id: 'oi-1' }; },
    expandExcursionTemplateIntoQuote: async (input: any) => { captured.expand = input; return { ok: true }; },
    previewUpdateQuoteItem: async (_id: string, _itemId: string, input: any) => { captured.preview = input; return { ok: true }; },
    applyPreviewQuoteItem: async (_id: string, _itemId: string, input: any) => { captured.applyPreview = input; return { ok: true }; },
  };
  const controller = new QuotesController(quotesService, {} as any);
  return { controller, captured };
}

test('wiring: viewer createItem strips restricted cost, preserves sellPrice', async () => {
  const { controller, captured } = createController();
  await controller.createItem('quote-1', restrictedBody() as any, {}, makeActor('viewer'));
  const i = captured.createItem;
  assert.equal(i.overrideCost, undefined);
  assert.equal(i.useOverride, undefined);
  assert.equal(i.netCost, undefined);
  assert.equal(i.unitCost, undefined);
  assert.equal(i.supplierName, undefined);
  assert.equal(i.internalNotes, undefined);
  assert.equal(i.pricingMatrixJson, undefined);
  assert.equal(i.markupPercent, 0); // stripped -> default 0, never the sentinel
  assert.notEqual(i.markupPercent, COST_SENTINEL);
  assert.equal(i.sellPrice, SELL_SENTINEL); // sell-side preserved
});

test('wiring: finance createItem passes restricted cost through unchanged', async () => {
  const { controller, captured } = createController();
  await controller.createItem('quote-1', restrictedBody() as any, {}, makeActor('finance'));
  const i = captured.createItem;
  assert.equal(i.overrideCost, COST_SENTINEL);
  assert.equal(i.netCost, COST_SENTINEL);
  assert.equal(i.supplierName, SUPPLIER_SENTINEL);
  assert.equal(i.markupPercent, COST_SENTINEL);
  assert.equal(i.sellPrice, SELL_SENTINEL);
});

test('wiring: viewer updateItem omits restricted cost (undefined => preserve stored), keeps operational', async () => {
  const { controller, captured } = createController();
  await controller.updateItem('quote-1', 'item-1', restrictedBody() as any, {}, makeActor('viewer'));
  const i = captured.updateItem;
  assert.equal(i.overrideCost, undefined);
  assert.equal(i.useOverride, undefined);
  assert.equal(i.markupPercent, undefined);
  assert.equal(i.markupAmount, undefined);
  assert.equal(i.netCost, undefined);
  assert.equal(i.supplierName, undefined);
  assert.equal(i.internalNotes, undefined);
  assert.equal(i.sellPrice, SELL_SENTINEL);
  assert.equal(i.pickupLocation, 'Airport');
});

test('wiring: finance updateItem passes restricted cost through', async () => {
  const { controller, captured } = createController();
  await controller.updateItem('quote-1', 'item-1', restrictedBody() as any, {}, makeActor('finance'));
  assert.equal(captured.updateItem.overrideCost, COST_SENTINEL);
  assert.equal(captured.updateItem.markupPercent, COST_SENTINEL);
});

test('wiring: operations previewItem + applyPreviewItem strip restricted cost (no trusted round-trip)', async () => {
  const { controller, captured } = createController();
  await controller.previewItem('quote-1', 'item-1', restrictedBody() as any, makeActor('operations'));
  await controller.applyPreviewItem('quote-1', 'item-1', restrictedBody({ previewToken: 't', acknowledgedDelta: true }) as any, makeActor('operations'));
  for (const cap of [captured.preview, captured.applyPreview]) {
    assert.equal(cap.overrideCost, undefined);
    assert.equal(cap.useOverride, undefined);
    assert.equal(cap.netCost, undefined);
    assert.equal(cap.markupPercent, undefined);
    assert.equal(cap.sellPrice, SELL_SENTINEL);
  }
});

test('wiring: viewer expandExcursionTemplate strips markupPercent, keeps operational', async () => {
  const { controller, captured } = createController();
  await controller.expandExcursionTemplate('quote-1', 'tmpl-1', { markupPercent: COST_SENTINEL, paxCount: 3, quantity: 1 } as any, makeActor('viewer'));
  assert.equal(captured.expand.markupPercent, undefined);
  assert.equal(captured.expand.paxCount, 3);
});

test('wiring: viewer create/updateOptionItem strip restricted cost, keep sellPrice', async () => {
  const { controller, captured } = createController();
  await controller.createOptionItem('quote-1', 'opt-1', restrictedBody() as any, {}, makeActor('viewer'));
  await controller.updateOptionItem('quote-1', 'opt-1', 'oi-1', restrictedBody() as any, {}, makeActor('viewer'));
  for (const cap of [captured.createOptionItem, captured.updateOptionItem]) {
    assert.equal(cap.overrideCost, undefined);
    assert.equal(cap.netCost, undefined);
    assert.equal(cap.supplierName, undefined);
    assert.equal(cap.internalNotes, undefined);
    assert.equal(cap.sellPrice, SELL_SENTINEL);
  }
});
