import { test, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuoteExperiencesV2Service } from './quote-experiences-v2.service';
import { buildCreatePreviewToken } from './quote-create-preview-token';
import { buildPreviewToken, getPreviewTokenSecret } from './quote-preview-token';
import {
  EXTERNAL_PACKAGE_EDIT_TOKEN_KIND,
  buildExternalPackageEditToken,
  verifyExternalPackageEditToken,
} from './quote-external-package-edit-preview-token';
import { EXPERIENCE_DEFAULT_MARKUP } from '../common/pricing-constants';

// ═══════════════════════════════════════════════════════════════════════════
// E-a: guarded external-package COMMERCIAL EDIT (netCost + pricingBasis only).
// Self-contained harness with fakes for PrismaService + the delegated QuotesService
// (previewUpdateQuoteItem = pure projection, updateItem = write + recalc) + AuditService.
// A small MUTABLE state mimics recalc so the guard chain (finance → strict-DRAFT →
// eligibility → v2e token → snapshot → confirmation → post-write integrity) can be
// exercised without a DB. The production pricing-apply path is never touched.
// ═══════════════════════════════════════════════════════════════════════════

const QID = 'quote-1';
const DAY = 'day-1';
const EDIT_ITEM = 'item-ext-1';
const FIN_ACTOR = { id: 'user-1', companyId: 'company-A', auditLabel: 'Alice', role: 'admin' as const };

// The ONLY edit-eligible shape: positively-classified, one-off, service-less, matrix-less,
// override-free external package on the standard markup.
const EDITABLE_EXTERNAL = {
  id: EDIT_ITEM,
  quoteId: QID,
  serviceId: null,
  activityId: null,
  hotelId: null,
  transportServiceTypeId: null,
  routeId: null,
  vehicleId: null,
  touringRouteId: null,
  externalPackageName: 'Desert Camp Package',
  externalPricingBasis: 'PER_PERSON',
  externalNetCost: 100,
  externalPackagePricingMatrixJson: null,
  useOverride: false,
  sellPrice: null,
  markupPercent: EXPERIENCE_DEFAULT_MARKUP,
  currency: 'USD',
  totalCost: 200, // 100 × 2 pax
  totalSell: 240, // × 1.2
  service: null,
};

type EditOptions = {
  flag?: boolean;
  quote?: any;
  newerRevision?: { id: string } | null;
  item?: any; // quoteItem.findUnique result (undefined → EDITABLE_EXTERNAL; null → not found)
  preTotals?: { totalCost: number; totalSell: number };
  seedItems?: { id: string; totalCost: number; totalSell: number }[];
  projItem?: { cost: number; sell: number }; // projected item totals from previewUpdateQuoteItem
  slab?: boolean; // if true, the fake holds the quote sell FLAT (SLAB)
  previewThrows?: boolean;
  updateThrows?: boolean;
  auditThrows?: boolean;
  driftCost?: number; // injected post-write drift (BEYOND the item contribution)
  driftSell?: number;
};

function setEditFlag(on: boolean) {
  if (on) process.env.QUOTE_EXTERNAL_PACKAGE_EDIT = 'true';
  else delete process.env.QUOTE_EXTERNAL_PACKAGE_EDIT;
}
afterEach(() => {
  delete process.env.QUOTE_EXTERNAL_PACKAGE_EDIT;
  delete process.env.QUOTE_ITEM_CREATE;
});

function buildEdit(opts: EditOptions = {}) {
  const calls: Record<string, any[]> = { previewUpdate: [], updateItem: [], auditLog: [] };
  const item = opts.item === undefined ? EDITABLE_EXTERNAL : opts.item;
  const preTotals = opts.preTotals ?? { totalCost: 200, totalSell: 240 };
  const projItem = opts.projItem ?? { cost: 300, sell: 360 }; // e.g. netCost 100→150
  const state = {
    totals: { ...preTotals },
    items: [...(opts.seedItems ?? [{ id: EDIT_ITEM, totalCost: 200, totalSell: 240 }])],
  };
  const curItemCost = Number(item?.totalCost ?? 0);
  const curItemSell = Number(item?.totalSell ?? 0);
  const itemCostDelta = projItem.cost - curItemCost;
  const itemSellDelta = projItem.sell - curItemSell;

  const prisma = {
    quote: {
      findFirst: async (args: any) => {
        if (args?.where?.revisedFromId) return opts.newerRevision ?? null;
        return opts.quote === undefined
          ? { id: QID, brandCompanyId: null, status: 'DRAFT', quoteCurrency: 'USD', acceptedVersionId: null }
          : opts.quote;
      },
      findUnique: async () => ({
        totalCost: state.totals.totalCost,
        totalSell: state.totals.totalSell,
        quoteCurrency: 'USD',
        acceptedVersionId: opts.quote?.acceptedVersionId ?? null,
      }),
    },
    quoteItem: {
      findUnique: async () => (opts.item === undefined ? EDITABLE_EXTERNAL : opts.item),
      findMany: async () => state.items,
    },
    quoteItineraryDayItem: { findFirst: async () => ({ dayId: DAY }) },
  };

  const quotes = {
    previewUpdateQuoteItem: async (quoteId: string, itemId: string, data: any, actor: any) => {
      calls.previewUpdate.push({ quoteId, itemId, data, actor });
      if (opts.previewThrows) throw new Error('preview boom');
      const projQuoteCost = state.totals.totalCost + itemCostDelta;
      const projQuoteSell = opts.slab ? state.totals.totalSell : state.totals.totalSell + itemSellDelta;
      return {
        item: {
          current: { totalCost: curItemCost, totalSell: curItemSell },
          projected: { totalCost: projItem.cost, totalSell: projItem.sell },
          delta: { totalCost: itemCostDelta, totalSell: itemSellDelta },
        },
        quote: {
          current: { totalCost: state.totals.totalCost, totalSell: state.totals.totalSell },
          projected: { totalCost: projQuoteCost, totalSell: projQuoteSell },
          delta: { totalCost: itemCostDelta, totalSell: opts.slab ? 0 : itemSellDelta },
        },
        pricingBasis: data.pricingBasis ?? item?.externalPricingBasis ?? null,
        // The embedded v2s apply-path token that the edit MUST discard.
        previewToken: buildPreviewToken({ quoteId: QID, itemId: EDIT_ITEM, issuedAt: 1, exp: 9_999_999_999 }, getPreviewTokenSecret()),
      };
    },
    updateItem: async (itemId: string, data: any, actor: any) => {
      calls.updateItem.push({ itemId, data, actor });
      if (opts.updateThrows) throw new Error('update boom');
      const idx = state.items.findIndex((i) => i.id === itemId);
      // On the FIRST call, reprice to the projection (+ any injected drift). On a
      // compensating SECOND call (restore to the prior netCost), no drift is applied.
      const isRestore = calls.updateItem.length > 1;
      const newCost = isRestore ? curItemCost : projItem.cost + (opts.driftCost ?? 0);
      const newSell = isRestore ? curItemSell : projItem.sell + (opts.driftSell ?? 0);
      if (idx >= 0) {
        state.totals.totalCost += newCost - state.items[idx].totalCost;
        state.totals.totalSell += newSell - state.items[idx].totalSell;
        state.items[idx] = { id: itemId, totalCost: newCost, totalSell: newSell };
      }
      return { id: itemId, totalCost: newCost, totalSell: newSell, currency: 'USD' };
    },
  };

  const audit = {
    log: async (values: any) => {
      calls.auditLog.push(values);
      if (opts.auditThrows) throw new Error('audit boom');
      return { id: 'audit-1' };
    },
  };

  setEditFlag(opts.flag ?? true);
  const service = new QuoteExperiencesV2Service(prisma as any, quotes as any, audit as any);
  return { service, calls, state };
}

async function expectRejects(promise: Promise<unknown>, codeOrText: string) {
  await assert.rejects(promise, (err: any) => {
    const response = err?.response ?? err;
    const code = response?.code;
    const message = Array.isArray(response?.message) ? response.message.join('; ') : response?.message ?? err?.message;
    assert.ok(
      code === codeOrText || String(message).includes(codeOrText),
      `expected code/message to include "${codeOrText}", got code=${code} message=${message}`,
    );
    return true;
  });
}

function v2sToken(): string {
  return buildPreviewToken({ quoteId: QID, itemId: EDIT_ITEM, issuedAt: 1, exp: 9_999_999_999 }, getPreviewTokenSecret());
}

async function editToken(service: QuoteExperiencesV2Service, input: any = { netCost: 150 }, actor: any = FIN_ACTOR): Promise<string> {
  const res: any = await service.previewExternalPackageEdit(QID, EDIT_ITEM, input, actor);
  return res.previewToken as string;
}

// ── Gate ──
test('edit: preview + apply are feature_disabled when the flag is OFF and write nothing', async () => {
  const { service, calls } = buildEdit({ flag: false });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'feature_disabled');
  await expectRejects(service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: 'x' }), 'feature_disabled');
  assert.equal(calls.updateItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

// ── Finance-only (at the SERVICE, not @Roles alone) ──
for (const role of ['operations', 'agent_admin', 'agent', 'viewer']) {
  test(`edit: role ${role} is blocked external_package_finance_only on preview AND apply`, async () => {
    const { service, calls } = buildEdit({});
    const actor = { id: 'u', companyId: 'company-A', auditLabel: 'x', role: role as any };
    await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, actor), 'external_package_finance_only');
    await expectRejects(service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, actor, { previewToken: 'x' }), 'external_package_finance_only');
    assert.equal(calls.updateItem.length, 0);
  });
}

test('edit: a finance role is allowed to preview', async () => {
  const { service } = buildEdit({});
  const finance = { id: 'u', companyId: 'company-A', auditLabel: 'F', role: 'finance' as const };
  const res: any = await service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, finance);
  assert.equal(res.itemType, 'external_package');
});

// ── Eligibility ──
test('edit: a hotel item is rejected not_external_package', async () => {
  const { service } = buildEdit({ item: { ...EDITABLE_EXTERNAL, externalPackageName: null, hotelId: 'hot-1' } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'not_external_package');
});

test('edit: a transport item is rejected not_external_package', async () => {
  const { service } = buildEdit({ item: { ...EDITABLE_EXTERNAL, externalPackageName: null, transportServiceTypeId: 'tst-1' } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'not_external_package');
});

test('edit: a catalog-service item (activity group) is rejected not_external_package', async () => {
  const { service } = buildEdit({
    item: { ...EDITABLE_EXTERNAL, externalPackageName: null, service: { category: 'activity', serviceType: { name: 'Activity', code: 'ACTIVITY' } } },
  });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'not_external_package');
});

test('edit: an external package WITH a serviceId is rejected not_external_package (must be one-off)', async () => {
  const { service } = buildEdit({ item: { ...EDITABLE_EXTERNAL, serviceId: 'svc-x' } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'not_external_package');
});

test('edit: a matrix-priced external package is rejected matrix_pricing_unsupported', async () => {
  const { service } = buildEdit({ item: { ...EDITABLE_EXTERNAL, externalPackagePricingMatrixJson: [{ pax: 2, cost: 100 }] } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'matrix_pricing_unsupported');
});

test('edit: a useOverride external package is rejected override_pricing_unsupported', async () => {
  const { service } = buildEdit({ item: { ...EDITABLE_EXTERNAL, useOverride: true } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'override_pricing_unsupported');
});

test('edit: a sell-pinned external package (sellPrice != null) is rejected override_pricing_unsupported', async () => {
  const { service } = buildEdit({ item: { ...EDITABLE_EXTERNAL, sellPrice: 500 } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'override_pricing_unsupported');
});

test('edit: a non-standard-markup external package is rejected item_not_editable', async () => {
  const { service } = buildEdit({ item: { ...EDITABLE_EXTERNAL, markupPercent: 35 } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'item_not_editable');
});

test('edit: item not found is rejected item_not_found', async () => {
  const { service } = buildEdit({ item: null });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'item_not_found');
});

test('edit: an item belonging to a different quote is rejected item_not_found', async () => {
  const { service } = buildEdit({ item: { ...EDITABLE_EXTERNAL, quoteId: 'other-quote' } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'item_not_found');
});

// ── Field contract ──
test('edit: no editable fields is rejected no_editable_fields', async () => {
  const { service } = buildEdit({});
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, {}, FIN_ACTOR), 'no_editable_fields');
});

test('edit: a negative netCost is rejected invalid_external_package_cost', async () => {
  const { service } = buildEdit({});
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: -1 }, FIN_ACTOR), 'invalid_external_package_cost');
});

test('edit: an invalid pricingBasis is rejected invalid_pricing_basis', async () => {
  const { service } = buildEdit({});
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { pricingBasis: 'PER_ROOM' }, FIN_ACTOR), 'invalid_pricing_basis');
});

test('edit: a pricingBasis-only patch is accepted', async () => {
  const { service } = buildEdit({ projItem: { cost: 100, sell: 120 } });
  const res: any = await service.previewExternalPackageEdit(QID, EDIT_ITEM, { pricingBasis: 'PER_GROUP' }, FIN_ACTOR);
  assert.deepEqual(res.changedFields, ['pricingBasis']);
});

// ── Pricing / totals / token ──
test('edit: preview projects item + quote deltas, mints a v2e token, and DISCARDS the v2s token', async () => {
  const { service } = buildEdit({ projItem: { cost: 300, sell: 360 } });
  const res: any = await service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR);
  assert.equal(res.item.delta.totalCost, 100); // 300 - 200
  assert.equal(res.item.delta.totalSell, 120); // 360 - 240
  assert.equal(res.quote.delta.totalCost, 100);
  assert.equal(res.quote.delta.totalSell, 120);
  assert.equal(res.pricingMode, 'standard');
  assert.equal(res.requiresAcknowledgement, true);
  // The returned token is the OWN v2e token, NOT the discarded v2s apply-path token.
  assert.ok(String(res.previewToken).startsWith('v2e.'), 'edit response must carry the v2e token');
  const payload = verifyExternalPackageEditToken(res.previewToken, getPreviewTokenSecret());
  assert.equal(payload?.kind, EXTERNAL_PACKAGE_EDIT_TOKEN_KIND);
  assert.equal(payload?.itemId, EDIT_ITEM);
});

test('edit: SLAB quote holds the quote sell flat but still flags the item selling delta', async () => {
  const { service } = buildEdit({ slab: true, projItem: { cost: 300, sell: 360 } });
  const res: any = await service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR);
  assert.equal(res.pricingMode, 'slab');
  assert.equal(res.sellProjected, false);
  assert.equal(res.quote.delta.totalSell, 0);
  assert.equal(res.item.delta.totalSell, 120);
  assert.equal(res.requiresAcknowledgement, true); // item sell moved
});

test('edit: apply commits via updateItem with a SERVER-BUILT {quoteId, netCost} patch only', async () => {
  const { service, calls } = buildEdit({});
  const token = await editToken(service, { netCost: 150 });
  const res: any = await service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: token, acknowledgedDelta: true });
  assert.equal(res.updated, true);
  assert.equal(calls.updateItem.length, 1);
  const data = calls.updateItem[0].data;
  assert.deepEqual(Object.keys(data).sort(), ['netCost', 'quoteId']); // pricingBasis not supplied → not forwarded
  assert.equal(data.netCost, 150);
  assert.equal(data.quoteId, QID);
});

test('edit: apply forwards a supplied pricingBasis (and nothing else)', async () => {
  const { service, calls } = buildEdit({ projItem: { cost: 100, sell: 120 } });
  const token = await editToken(service, { netCost: 100, pricingBasis: 'PER_GROUP' });
  await service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 100, pricingBasis: 'PER_GROUP' }, FIN_ACTOR, { previewToken: token, acknowledgedDelta: true });
  const data = calls.updateItem[0].data;
  assert.deepEqual(Object.keys(data).sort(), ['netCost', 'pricingBasis', 'quoteId']);
  assert.equal(data.pricingBasis, 'PER_GROUP');
});

// ── Lifecycle (strict DRAFT) ──
for (const status of ['SENT', 'READY', 'REVISION_REQUESTED', 'ACCEPTED']) {
  test(`edit: status ${status} is rejected quote_not_editable (strict DRAFT)`, async () => {
    const { service } = buildEdit({ quote: { id: QID, brandCompanyId: null, status, quoteCurrency: 'USD', acceptedVersionId: null } });
    await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'quote_not_editable');
  });
}

test('edit: an accepted quote (acceptedVersionId) is rejected quote_not_editable', async () => {
  const { service } = buildEdit({ quote: { id: QID, brandCompanyId: null, status: 'DRAFT', quoteCurrency: 'USD', acceptedVersionId: 'v-1' } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'quote_not_editable');
});

test('edit: a superseded revision is rejected quote_not_editable', async () => {
  const { service } = buildEdit({ newerRevision: { id: 'newer' } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'Only the latest');
});

test('edit: a quote owned by a different company is rejected', async () => {
  const { service } = buildEdit({ quote: { id: QID, brandCompanyId: 'company-B', status: 'DRAFT', quoteCurrency: 'USD', acceptedVersionId: null } });
  await expectRejects(service.previewExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR), 'different company');
});

// ── Token isolation ──
test('edit: apply rejects a v2c create/delete token (invalid_preview_token)', async () => {
  const { service, calls } = buildEdit({});
  const v2c = buildCreatePreviewToken({ kind: 'v2-item-delete', quoteId: QID, itemId: EDIT_ITEM, exp: 9_999_999_999 }, getPreviewTokenSecret());
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: v2c, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
  assert.equal(calls.updateItem.length, 0);
});

test('edit: apply rejects a v2s pricing-apply token (invalid_preview_token)', async () => {
  const { service, calls } = buildEdit({});
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: v2sToken(), acknowledgedDelta: true }),
    'invalid_preview_token',
  );
  assert.equal(calls.updateItem.length, 0);
});

test('edit: apply rejects a v2e token with the WRONG kind', async () => {
  const { service } = buildEdit({});
  const bad = buildExternalPackageEditToken(
    { kind: 'something-else', quoteId: QID, itemId: EDIT_ITEM, itemType: 'external_package', exp: 9_999_999_999 },
    getPreviewTokenSecret(),
  );
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: bad, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
});

test('edit: apply rejects a tampered token', async () => {
  const { service } = buildEdit({});
  const token = await editToken(service, { netCost: 150 });
  const tampered = token.slice(0, -3) + 'AAA';
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: tampered, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
});

test('edit: apply rejects an expired token', async () => {
  const { service } = buildEdit({});
  const expired = buildExternalPackageEditToken(
    { kind: EXTERNAL_PACKAGE_EDIT_TOKEN_KIND, companyId: 'company-A', quoteId: QID, itemId: EDIT_ITEM, itemType: 'external_package', targetPayloadHash: 'x', snapshotHash: 'y', exp: 1 },
    getPreviewTokenSecret(),
  );
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: expired, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
});

test('edit: apply rejects a token bound to a different item (identity mismatch)', async () => {
  const { service } = buildEdit({});
  const other = buildExternalPackageEditToken(
    { kind: EXTERNAL_PACKAGE_EDIT_TOKEN_KIND, companyId: 'company-A', quoteId: QID, itemId: 'other-item', itemType: 'external_package', targetPayloadHash: 'x', snapshotHash: 'y', exp: 9_999_999_999 },
    getPreviewTokenSecret(),
  );
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: other, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
});

test('edit: apply rejects when the payload changed since the preview (hash mismatch)', async () => {
  const { service } = buildEdit({});
  const token = await editToken(service, { netCost: 150 });
  // Same token, but the apply now requests a DIFFERENT netCost.
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 175 }, FIN_ACTOR, { previewToken: token, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
});

test('edit: apply fails closed stale_preview when the quote moved since the preview', async () => {
  const { service, state, calls } = buildEdit({});
  const token = await editToken(service, { netCost: 150 });
  state.totals.totalCost += 5; // concurrent change after the preview snapshot
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: token, acknowledgedDelta: true }),
    'stale_preview',
  );
  assert.equal(calls.updateItem.length, 0);
});

test('edit-token isolation: the delete flow rejects a v2e edit token', async () => {
  const { service } = buildEdit({});
  const token = await editToken(service, { netCost: 150 });
  process.env.QUOTE_ITEM_CREATE = 'true'; // the delete flow has its own gate
  await expectRejects(service.removeExperienceItem(QID, EDIT_ITEM, FIN_ACTOR, { previewToken: token }), 'invalid_preview_token');
});

// ── Confirmation ──
test('edit: a selling-price change without acknowledgement is rejected confirmation_required', async () => {
  const { service, calls } = buildEdit({ projItem: { cost: 300, sell: 360 } });
  const token = await editToken(service, { netCost: 150 });
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: token }),
    'confirmation_required',
  );
  assert.equal(calls.updateItem.length, 0);
});

test('edit: a no-op selling delta needs no acknowledgement', async () => {
  // Same netCost as persisted → projected == current → item sell delta 0.
  const { service, calls } = buildEdit({ projItem: { cost: 200, sell: 240 } });
  const token = await editToken(service, { netCost: 100 });
  const res: any = await service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 100 }, FIN_ACTOR, { previewToken: token });
  assert.equal(res.updated, true);
  assert.equal(calls.updateItem.length, 1);
});

// ── Audit / safety ──
test('edit: apply emits exactly one sanitized quote.item.updated audit (never quote.pricing.apply)', async () => {
  const { service, calls } = buildEdit({});
  const token = await editToken(service, { netCost: 150 });
  await service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: token, acknowledgedDelta: true });
  const updates = calls.auditLog.filter((a) => a.action === 'quote.item.updated');
  assert.equal(updates.length, 1);
  const meta = updates[0].metadata;
  assert.equal(meta.quoteId, QID);
  assert.equal(meta.itemId, EDIT_ITEM);
  assert.equal(meta.itemType, 'external_package');
  assert.deepEqual(meta.changedFields, ['netCost']);
  for (const leak of ['netCost', 'externalNetCost', 'supplierName', 'internalNotes', 'previewToken', 'snapshotHash', 'sellPrice', 'email', 'pii']) {
    assert.equal(leak in meta, false, `audit metadata must not include ${leak}`);
  }
  assert.equal(calls.auditLog.some((a) => a.action === 'quote.pricing.apply'), false);
});

test('edit: a failing audit write does not block a successful apply', async () => {
  const { service, calls } = buildEdit({ auditThrows: true });
  const token = await editToken(service, { netCost: 150 });
  const res: any = await service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: token, acknowledgedDelta: true });
  assert.equal(res.updated, true);
  assert.equal(calls.updateItem.length, 1);
  assert.equal(calls.auditLog.length, 1); // attempted, threw, swallowed
});

test('edit: post-write drift restores the prior state and surfaces post_write_integrity_mismatch', async () => {
  const { service, calls } = buildEdit({ driftCost: 50, driftSell: 60 });
  const token = await editToken(service, { netCost: 150 });
  await expectRejects(
    service.applyExternalPackageEdit(QID, EDIT_ITEM, { netCost: 150 }, FIN_ACTOR, { previewToken: token, acknowledgedDelta: true }),
    'post_write_integrity_mismatch',
  );
  // Two updateItem calls: the edit + the compensating restore to the prior netCost.
  assert.equal(calls.updateItem.length, 2);
  assert.equal(calls.updateItem[1].data.netCost, 100); // prior externalNetCost
});
