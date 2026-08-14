import { test, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QuoteExperiencesV2Service } from './quote-experiences-v2.service';
import { buildCreatePreviewToken, verifyCreatePreviewToken } from './quote-create-preview-token';
import { getPreviewTokenSecret } from './quote-preview-token';
import { EXPERIENCE_DEFAULT_MARKUP } from '../common/pricing-constants';

// Fakes for PrismaService + the delegated QuotesService (createItem / removeItem /
// previewCreateItemValues) + AuditService. A small MUTABLE state mimics the real
// recalc: previewCreateItemValues projects the item price with no writes; createItem
// appends the item and moves the quote totals (by the item contribution + any injected
// drift); removeItem compensates. This lets the Slice 2B-1 guard (preview token →
// snapshot → post-write compare → compensating rollback) be exercised without a DB.

type Options = {
  flag?: boolean;
  quote?: { id: string; brandCompanyId?: string | null; status?: string; quoteCurrency?: string; adults?: number; children?: number } | null;
  newerRevision?: { id: string } | null;
  day?: { id: string; quoteId: string } | null;
  activity?: { id: string } | null;
  variant?: { id: string; activityId: string } | null;
  // Guide-type service (resolveServiceTaxonomyGroup === 'guide'). Default is a GUIDE
  // service; pass a non-guide serviceType to exercise the not_guide_service reject,
  // or null to exercise service_not_found. For entrance, pass `entranceFee: { id }`
  // (present → entrance service) or omit it (→ not_entrance_service).
  service?: { id: string; category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null; entranceFee?: { id: string } | null } | null;
  // Ticket rate variant lookup (entrance). undefined → a valid variant on SVC; null →
  // not found; pass a foreign serviceId / active:false to exercise the reject.
  ticketRateVariant?: { id: string; serviceId: string; active?: boolean } | null;
  created?: any;
  createThrows?: boolean;
  auditThrows?: boolean;
  previewThrows?: boolean;
  removeThrows?: boolean;
  // D-a delete fixtures. removableItem = the quoteItem.findUnique result to classify
  // (undefined → a default activity item; null → item_not_found). acceptedVersionId
  // freezes the quote. dayItemLink is the day-link resolved for the audit. seedItems
  // pre-populates the recalc state so removeItem can decrement totals.
  removableItem?: any;
  acceptedVersionId?: string | null;
  dayItemLink?: { dayId: string } | null;
  seedItems?: { id: string; totalCost: number; totalSell: number }[];
  // Pre-create quote totals (before the add).
  preTotals?: { totalCost: number; totalSell: number };
  // Projected new-item price (previewCreateItemValues).
  projected?: { totalCost: number; totalSell: number; currency?: string };
  // Extra drift applied to the quote totals on create, BEYOND the item contribution
  // (simulates a pre-existing item re-pricing during recalc).
  driftCost?: number;
  driftSell?: number;
};

function setFlag(on: boolean) {
  if (on) process.env.QUOTE_ITEM_CREATE = 'true';
  else delete process.env.QUOTE_ITEM_CREATE;
}
afterEach(() => { delete process.env.QUOTE_ITEM_CREATE; });

const QID = 'quote-1';
const DAY = 'day-1';
const ACT = 'act-1';
const VAR = 'var-1';
const ITEM = 'item-del-1'; // D-a: the item targeted by remove-preview / DELETE
// Default actor is a cost-visible role (admin) so the pre-2C guard tests keep
// asserting cost values. Slice 2C redaction for restricted roles is covered by the
// dedicated tests at the end of this file.
const ACTOR = { id: 'user-1', companyId: 'company-A', auditLabel: 'Alice', role: 'admin' as const };
// A restricted (non-finance) actor: same access to add, but no cost/margin visibility.
const OPS_ACTOR = { id: 'user-2', companyId: 'company-A', auditLabel: 'Omar', role: 'operations' as const };
const GOOD = { itemType: 'activity', dayId: DAY, activityId: ACT, activityRateVariantId: VAR, serviceDate: '2026-08-07' };
const SVC = 'svc-1';
const GOOD_GUIDE = { itemType: 'guide', dayId: DAY, serviceId: SVC, guideType: 'local', guideDuration: 'full_day', serviceDate: '2026-08-07' };
// Meal fixtures (M-1a). serviceId is a MEAL-taxonomy SupplierService; customServiceName
// is the required meal name. unitCost/currency are a finance-only override.
const GOOD_MEAL = { itemType: 'meal', dayId: DAY, serviceId: SVC, customServiceName: 'Welcome Dinner', serviceDate: '2026-08-07' };
const MEAL_SERVICE = { id: SVC, category: 'meal', serviceType: { name: 'Meal', code: 'MEAL' } };
// Entrance fixtures (M-2a). serviceId is a SupplierService with a LINKED EntranceFee;
// ticketRateVariantId is optional (omitted → base-fee fallback). TRV is a valid variant.
const TRV = 'trv-1';
const GOOD_ENTRANCE = { itemType: 'entrance', dayId: DAY, serviceId: SVC, serviceDate: '2026-08-07' };
const ENTRANCE_SERVICE = { id: SVC, entranceFee: { id: 'ef-1' } };

function build(opts: Options = {}) {
  const calls: Record<string, any[]> = { createItem: [], removeItem: [], previewValues: [], auditLog: [] };
  const projected = opts.projected ?? { totalCost: 120, totalSell: 144, currency: 'USD' };
  const state = {
    totals: { ...(opts.preTotals ?? { totalCost: 200, totalSell: 240 }) },
    items: [...(opts.seedItems ?? [])] as { id: string; totalCost: number; totalSell: number }[],
  };

  const prisma = {
    quote: {
      findFirst: async (args: any) => {
        if (args?.where?.revisedFromId) return opts.newerRevision ?? null;
        return opts.quote === undefined
          ? { id: QID, brandCompanyId: null, status: 'DRAFT', quoteCurrency: 'USD', adults: 2, children: 0 }
          : opts.quote;
      },
      // Reads current mutable totals (pre-create during snapshots, post-create during
      // compare) + acceptedVersionId (D-a delete freeze check). Mock returns all fields;
      // the real code selects a subset.
      findUnique: async () => ({ totalCost: state.totals.totalCost, totalSell: state.totals.totalSell, quoteCurrency: 'USD', acceptedVersionId: opts.acceptedVersionId ?? null }),
    },
    quoteItem: {
      findMany: async () => state.items,
      // D-a: classify the item being removed. undefined → default activity item; null → not found.
      findUnique: async () =>
        opts.removableItem === undefined
          ? { id: ITEM, quoteId: QID, activityId: ACT, hotelId: null, transportServiceTypeId: null, routeId: null, vehicleId: null, touringRouteId: null, externalPackageName: null, totalCost: 120, totalSell: 144, currency: 'USD', service: null }
          : opts.removableItem,
    },
    quoteItineraryDayItem: {
      findFirst: async () => (opts.dayItemLink === undefined ? { dayId: DAY } : opts.dayItemLink),
    },
    quoteItineraryDay: {
      findUnique: async () => (opts.day === undefined ? { id: DAY, quoteId: QID } : opts.day),
    },
    activity: {
      findUnique: async () => (opts.activity === undefined ? { id: ACT } : opts.activity),
    },
    activityRateVariant: {
      findUnique: async () => (opts.variant === undefined ? { id: VAR, activityId: ACT } : opts.variant),
    },
    // NOTE: the mock key is `supplierService` (the REAL Prisma delegate). If the
    // service code regresses to `prisma.service`, that delegate is undefined here
    // and the guide tests fail — which is exactly what we want.
    supplierService: {
      findUnique: async () =>
        opts.service === undefined
          ? { id: SVC, category: 'guide', serviceType: { name: 'Guide', code: 'GUIDE' } }
          : opts.service,
    },
    ticketRateVariant: {
      findUnique: async () => (opts.ticketRateVariant === undefined ? { id: TRV, serviceId: SVC, active: true } : opts.ticketRateVariant),
    },
  };

  const quotes = {
    previewCreateItemValues: async (data: any) => {
      calls.previewValues.push({ data });
      if (opts.previewThrows) throw new Error('resolve boom');
      return { totalCost: projected.totalCost, totalSell: projected.totalSell, currency: projected.currency ?? 'USD' };
    },
    createItem: async (data: any, actor: any) => {
      calls.createItem.push({ data, actor });
      if (opts.createThrows) throw new Error('createItem boom');
      const created = opts.created ?? { id: 'item-new', totalCost: projected.totalCost, totalSell: projected.totalSell, currency: 'USD' };
      // Simulate recalc: totals move by the item contribution (+ any injected drift).
      state.items.push({ id: created.id, totalCost: created.totalCost, totalSell: created.totalSell });
      state.totals.totalCost += created.totalCost + (opts.driftCost ?? 0);
      state.totals.totalSell += created.totalSell + (opts.driftSell ?? 0);
      return created;
    },
    removeItem: async (itemId: string, actor: any) => {
      calls.removeItem.push({ itemId, actor });
      if (opts.removeThrows) throw new Error('removeItem boom');
      const idx = state.items.findIndex((i) => i.id === itemId);
      if (idx >= 0) {
        const it = state.items.splice(idx, 1)[0];
        state.totals.totalCost -= it.totalCost + (opts.driftCost ?? 0);
        state.totals.totalSell -= it.totalSell + (opts.driftSell ?? 0);
      }
      return { id: itemId };
    },
  };

  const audit = {
    log: async (values: any) => {
      calls.auditLog.push(values);
      if (opts.auditThrows) throw new Error('audit boom');
      return { id: 'audit-1' };
    },
  };

  setFlag(opts.flag ?? true);
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

// Preview → returns a token used by the guarded create. `input` is loosely typed so
// both the activity (GOOD) and guide (GOOD_GUIDE) literals can be passed.
async function previewToken(service: QuoteExperiencesV2Service, input: any = GOOD, actor: any = ACTOR): Promise<string> {
  const res: any = await service.previewActivityItem(QID, input, actor as any);
  return res.previewToken as string;
}

// ---------------------------------------------------------------------------
// Validation gate (runs BEFORE the token guard — unchanged behavior)
// ---------------------------------------------------------------------------

test('addActivityItem is blocked (feature_disabled) when the flag is OFF and writes nothing', async () => {
  const { service, calls } = build({ flag: false });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: 'x', acknowledgedDelta: true }), 'feature_disabled');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

test('an unknown itemType is rejected out_of_scope (activity/guide/meal are the only scopes)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.addActivityItem(QID, { ...GOOD, itemType: 'transport' }, ACTOR, { previewToken: 'x', acknowledgedDelta: true }), 'out_of_scope');
  assert.equal(calls.createItem.length, 0);
});

for (const field of ['dayId', 'activityId', 'activityRateVariantId', 'serviceDate']) {
  test(`missing ${field} is rejected (missing_field) and does not create`, async () => {
    const { service, calls } = build({ flag: true });
    const bad: any = { ...GOOD, [field]: '' };
    await expectRejects(service.addActivityItem(QID, bad, ACTOR, { previewToken: 'x', acknowledgedDelta: true }), 'missing_field');
    assert.equal(calls.createItem.length, 0);
  });
}

test('a day that does not belong to the quote is rejected (day_not_found)', async () => {
  const { service, calls } = build({ flag: true, day: { id: DAY, quoteId: 'other-quote' } });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: 'x', acknowledgedDelta: true }), 'day_not_found');
  assert.equal(calls.createItem.length, 0);
});

test('a rate variant that does not belong to the activity is rejected (variant_mismatch)', async () => {
  const { service, calls } = build({ flag: true, variant: { id: VAR, activityId: 'other-activity' } });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: 'x', acknowledgedDelta: true }), 'variant_mismatch');
  assert.equal(calls.createItem.length, 0);
});

test('a caller without a company context is rejected (company isolation)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(
    service.addActivityItem(QID, GOOD, { id: 'user-1', companyId: null, auditLabel: 'NoCo' }, { previewToken: 'x', acknowledgedDelta: true }),
    'Company context is required',
  );
  assert.equal(calls.createItem.length, 0);
});

test('a quote owned by a different company is rejected (cross-company)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: 'company-B', status: 'DRAFT', quoteCurrency: 'USD', adults: 2, children: 0 } });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: 'x', acknowledgedDelta: true }), 'different company');
  assert.equal(calls.createItem.length, 0);
});

test('a non-editable quote status is rejected (quote_not_editable)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: null, status: 'SENT', quoteCurrency: 'USD', adults: 2, children: 0 } });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: 'x', acknowledgedDelta: true }), 'quote_not_editable');
  assert.equal(calls.createItem.length, 0);
});

// ---------------------------------------------------------------------------
// Slice 2B-1 guard
// ---------------------------------------------------------------------------

test('create-preview projects the price and returns a token, writing nothing', async () => {
  const { service, calls } = build({ flag: true });
  const res: any = await service.previewActivityItem(QID, GOOD, ACTOR);
  assert.equal(res.itemType, 'activity');
  assert.equal(res.projected.cost, 120);
  assert.equal(res.projected.sell, 144);
  assert.deepEqual(res.projected.quote, { totalCost: 320, totalSell: 384 }); // additive (200+120 / 240+144)
  assert.equal(typeof res.previewToken, 'string');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.removeItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

test('happy path: preview → create succeeds when token matches and acknowledgedDelta=true', async () => {
  const { service, calls } = build({ flag: true });
  const token = await previewToken(service);
  const result: any = await service.addActivityItem(QID, GOOD, ACTOR, { previewToken: token, acknowledgedDelta: true });
  assert.equal(result.itemId, 'item-new');
  assert.equal(result.cost, 120);
  assert.equal(result.sell, 144);
  assert.deepEqual(result.quote, { totalCost: 320, totalSell: 384 });
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.removeItem.length, 0);
  assert.equal(calls.auditLog.length, 1);
});

test('confirmation_required when the add changes pricing and acknowledgedDelta is not true', async () => {
  const { service, calls } = build({ flag: true });
  const token = await previewToken(service);
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: token, acknowledgedDelta: false }), 'confirmation_required');
  assert.equal(calls.createItem.length, 0);
});

test('stale_preview when the quote changes after the preview', async () => {
  const { service, calls, state } = build({ flag: true });
  const token = await previewToken(service);
  // Quote moves after the preview (e.g. another edit) → snapshot hash no longer matches.
  state.totals.totalCost += 50;
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: token, acknowledgedDelta: true }), 'stale_preview');
  assert.equal(calls.createItem.length, 0);
});

test('an invalid / tampered token is rejected (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: 'v1.garbage.sig', acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

test('an expired token is rejected (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true });
  const expired = buildCreatePreviewToken(
    {
      kind: 'v2-activity-create', quoteId: QID, dayId: DAY, activityId: ACT, activityRateVariantId: VAR,
      serviceDate: new Date('2026-08-07').toISOString(), adultCount: 2, childCount: 0,
      snapshotHash: 'x', projected: {}, issuedAt: 1, exp: 2,
    },
    getPreviewTokenSecret(),
  );
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: expired, acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

test('a token for a different add is rejected (invalid_preview_token identity binding)', async () => {
  const { service, calls } = build({ flag: true });
  const token = await previewToken(service, GOOD);
  // Same token, but the request targets a different day → the token's identity
  // binding (dayId) no longer matches → invalid_preview_token, nothing created.
  await expectRejects(
    service.addActivityItem(QID, { ...GOOD, dayId: 'day-2' }, ACTOR, { previewToken: token, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
  assert.equal(calls.createItem.length, 0);
});

test('missing/unresolvable rate returns not_resolvable and writes nothing (create)', async () => {
  const { service, calls } = build({ flag: true, previewThrows: true });
  // Preview itself surfaces not_resolvable when pricing cannot resolve.
  await expectRejects(service.previewActivityItem(QID, GOOD, ACTOR), 'not_resolvable');
  assert.equal(calls.createItem.length, 0);
});

test('injected drift after preview triggers rate_changed AND a compensating removeItem', async () => {
  // Build ONE service; preview with no drift, then flip drift on for the create by
  // making createItem move totals beyond the item contribution.
  const { service, calls, state } = build({ flag: true, driftCost: 40 });
  // Preview must see NO drift (its snapshot is pre-create). Compute the token from a
  // clean projection: temporarily the state is pre-create, projected additive = 320/384.
  const token = await previewToken(service);
  const result = service.addActivityItem(QID, GOOD, ACTOR, { previewToken: token, acknowledgedDelta: true });
  await expectRejects(result, 'rate_changed');
  assert.equal(calls.createItem.length, 1); // it did create...
  assert.equal(calls.removeItem.length, 1); // ...then compensated
  assert.equal(calls.auditLog.length, 0); // no success audit on a rolled-back create
  // Totals restored to pre-create by the compensating removeItem.
  assert.deepEqual(state.totals, { totalCost: 200, totalSell: 240 });
});

test('if the compensating removeItem fails, the error surfaces (compensation_failed) and is not swallowed', async () => {
  const { service, calls } = build({ flag: true, driftCost: 40, removeThrows: true });
  const token = await previewToken(service);
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: token, acknowledgedDelta: true }), 'compensation_failed');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.removeItem.length, 1); // attempted
  assert.equal(calls.auditLog.length, 0);
});

test('a failing audit write does not block a successful create', async () => {
  const { service, calls } = build({ flag: true, auditThrows: true });
  const token = await previewToken(service);
  const result: any = await service.addActivityItem(QID, GOOD, ACTOR, { previewToken: token, acknowledgedDelta: true });
  assert.equal(result.itemId, 'item-new');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.auditLog.length, 1); // attempted, threw, swallowed
});

test('a failed create propagates and writes no success audit / no compensation', async () => {
  const { service, calls } = build({ flag: true, createThrows: true });
  const token = await previewToken(service);
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: token, acknowledgedDelta: true }), 'createItem boom');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.removeItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

// ---------------------------------------------------------------------------
// Slice 2C — cost/margin redaction of preview + create responses by role
// ---------------------------------------------------------------------------

test('preview: privileged (admin) role receives cost; restricted (operations) role does not', async () => {
  const { service } = build({ flag: true });
  const priv: any = await service.previewActivityItem(QID, GOOD, ACTOR);
  assert.equal(priv.projected.cost, 120);
  assert.equal(priv.projected.quote.totalCost, 320);
  // Selling price + currency always visible.
  assert.equal(priv.projected.sell, 144);
  assert.equal(priv.projected.quote.totalSell, 384);

  const restricted: any = await service.previewActivityItem(QID, GOOD, OPS_ACTOR);
  assert.equal(restricted.projected.cost, null, 'operations must not receive projected item cost');
  assert.equal(restricted.projected.quote.totalCost, null, 'operations must not receive projected quote total cost');
  // Selling price + currency still visible to operations.
  assert.equal(restricted.projected.sell, 144);
  assert.equal(restricted.projected.quote.totalSell, 384);
  assert.equal(restricted.projected.currency, 'USD');
  // The opaque token is still issued (the client replays it verbatim on create).
  assert.equal(typeof restricted.previewToken, 'string');
});

test('create: restricted (operations) role gets a redacted create response but the add still commits', async () => {
  const { service, calls } = build({ flag: true });
  // Preview + create both as operations; the token is role-independent, so a
  // restricted user completes the add and only the RESPONSE cost is redacted.
  const preview: any = await service.previewActivityItem(QID, GOOD, OPS_ACTOR);
  const result: any = await service.addActivityItem(QID, GOOD, OPS_ACTOR, {
    previewToken: preview.previewToken,
    acknowledgedDelta: true,
  });
  assert.equal(result.itemId, 'item-new');
  assert.equal(result.cost, null, 'operations must not receive item cost on create');
  assert.equal(result.quote.totalCost, null, 'operations must not receive quote total cost on create');
  // Selling total + currency preserved.
  assert.equal(result.sell, 144);
  assert.equal(result.quote.totalSell, 384);
  assert.equal(result.currency, 'USD');
  // The write actually happened + was audited (redaction is response-only).
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.auditLog.length, 1);
  // The audit row records the TRUE cost (server-side), not the redacted value.
  assert.equal(calls.auditLog[0].metadata.cost, 120);
});

test('create: privileged (admin) role receives full cost on the create response', async () => {
  const { service } = build({ flag: true });
  const token = await previewToken(service, GOOD, ACTOR);
  const result: any = await service.addActivityItem(QID, GOOD, ACTOR, { previewToken: token, acknowledgedDelta: true });
  assert.equal(result.cost, 120);
  assert.equal(result.quote.totalCost, 320);
});

test('the guard still uses the token internal cost for restricted roles (drift → rate_changed + compensation)', async () => {
  // Even though the operations user cannot SEE cost, the drift compare (which reads
  // the token's internal projected totals) must still fire and compensate.
  const { service, calls, state } = build({ flag: true, driftCost: 40 });
  const preview: any = await service.previewActivityItem(QID, GOOD, OPS_ACTOR);
  await expectRejects(
    service.addActivityItem(QID, GOOD, OPS_ACTOR, { previewToken: preview.previewToken, acknowledgedDelta: true }),
    'rate_changed',
  );
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.removeItem.length, 1);
  assert.deepEqual(state.totals, { totalCost: 200, totalSell: 240 });
});

// ---------------------------------------------------------------------------
// Slice 3 — GUIDE create (same guarded flow; ACTIVITY behavior above unchanged)
// ---------------------------------------------------------------------------

test('guide create-preview projects the price and returns a token (itemType guide), writing nothing', async () => {
  const { service, calls } = build({ flag: true });
  const res: any = await service.previewActivityItem(QID, GOOD_GUIDE, ACTOR);
  assert.equal(res.itemType, 'guide');
  assert.equal(res.projected.cost, 120);
  assert.equal(res.projected.sell, 144);
  assert.deepEqual(res.projected.quote, { totalCost: 320, totalSell: 384 });
  assert.equal(typeof res.previewToken, 'string');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

test('guide happy path: preview → create succeeds with token + acknowledgedDelta', async () => {
  const { service, calls } = build({ flag: true });
  const token = await previewToken(service, GOOD_GUIDE);
  const result: any = await service.addActivityItem(QID, GOOD_GUIDE, ACTOR, { previewToken: token, acknowledgedDelta: true });
  assert.equal(result.itemId, 'item-new');
  assert.equal(result.itemType, 'guide');
  assert.equal(result.cost, 120);
  assert.equal(result.sell, 144);
  assert.equal(calls.createItem.length, 1);
  // the delegated createItem input carries the guide fields (serviceId + guide markup)
  assert.equal(calls.createItem[0].data.serviceId, SVC);
  assert.equal(calls.createItem[0].data.guideType, 'local');
  assert.equal(calls.createItem[0].data.guideDuration, 'full_day');
  // audited as a guide create
  assert.equal(calls.auditLog.length, 1);
  assert.equal(calls.auditLog[0].metadata.itemType, 'guide');
  assert.equal(calls.auditLog[0].metadata.serviceId, SVC);
});

test('guide: confirmation_required when the add changes pricing and acknowledgedDelta is not true', async () => {
  const { service, calls } = build({ flag: true });
  const token = await previewToken(service, GOOD_GUIDE);
  await expectRejects(service.addActivityItem(QID, GOOD_GUIDE, ACTOR, { previewToken: token, acknowledgedDelta: false }), 'confirmation_required');
  assert.equal(calls.createItem.length, 0);
});

test('guide: stale_preview when the quote changes after the preview', async () => {
  const { service, calls, state } = build({ flag: true });
  const token = await previewToken(service, GOOD_GUIDE);
  state.totals.totalCost += 50;
  await expectRejects(service.addActivityItem(QID, GOOD_GUIDE, ACTOR, { previewToken: token, acknowledgedDelta: true }), 'stale_preview');
  assert.equal(calls.createItem.length, 0);
});

test('guide: an invalid / malformed token is rejected (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.addActivityItem(QID, GOOD_GUIDE, ACTOR, { previewToken: 'v2c.garbage.token.here', acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

test('guide: missing/unresolvable rate returns not_resolvable (preview) and writes nothing', async () => {
  const { service, calls } = build({ flag: true, previewThrows: true });
  await expectRejects(service.previewActivityItem(QID, GOOD_GUIDE, ACTOR), 'not_resolvable');
  assert.equal(calls.createItem.length, 0);
});

test('guide: injected drift after preview triggers rate_changed AND a compensating removeItem', async () => {
  const { service, calls, state } = build({ flag: true, driftCost: 40 });
  const token = await previewToken(service, GOOD_GUIDE);
  await expectRejects(service.addActivityItem(QID, GOOD_GUIDE, ACTOR, { previewToken: token, acknowledgedDelta: true }), 'rate_changed');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.removeItem.length, 1);
  assert.deepEqual(state.totals, { totalCost: 200, totalSell: 240 });
});

test('guide: missing serviceId / guideType / guideDuration is rejected (missing_field)', async () => {
  for (const field of ['serviceId', 'guideType', 'guideDuration']) {
    const { service, calls } = build({ flag: true });
    const bad: any = { ...GOOD_GUIDE, [field]: '' };
    await expectRejects(service.previewActivityItem(QID, bad, ACTOR), 'missing_field');
    assert.equal(calls.createItem.length, 0);
  }
});

test('guide: a non-guide service is rejected (not_guide_service)', async () => {
  const { service, calls } = build({ flag: true, service: { id: SVC, category: 'activity', serviceType: { name: 'Activity', code: 'ACTIVITY' } } });
  await expectRejects(service.previewActivityItem(QID, GOOD_GUIDE, ACTOR), 'not_guide_service');
  assert.equal(calls.createItem.length, 0);
});

test('guide: a missing service is rejected (service_not_found)', async () => {
  const { service } = build({ flag: true, service: null });
  await expectRejects(service.previewActivityItem(QID, GOOD_GUIDE, ACTOR), 'service_not_found');
});

test('cross-type replay: an ACTIVITY token cannot create a GUIDE (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true });
  const activityToken = await previewToken(service, GOOD); // activity kind
  await expectRejects(service.addActivityItem(QID, GOOD_GUIDE, ACTOR, { previewToken: activityToken, acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

test('cross-type replay: a GUIDE token cannot create an ACTIVITY (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true });
  const guideToken = await previewToken(service, GOOD_GUIDE); // guide kind
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: guideToken, acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

test('guide: restricted role (operations) create response redacts cost, keeps sell', async () => {
  const { service } = build({ flag: true });
  const preview: any = await service.previewActivityItem(QID, GOOD_GUIDE, OPS_ACTOR);
  assert.equal(preview.projected.cost, null); // preview cost redacted for ops
  assert.equal(preview.projected.sell, 144);
  const result: any = await service.addActivityItem(QID, GOOD_GUIDE, OPS_ACTOR, { previewToken: preview.previewToken, acknowledgedDelta: true });
  assert.equal(result.itemType, 'guide');
  assert.equal(result.cost, null);
  assert.equal(result.quote.totalCost, null);
  assert.equal(result.sell, 144);
  assert.equal(result.quote.totalSell, 384);
});

// ---------------------------------------------------------------------------
// M-1a — MEAL create (same guarded flow; ACTIVITY + GUIDE behavior unchanged)
// ---------------------------------------------------------------------------

test('meal create-preview projects the price and returns a token (itemType meal), writing nothing', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  const res: any = await service.previewActivityItem(QID, GOOD_MEAL, ACTOR);
  assert.equal(res.itemType, 'meal');
  assert.equal(res.projected.sell, 144);
  assert.equal(typeof res.previewToken, 'string');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

test('meal happy path: preview → create commits with the meal create-input shape', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  const token = await previewToken(service, GOOD_MEAL);
  const result: any = await service.addActivityItem(QID, GOOD_MEAL, ACTOR, { previewToken: token, acknowledgedDelta: true });
  assert.equal(result.itemId, 'item-new');
  assert.equal(result.itemType, 'meal');
  assert.equal(calls.createItem.length, 1);
  const data = calls.createItem[0].data;
  assert.equal(data.serviceId, SVC);
  assert.equal(data.customServiceName, 'Welcome Dinner');
  assert.equal(data.quantity, 1);
  assert.equal(data.markupPercent, EXPERIENCE_DEFAULT_MARKUP);
  // No override supplied → unitCost/currency undefined → shared resolver falls back
  // to the service baseCost/currency (no forced cost).
  assert.equal(data.unitCost, undefined);
  assert.equal(data.currency, undefined);
  // audited as a meal create
  assert.equal(calls.auditLog.length, 1);
  assert.equal(calls.auditLog[0].metadata.itemType, 'meal');
  assert.equal(calls.auditLog[0].metadata.serviceId, SVC);
});

test('meal: missing serviceId / customServiceName is rejected (missing_field)', async () => {
  for (const field of ['serviceId', 'customServiceName']) {
    const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
    const bad: any = { ...GOOD_MEAL, [field]: '' };
    await expectRejects(service.previewActivityItem(QID, bad, ACTOR), 'missing_field');
    assert.equal(calls.createItem.length, 0);
  }
});

test('meal: a non-meal service is rejected (not_meal_service)', async () => {
  const { service, calls } = build({ flag: true, service: { id: SVC, category: 'guide', serviceType: { name: 'Guide', code: 'GUIDE' } } });
  await expectRejects(service.previewActivityItem(QID, GOOD_MEAL, ACTOR), 'not_meal_service');
  assert.equal(calls.createItem.length, 0);
});

test('meal: a missing service is rejected (service_not_found)', async () => {
  const { service } = build({ flag: true, service: null });
  await expectRejects(service.previewActivityItem(QID, GOOD_MEAL, ACTOR), 'service_not_found');
});

test('meal: a cost-visible (admin) actor MAY supply a unitCost + currency override', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  const input = { ...GOOD_MEAL, unitCost: 45, currency: 'eur' };
  const token = await previewToken(service, input, ACTOR);
  await service.addActivityItem(QID, input, ACTOR, { previewToken: token, acknowledgedDelta: true });
  const data = calls.createItem[0].data;
  assert.equal(data.unitCost, 45);
  assert.equal(data.currency, 'EUR'); // normalized upper-case
});

test('meal: operations WITHOUT override can preview + create at the service base cost', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  const preview: any = await service.previewActivityItem(QID, GOOD_MEAL, OPS_ACTOR);
  assert.equal(preview.projected.cost, null); // cost redacted for ops
  assert.equal(preview.projected.sell, 144);
  const result: any = await service.addActivityItem(QID, GOOD_MEAL, OPS_ACTOR, { previewToken: preview.previewToken, acknowledgedDelta: true });
  assert.equal(result.itemType, 'meal');
  assert.equal(result.cost, null); // create response cost redacted for ops
  assert.equal(result.quote.totalCost, null);
  assert.equal(result.sell, 144);
  // no override → resolver defaults to service baseCost/currency
  assert.equal(calls.createItem[0].data.unitCost, undefined);
  assert.equal(calls.createItem[0].data.currency, undefined);
});

test('meal: operations supplying a unitCost override is rejected (cost_override_forbidden)', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_MEAL, unitCost: 45 }, OPS_ACTOR), 'cost_override_forbidden');
  assert.equal(calls.createItem.length, 0);
});

test('meal: operations supplying a currency override is rejected (cost_override_forbidden)', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_MEAL, currency: 'EUR' }, OPS_ACTOR), 'cost_override_forbidden');
  assert.equal(calls.createItem.length, 0);
});

test('meal: confirmation_required when the add changes pricing and acknowledgedDelta is not true', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  const token = await previewToken(service, GOOD_MEAL);
  await expectRejects(service.addActivityItem(QID, GOOD_MEAL, ACTOR, { previewToken: token, acknowledgedDelta: false }), 'confirmation_required');
  assert.equal(calls.createItem.length, 0);
});

test('meal: stale_preview when the quote changes after the preview', async () => {
  const { service, calls, state } = build({ flag: true, service: MEAL_SERVICE });
  const token = await previewToken(service, GOOD_MEAL);
  state.totals.totalCost += 50;
  await expectRejects(service.addActivityItem(QID, GOOD_MEAL, ACTOR, { previewToken: token, acknowledgedDelta: true }), 'stale_preview');
  assert.equal(calls.createItem.length, 0);
});

test('meal: injected drift after preview triggers rate_changed AND a compensating removeItem', async () => {
  const { service, calls, state } = build({ flag: true, service: MEAL_SERVICE, driftCost: 40 });
  const token = await previewToken(service, GOOD_MEAL);
  await expectRejects(service.addActivityItem(QID, GOOD_MEAL, ACTOR, { previewToken: token, acknowledgedDelta: true }), 'rate_changed');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.removeItem.length, 1);
  assert.deepEqual(state.totals, { totalCost: 200, totalSell: 240 });
});

test('meal token kind is v2-meal-create (decodes from the preview token)', async () => {
  const { service } = build({ flag: true, service: MEAL_SERVICE });
  const token = await previewToken(service, GOOD_MEAL);
  const decoded = require('./quote-create-preview-token').verifyCreatePreviewToken(token, getPreviewTokenSecret());
  assert.equal(decoded.kind, 'v2-meal-create');
  assert.equal(decoded.itemType, 'meal');
});

test('cross-type replay: a MEAL token cannot create an ACTIVITY (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  const mealToken = await previewToken(service, GOOD_MEAL);
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: mealToken, acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

test('cross-type replay: an ACTIVITY token cannot create a MEAL (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  const activityToken = await previewToken(service, GOOD); // activity kind
  await expectRejects(service.addActivityItem(QID, GOOD_MEAL, ACTOR, { previewToken: activityToken, acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

test('meal: a changed customServiceName after preview invalidates the token (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  const token = await previewToken(service, GOOD_MEAL); // name "Welcome Dinner"
  await expectRejects(
    service.addActivityItem(QID, { ...GOOD_MEAL, customServiceName: 'Farewell Lunch' }, ACTOR, { previewToken: token, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
  assert.equal(calls.createItem.length, 0);
});

test('meal: a changed unitCost after preview invalidates the token (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true, service: MEAL_SERVICE });
  const token = await previewToken(service, { ...GOOD_MEAL, unitCost: 45 }, ACTOR);
  await expectRejects(
    service.addActivityItem(QID, { ...GOOD_MEAL, unitCost: 50 }, ACTOR, { previewToken: token, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
  assert.equal(calls.createItem.length, 0);
});

// ---------------------------------------------------------------------------
// M-2a — ENTRANCE create (same guarded flow; ACTIVITY+GUIDE+MEAL unchanged)
// ---------------------------------------------------------------------------

test('entrance create-preview projects the price and returns a token (itemType entrance), writing nothing', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE });
  const res: any = await service.previewActivityItem(QID, GOOD_ENTRANCE, ACTOR);
  assert.equal(res.itemType, 'entrance');
  assert.equal(res.projected.sell, 144);
  assert.equal(typeof res.previewToken, 'string');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

test('entrance happy path (no variant): create commits via base-fee fallback with the entrance input shape', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE });
  const token = await previewToken(service, GOOD_ENTRANCE);
  const result: any = await service.addActivityItem(QID, GOOD_ENTRANCE, ACTOR, { previewToken: token, acknowledgedDelta: true });
  assert.equal(result.itemId, 'item-new');
  assert.equal(result.itemType, 'entrance');
  assert.equal(calls.createItem.length, 1);
  const data = calls.createItem[0].data;
  assert.equal(data.serviceId, SVC);
  assert.equal(data.ticketRateVariantId, undefined); // omitted -> base-fee fallback
  assert.equal(data.quantity, 1);
  assert.equal(data.markupPercent, 0); // entrance default markup = 0 (at-cost)
  // entranceFeeId + Jordan Pass values are DERIVED server-side -- never passed here.
  assert.equal('entranceFeeId' in data, false);
  assert.equal('jordanPassCovered' in data, false);
  assert.equal('jordanPassSavingsJod' in data, false);
  assert.equal(calls.auditLog.length, 1);
  assert.equal(calls.auditLog[0].metadata.itemType, 'entrance');
  assert.equal(calls.auditLog[0].metadata.serviceId, SVC);
});

test('entrance: missing serviceId is rejected (missing_field)', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE });
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_ENTRANCE, serviceId: '' }, ACTOR), 'missing_field');
  assert.equal(calls.createItem.length, 0);
});

test('entrance: a service with NO linked EntranceFee is rejected (not_entrance_service)', async () => {
  const { service, calls } = build({ flag: true, service: { id: SVC, category: 'guide', serviceType: { name: 'Guide', code: 'GUIDE' } } });
  await expectRejects(service.previewActivityItem(QID, GOOD_ENTRANCE, ACTOR), 'not_entrance_service');
  assert.equal(calls.createItem.length, 0);
});

test('entrance: a missing service is rejected (service_not_found)', async () => {
  const { service } = build({ flag: true, service: null });
  await expectRejects(service.previewActivityItem(QID, GOOD_ENTRANCE, ACTOR), 'service_not_found');
});

test('entrance: a valid ticketRateVariantId is accepted and carried into the create input', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE, ticketRateVariant: { id: TRV, serviceId: SVC, active: true } });
  const input = { ...GOOD_ENTRANCE, ticketRateVariantId: TRV };
  const token = await previewToken(service, input);
  await service.addActivityItem(QID, input, ACTOR, { previewToken: token, acknowledgedDelta: true });
  assert.equal(calls.createItem[0].data.ticketRateVariantId, TRV);
});

test('entrance: a not-found ticketRateVariant is rejected (invalid_ticket_rate_variant)', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE, ticketRateVariant: null });
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_ENTRANCE, ticketRateVariantId: TRV }, ACTOR), 'invalid_ticket_rate_variant');
  assert.equal(calls.createItem.length, 0);
});

test('entrance: a foreign ticketRateVariant (different serviceId) is rejected (invalid_ticket_rate_variant)', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE, ticketRateVariant: { id: TRV, serviceId: 'other-service', active: true } });
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_ENTRANCE, ticketRateVariantId: TRV }, ACTOR), 'invalid_ticket_rate_variant');
  assert.equal(calls.createItem.length, 0);
});

test('entrance: an inactive ticketRateVariant is rejected (invalid_ticket_rate_variant)', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE, ticketRateVariant: { id: TRV, serviceId: SVC, active: false } });
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_ENTRANCE, ticketRateVariantId: TRV }, ACTOR), 'invalid_ticket_rate_variant');
  assert.equal(calls.createItem.length, 0);
});

test('entrance token kind is v2-entrance-create (decodes from the preview token)', async () => {
  const { service } = build({ flag: true, service: ENTRANCE_SERVICE });
  const token = await previewToken(service, GOOD_ENTRANCE);
  const decoded = require('./quote-create-preview-token').verifyCreatePreviewToken(token, getPreviewTokenSecret());
  assert.equal(decoded.kind, 'v2-entrance-create');
  assert.equal(decoded.itemType, 'entrance');
});

test('cross-type replay: an ENTRANCE token cannot create an ACTIVITY (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE });
  const entranceToken = await previewToken(service, GOOD_ENTRANCE);
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: entranceToken, acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

test('cross-type replay: an ACTIVITY token cannot create an ENTRANCE (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE });
  const activityToken = await previewToken(service, GOOD); // activity kind
  await expectRejects(service.addActivityItem(QID, GOOD_ENTRANCE, ACTOR, { previewToken: activityToken, acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

test('entrance: a changed serviceId after preview invalidates the token (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE });
  const token = await previewToken(service, GOOD_ENTRANCE); // serviceId SVC
  await expectRejects(
    service.addActivityItem(QID, { ...GOOD_ENTRANCE, serviceId: 'other-entrance' }, ACTOR, { previewToken: token, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
  assert.equal(calls.createItem.length, 0);
});

test('entrance: a changed ticketRateVariantId after preview invalidates the token (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE, ticketRateVariant: { id: TRV, serviceId: SVC, active: true } });
  const token = await previewToken(service, GOOD_ENTRANCE); // no variant (base fee)
  await expectRejects(
    service.addActivityItem(QID, { ...GOOD_ENTRANCE, ticketRateVariantId: TRV }, ACTOR, { previewToken: token, acknowledgedDelta: true }),
    'invalid_preview_token',
  );
  assert.equal(calls.createItem.length, 0);
});

test('entrance: confirmation_required when the add changes pricing and acknowledgedDelta is not true', async () => {
  const { service, calls } = build({ flag: true, service: ENTRANCE_SERVICE });
  const token = await previewToken(service, GOOD_ENTRANCE);
  await expectRejects(service.addActivityItem(QID, GOOD_ENTRANCE, ACTOR, { previewToken: token, acknowledgedDelta: false }), 'confirmation_required');
  assert.equal(calls.createItem.length, 0);
});

test('entrance: stale_preview when the quote changes after the preview', async () => {
  const { service, calls, state } = build({ flag: true, service: ENTRANCE_SERVICE });
  const token = await previewToken(service, GOOD_ENTRANCE);
  state.totals.totalCost += 50;
  await expectRejects(service.addActivityItem(QID, GOOD_ENTRANCE, ACTOR, { previewToken: token, acknowledgedDelta: true }), 'stale_preview');
  assert.equal(calls.createItem.length, 0);
});

test('entrance: injected drift after preview triggers rate_changed AND a compensating removeItem', async () => {
  const { service, calls, state } = build({ flag: true, service: ENTRANCE_SERVICE, driftCost: 40 });
  const token = await previewToken(service, GOOD_ENTRANCE);
  await expectRejects(service.addActivityItem(QID, GOOD_ENTRANCE, ACTOR, { previewToken: token, acknowledgedDelta: true }), 'rate_changed');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.removeItem.length, 1);
  assert.deepEqual(state.totals, { totalCost: 200, totalSell: 240 });
});

test('entrance is blocked (feature_disabled) when the flag is OFF and writes nothing', async () => {
  const { service, calls } = build({ flag: false, service: ENTRANCE_SERVICE });
  await expectRejects(service.previewActivityItem(QID, GOOD_ENTRANCE, ACTOR), 'feature_disabled');
  assert.equal(calls.createItem.length, 0);
});

test('entrance: restricted role (operations) preview + create responses redact cost, keep sell', async () => {
  const { service } = build({ flag: true, service: ENTRANCE_SERVICE });
  const preview: any = await service.previewActivityItem(QID, GOOD_ENTRANCE, OPS_ACTOR);
  assert.equal(preview.projected.cost, null);
  assert.equal(preview.projected.sell, 144);
  const result: any = await service.addActivityItem(QID, GOOD_ENTRANCE, OPS_ACTOR, { previewToken: preview.previewToken, acknowledgedDelta: true });
  assert.equal(result.itemType, 'entrance');
  assert.equal(result.cost, null);
  assert.equal(result.quote.totalCost, null);
  assert.equal(result.sell, 144);
});

// ---------------------------------------------------------------------------
// M-3a — EXTERNAL PACKAGE create (finance-only, one-off / service-less, flat net
// cost). Same guarded flow; activity/guide/meal/entrance behavior above unchanged.
// ---------------------------------------------------------------------------

// Cost-visible actors (admin already = ACTOR). finance + super_admin can create.
const FINANCE_ACTOR = { id: 'user-f', companyId: 'company-A', auditLabel: 'Fiona', role: 'finance' as const };
const SUPER_ACTOR = { id: 'user-s', companyId: 'company-A', auditLabel: 'Sam', role: 'super_admin' as const };
// agent_admin coalesces into @Roles('admin') at the route but is NOT cost-visible →
// must fail closed at the service-level finance guard.
const AGENT_ADMIN_ACTOR = { id: 'user-aa', companyId: 'company-A', auditLabel: 'Ava', role: 'agent_admin' as const };
// One-off / SERVICE-LESS external package: no serviceId. netCost/currency/country/
// clientDescription required; pricingBasis defaults PER_PERSON.
const GOOD_EXTERNAL = {
  itemType: 'external_package',
  dayId: DAY,
  serviceDate: '2026-08-07',
  netCost: 100,
  currency: 'USD',
  country: 'Egypt',
  clientDescription: 'Cairo 3-night package',
};

test('external_package: resolveItemType accepts it — preview returns itemType external_package + a token, writing nothing', async () => {
  const { service, calls } = build({ flag: true });
  const res: any = await service.previewActivityItem(QID, GOOD_EXTERNAL, ACTOR);
  assert.equal(res.itemType, 'external_package');
  assert.equal(res.projected.sell, 144);
  assert.equal(typeof res.previewToken, 'string');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

test('external_package: an unknown itemType is still rejected out_of_scope', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_EXTERNAL, itemType: 'transport' }, ACTOR), 'out_of_scope');
  assert.equal(calls.createItem.length, 0);
});

test('external_package: the route @Roles is widened to include finance (admin, operations, finance)', () => {
  const src = readFileSync(join(__dirname, 'quote-experiences-v2.controller.ts'), 'utf8');
  assert.ok(src.includes("@Roles('admin', 'operations', 'finance')"), 'route must admit finance');
  // All V2 item-mutation endpoints carry the widened roles: create item + item/preview
  // (M-3a) and remove/preview + DELETE (D-a) = 4.
  const count = src.split("@Roles('admin', 'operations', 'finance')").length - 1;
  assert.equal(count, 4, 'create + create-preview + remove-preview + DELETE routes all widened');
});

for (const actor of [ACTOR, FINANCE_ACTOR, SUPER_ACTOR]) {
  test(`external_package: cost-visible role ${actor.role} can preview + create`, async () => {
    const { service, calls } = build({ flag: true });
    const preview: any = await service.previewActivityItem(QID, GOOD_EXTERNAL, actor);
    assert.equal(preview.itemType, 'external_package');
    const result: any = await service.addActivityItem(QID, GOOD_EXTERNAL, actor, { previewToken: preview.previewToken, acknowledgedDelta: true });
    assert.equal(result.itemId, 'item-new');
    assert.equal(result.itemType, 'external_package');
    // Cost-visible → cost present on the response.
    assert.equal(result.cost, 120);
    assert.equal(calls.createItem.length, 1);
    assert.equal(calls.auditLog.length, 1);
    assert.equal(calls.auditLog[0].metadata.itemType, 'external_package');
  });
}

for (const actor of [OPS_ACTOR, AGENT_ADMIN_ACTOR]) {
  test(`external_package: non-cost-visible role ${actor.role} fails closed (external_package_finance_only) on preview and create`, async () => {
    const { service, calls } = build({ flag: true });
    await expectRejects(service.previewActivityItem(QID, GOOD_EXTERNAL, actor), 'external_package_finance_only');
    await expectRejects(
      service.addActivityItem(QID, GOOD_EXTERNAL, actor, { previewToken: 'x', acknowledgedDelta: true }),
      'external_package_finance_only',
    );
    assert.equal(calls.createItem.length, 0);
    assert.equal(calls.auditLog.length, 0);
  });
}

for (const field of ['netCost', 'currency', 'country', 'clientDescription']) {
  test(`external_package: missing ${field} is rejected (missing_field) and does not create`, async () => {
    const { service, calls } = build({ flag: true });
    const bad: any = { ...GOOD_EXTERNAL, [field]: '' };
    await expectRejects(service.previewActivityItem(QID, bad, FINANCE_ACTOR), 'missing_field');
    assert.equal(calls.createItem.length, 0);
  });
}

test('external_package: invalid / negative netCost is rejected (invalid_external_package_cost)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_EXTERNAL, netCost: -5 }, FINANCE_ACTOR), 'invalid_external_package_cost');
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_EXTERNAL, netCost: 'abc' as any }, FINANCE_ACTOR), 'invalid_external_package_cost');
  assert.equal(calls.createItem.length, 0);
});

test('external_package: an invalid pricingBasis is rejected (invalid_pricing_basis)', async () => {
  const { service } = build({ flag: true });
  await expectRejects(service.previewActivityItem(QID, { ...GOOD_EXTERNAL, pricingBasis: 'PER_ROOM' }, FINANCE_ACTOR), 'invalid_pricing_basis');
});

test('external_package: one-off / service-less create payload — no serviceId, flat net cost, markup = EXPERIENCE_DEFAULT_MARKUP (20)', async () => {
  const { service, calls } = build({ flag: true });
  const preview: any = await service.previewActivityItem(QID, GOOD_EXTERNAL, FINANCE_ACTOR);
  await service.addActivityItem(QID, GOOD_EXTERNAL, FINANCE_ACTOR, { previewToken: preview.previewToken, acknowledgedDelta: true });
  const data = calls.createItem[0].data;
  assert.equal('serviceId' in data, false, 'external package is service-less (no serviceId)');
  assert.equal(data.netCost, 100);
  assert.equal(data.currency, 'USD');
  assert.equal(data.country, 'Egypt');
  assert.equal(data.clientDescription, 'Cairo 3-night package');
  assert.equal(data.pricingBasis, 'PER_PERSON', 'defaults to PER_PERSON when omitted');
  assert.equal(data.markupPercent, EXPERIENCE_DEFAULT_MARKUP);
  assert.equal(data.markupPercent, 20);
  // This slice never sends matrix / single supplement / sell override / day range.
  for (const forbidden of ['pricingMatrixJson', 'singleSupplement', 'sellPrice', 'sellPriceOverrideExplicit', 'startDay', 'endDay']) {
    assert.equal(forbidden in data, false, `create input must not carry ${forbidden}`);
  }
});

test('external_package: PER_GROUP basis is honored in the create payload', async () => {
  const { service, calls } = build({ flag: true });
  const input = { ...GOOD_EXTERNAL, pricingBasis: 'PER_GROUP' };
  const preview: any = await service.previewActivityItem(QID, input, FINANCE_ACTOR);
  await service.addActivityItem(QID, input, FINANCE_ACTOR, { previewToken: preview.previewToken, acknowledgedDelta: true });
  assert.equal(calls.createItem[0].data.pricingBasis, 'PER_GROUP');
});

test('external_package: optional text fields are mapped into the create payload', async () => {
  const { service, calls } = build({ flag: true });
  const input = {
    ...GOOD_EXTERNAL,
    packageName: 'Nile Explorer',
    includes: 'Flights, hotels',
    excludes: 'Tips',
    hotelsOrSimilar: 'Steigenberger or similar',
    internalNotes: 'Partner: Cairo DMC',
  };
  const preview: any = await service.previewActivityItem(QID, input, FINANCE_ACTOR);
  await service.addActivityItem(QID, input, FINANCE_ACTOR, { previewToken: preview.previewToken, acknowledgedDelta: true });
  const data = calls.createItem[0].data;
  assert.equal(data.packageName, 'Nile Explorer');
  assert.equal(data.includes, 'Flights, hotels');
  assert.equal(data.excludes, 'Tips');
  assert.equal(data.hotelsOrSimilar, 'Steigenberger or similar');
  assert.equal(data.internalNotes, 'Partner: Cairo DMC');
});

test('external_package: the preview token kind is v2-external-package-create', async () => {
  const { service } = build({ flag: true });
  const token = await previewToken(service, GOOD_EXTERNAL, FINANCE_ACTOR);
  const payload: any = verifyCreatePreviewToken(token, getPreviewTokenSecret());
  assert.equal(payload.kind, 'v2-external-package-create');
});

test('external_package: cross-type token replay is blocked in both directions (invalid_preview_token)', async () => {
  const { service, calls } = build({ flag: true });
  // An external-package token cannot create an activity...
  const extToken = await previewToken(service, GOOD_EXTERNAL, FINANCE_ACTOR);
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR, { previewToken: extToken, acknowledgedDelta: true }), 'invalid_preview_token');
  // ...and an activity token cannot create an external package.
  const actToken = await previewToken(service, GOOD, ACTOR);
  await expectRejects(service.addActivityItem(QID, GOOD_EXTERNAL, FINANCE_ACTOR, { previewToken: actToken, acknowledgedDelta: true }), 'invalid_preview_token');
  assert.equal(calls.createItem.length, 0);
});

for (const change of [{ netCost: 999 }, { currency: 'EUR' }, { country: 'Jordan' }, { clientDescription: 'Different text' }, { pricingBasis: 'PER_GROUP' }]) {
  test(`external_package: changing ${Object.keys(change)[0]} after preview invalidates the token (invalid_preview_token)`, async () => {
    const { service, calls } = build({ flag: true });
    const token = await previewToken(service, GOOD_EXTERNAL, FINANCE_ACTOR);
    await expectRejects(
      service.addActivityItem(QID, { ...GOOD_EXTERNAL, ...change }, FINANCE_ACTOR, { previewToken: token, acknowledgedDelta: true }),
      'invalid_preview_token',
    );
    assert.equal(calls.createItem.length, 0);
  });
}

test('external_package: confirmation_required when the add changes pricing and acknowledgedDelta is not true', async () => {
  const { service, calls } = build({ flag: true });
  const token = await previewToken(service, GOOD_EXTERNAL, FINANCE_ACTOR);
  await expectRejects(service.addActivityItem(QID, GOOD_EXTERNAL, FINANCE_ACTOR, { previewToken: token, acknowledgedDelta: false }), 'confirmation_required');
  assert.equal(calls.createItem.length, 0);
});

test('external_package: stale_preview when the quote changes after the preview', async () => {
  const { service, calls, state } = build({ flag: true });
  const token = await previewToken(service, GOOD_EXTERNAL, FINANCE_ACTOR);
  state.totals.totalCost += 50;
  await expectRejects(service.addActivityItem(QID, GOOD_EXTERNAL, FINANCE_ACTOR, { previewToken: token, acknowledgedDelta: true }), 'stale_preview');
  assert.equal(calls.createItem.length, 0);
});

test('external_package: injected drift after preview triggers rate_changed AND a compensating removeItem', async () => {
  const { service, calls, state } = build({ flag: true, driftCost: 40 });
  const token = await previewToken(service, GOOD_EXTERNAL, FINANCE_ACTOR);
  await expectRejects(service.addActivityItem(QID, GOOD_EXTERNAL, FINANCE_ACTOR, { previewToken: token, acknowledgedDelta: true }), 'rate_changed');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.removeItem.length, 1);
  assert.deepEqual(state.totals, { totalCost: 200, totalSell: 240 });
});

test('external_package is blocked (feature_disabled) when the flag is OFF and writes nothing', async () => {
  const { service, calls } = build({ flag: false });
  await expectRejects(service.previewActivityItem(QID, GOOD_EXTERNAL, FINANCE_ACTOR), 'feature_disabled');
  assert.equal(calls.createItem.length, 0);
});

test('external_package: preview + create responses never expose externalNetCost / externalInternalNotes / externalSupplierName', async () => {
  const { service } = build({ flag: true });
  const input = { ...GOOD_EXTERNAL, internalNotes: 'Partner: Cairo DMC' };
  const preview: any = await service.previewActivityItem(QID, input, FINANCE_ACTOR);
  const result: any = await service.addActivityItem(QID, input, FINANCE_ACTOR, { previewToken: preview.previewToken, acknowledgedDelta: true });
  for (const leak of ['externalNetCost', 'externalInternalNotes', 'externalSupplierName', 'netCost', 'internalNotes', 'supplierName']) {
    assert.equal(leak in preview, false, `preview response must not include ${leak}`);
    assert.equal(leak in result, false, `create response must not include ${leak}`);
    assert.equal(leak in (preview.projected ?? {}), false, `preview.projected must not include ${leak}`);
  }
  // The narrow response shape is preserved (cost/sell/currency/quote totals only).
  assert.equal(result.itemType, 'external_package');
  assert.equal(result.sell, 144);
});

// ---------------------------------------------------------------------------
// D-a — Guarded single-item DELETE (remove). Option B: remove-preview → token → DELETE.
// Reuses the deterministic removeItem (delete + recalc); no pricing math, no createItem.
// ---------------------------------------------------------------------------

// Item-type fixtures for classification (persisted-QuoteItem shape returned by findUnique).
const baseItem = { id: ITEM, quoteId: QID, activityId: null, hotelId: null, transportServiceTypeId: null, routeId: null, vehicleId: null, touringRouteId: null, externalPackageName: null, totalCost: 120, totalSell: 144, currency: 'USD', service: null as any };
const ACTIVITY_ITEM = { ...baseItem, activityId: ACT };
const GUIDE_ITEM = { ...baseItem, service: { category: 'guide', serviceType: { name: 'Guide', code: 'GUIDE' }, entranceFee: null } };
const MEAL_ITEM = { ...baseItem, service: { category: 'meal', serviceType: { name: 'Meal', code: 'MEAL' }, entranceFee: null } };
const ENTRANCE_ITEM = { ...baseItem, service: { category: 'ticketing', serviceType: { name: 'Entrance', code: 'TICKET' }, entranceFee: { id: 'ef-1' } } };
const EXTERNAL_ITEM = { ...baseItem, externalPackageName: 'Nile Explorer' };
const HOTEL_ITEM = { ...baseItem, hotelId: 'hotel-1', service: { category: 'hotel', serviceType: { name: 'Hotel', code: 'HOTEL' }, entranceFee: null } };
const TRANSPORT_ITEM = { ...baseItem, transportServiceTypeId: 'tst-1', service: { category: 'transport', serviceType: { name: 'Transfer', code: 'TRANSFER' }, entranceFee: null } };
// A build() preset where the recalc state contains the removable item (so removeItem can decrement).
const withItem = (extra: Options = {}): Options => ({ flag: true, seedItems: [{ id: ITEM, totalCost: 120, totalSell: 144 }], preTotals: { totalCost: 200, totalSell: 240 }, ...extra });

async function removeToken(service: QuoteExperiencesV2Service, actor: any = ACTOR): Promise<string> {
  const res: any = await service.previewRemoveItem(QID, ITEM, actor);
  return res.previewToken as string;
}

test('delete is blocked (feature_disabled) when the flag is OFF and removes nothing', async () => {
  const { service, calls } = build({ flag: false });
  await expectRejects(service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: 'x' }), 'feature_disabled');
  await expectRejects(service.previewRemoveItem(QID, ITEM, ACTOR), 'feature_disabled');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: quote not found fails closed', async () => {
  const { service, calls } = build(withItem({ quote: null }));
  await expectRejects(service.previewRemoveItem(QID, ITEM, ACTOR), 'Quote not found');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: item not found fails closed (item_not_found)', async () => {
  const { service, calls } = build(withItem({ removableItem: null }));
  await expectRejects(service.previewRemoveItem(QID, ITEM, ACTOR), 'item_not_found');
  await expectRejects(service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: 'x' }), 'item_not_found');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: item not belonging to the quote fails closed (item_not_found)', async () => {
  const { service, calls } = build(withItem({ removableItem: { ...ACTIVITY_ITEM, quoteId: 'other-quote' } }));
  await expectRejects(service.previewRemoveItem(QID, ITEM, ACTOR), 'item_not_found');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: a quote owned by a different company is rejected (cross-company)', async () => {
  const { service, calls } = build(withItem({ quote: { id: QID, brandCompanyId: 'company-B', status: 'DRAFT', quoteCurrency: 'USD', adults: 2, children: 0 }, removableItem: ACTIVITY_ITEM }));
  await expectRejects(service.previewRemoveItem(QID, ITEM, ACTOR), 'different company');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: a non-editable quote status is rejected (quote_not_editable)', async () => {
  const { service, calls } = build(withItem({ quote: { id: QID, brandCompanyId: null, status: 'SENT', quoteCurrency: 'USD', adults: 2, children: 0 }, removableItem: ACTIVITY_ITEM }));
  await expectRejects(service.previewRemoveItem(QID, ITEM, ACTOR), 'quote_not_editable');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: an accepted quote (acceptedVersionId set) is rejected (quote_not_editable)', async () => {
  const { service, calls } = build(withItem({ acceptedVersionId: 'ver-1', removableItem: ACTIVITY_ITEM }));
  await expectRejects(service.previewRemoveItem(QID, ITEM, ACTOR), 'quote_not_editable');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: a revised (non-latest) quote is rejected', async () => {
  const { service, calls } = build(withItem({ newerRevision: { id: 'newer' }, removableItem: ACTIVITY_ITEM }));
  await expectRejects(service.previewRemoveItem(QID, ITEM, ACTOR), 'latest');
  assert.equal(calls.removeItem.length, 0);
});

for (const [label, item, expected] of [
  ['activity', ACTIVITY_ITEM, 'activity'],
  ['guide', GUIDE_ITEM, 'guide'],
  ['meal', MEAL_ITEM, 'meal'],
  ['entrance', ENTRANCE_ITEM, 'entrance'],
  ['external_package', EXTERNAL_ITEM, 'external_package'],
] as const) {
  test(`delete: ${label} item is removable (preview classifies itemType=${expected})`, async () => {
    const { service, calls, state } = build(withItem({ removableItem: item }));
    const preview: any = await service.previewRemoveItem(QID, ITEM, ACTOR);
    assert.equal(preview.itemType, expected);
    const result: any = await service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: preview.previewToken });
    assert.equal(result.removed, true);
    assert.equal(result.itemType, expected);
    assert.equal(calls.removeItem.length, 1);
    assert.equal(calls.removeItem[0].itemId, ITEM);
    // totals recalculated: the seeded line (120/144) is gone → 200/240 → 80/96.
    assert.deepEqual(state.totals, { totalCost: 80, totalSell: 96 });
    assert.equal(result.quote.totalSell, 96);
  });
}

for (const [label, item] of [['hotel', HOTEL_ITEM], ['transport', TRANSPORT_ITEM]] as const) {
  test(`delete: ${label} item is NOT removable (item_not_removable) and removes nothing`, async () => {
    const { service, calls } = build(withItem({ removableItem: item }));
    await expectRejects(service.previewRemoveItem(QID, ITEM, ACTOR), 'item_not_removable');
    await expectRejects(service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: 'x' }), 'item_not_removable');
    assert.equal(calls.removeItem.length, 0);
  });
}

for (const actor of [ACTOR, { ...ACTOR, role: 'super_admin' as const }, OPS_ACTOR, FINANCE_ACTOR, { ...ACTOR, role: 'agent_admin' as const }]) {
  test(`delete: service allows role ${actor.role} (no service-level role/finance gate; route RolesGuard blocks viewer/agent)`, async () => {
    const { service, calls } = build(withItem({ removableItem: EXTERNAL_ITEM }));
    const preview: any = await service.previewRemoveItem(QID, ITEM, actor);
    const result: any = await service.removeExperienceItem(QID, ITEM, actor, { previewToken: preview.previewToken });
    assert.equal(result.removed, true);
    assert.equal(calls.removeItem.length, 1);
  });
}

test('delete: EXTERNAL PACKAGE removal does NOT require a finance-only gate (operations can remove it)', async () => {
  const { service, calls } = build(withItem({ removableItem: EXTERNAL_ITEM }));
  const preview: any = await service.previewRemoveItem(QID, ITEM, OPS_ACTOR);
  const result: any = await service.removeExperienceItem(QID, ITEM, OPS_ACTOR, { previewToken: preview.previewToken });
  assert.equal(result.removed, true);
  assert.equal(result.itemType, 'external_package');
  assert.equal(calls.removeItem.length, 1);
});

test('delete preview: returns selling delta + projected totals; the DELETE token kind is v2-item-delete', async () => {
  const { service } = build(withItem({ removableItem: ACTIVITY_ITEM }));
  const preview: any = await service.previewRemoveItem(QID, ITEM, ACTOR);
  assert.equal(preview.currentTotalSell, 240);
  assert.equal(preview.projectedTotalSell, 96); // 240 - 144
  assert.equal(preview.sellDelta, -144);
  assert.equal(preview.currency, 'USD');
  const payload: any = verifyCreatePreviewToken(preview.previewToken, getPreviewTokenSecret());
  assert.equal(payload.kind, 'v2-item-delete');
  assert.equal(payload.itemId, ITEM);
  assert.equal(payload.itemType, 'activity');
});

test('delete preview: restricted (operations) role receives NO cost/margin; selling stays visible', async () => {
  const { service } = build(withItem({ removableItem: ACTIVITY_ITEM }));
  const priv: any = await service.previewRemoveItem(QID, ITEM, ACTOR);
  assert.equal(priv.currentTotalCost, 200);
  assert.equal(priv.projectedTotalCost, 80);
  assert.equal(priv.costDelta, -120);
  const restricted: any = await service.previewRemoveItem(QID, ITEM, OPS_ACTOR);
  assert.equal(restricted.currentTotalCost, null);
  assert.equal(restricted.projectedTotalCost, null);
  assert.equal(restricted.costDelta, null);
  assert.equal(restricted.currentTotalSell, 240);
  assert.equal(restricted.projectedTotalSell, 96);
});

test('delete: restricted (operations) DELETE response redacts quote cost, keeps selling total', async () => {
  const { service } = build(withItem({ removableItem: ACTIVITY_ITEM }));
  const preview: any = await service.previewRemoveItem(QID, ITEM, OPS_ACTOR);
  const result: any = await service.removeExperienceItem(QID, ITEM, OPS_ACTOR, { previewToken: preview.previewToken });
  assert.equal(result.quote.totalCost, null);
  assert.equal(result.quote.totalSell, 96);
});

test('delete preview + response never expose external internals (externalNetCost / externalInternalNotes / externalSupplierName / raw item)', async () => {
  const { service } = build(withItem({ removableItem: EXTERNAL_ITEM }));
  const preview: any = await service.previewRemoveItem(QID, ITEM, ACTOR);
  const result: any = await service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: preview.previewToken });
  for (const leak of ['externalNetCost', 'externalInternalNotes', 'externalSupplierName', 'supplierName', 'internalNotes', 'service', 'hotelId', 'activityId']) {
    assert.equal(leak in preview, false, `preview must not include ${leak}`);
    assert.equal(leak in result, false, `delete response must not include ${leak}`);
  }
});

test('delete: a wrong-kind token (a create token) is rejected (invalid_preview_token) and removes nothing', async () => {
  const { service, calls } = build(withItem({ removableItem: ACTIVITY_ITEM }));
  const createToken = await previewToken(service, GOOD, ACTOR); // v2-activity-create kind
  await expectRejects(service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: createToken }), 'invalid_preview_token');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: a tampered token is rejected (invalid_preview_token)', async () => {
  const { service, calls } = build(withItem({ removableItem: ACTIVITY_ITEM }));
  await expectRejects(service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: 'v2c.garbage.token' }), 'invalid_preview_token');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: an expired token is rejected (invalid_preview_token)', async () => {
  const { service, calls } = build(withItem({ removableItem: ACTIVITY_ITEM }));
  const expired = buildCreatePreviewToken(
    { kind: 'v2-item-delete', quoteId: QID, itemId: ITEM, itemType: 'activity', snapshotHash: 'x', projected: {}, issuedAt: 1, exp: 2 },
    getPreviewTokenSecret(),
  );
  await expectRejects(service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: expired }), 'invalid_preview_token');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: a token for a different item is rejected (invalid_preview_token identity binding)', async () => {
  const { service, calls } = build(withItem({ removableItem: ACTIVITY_ITEM }));
  const token = await removeToken(service);
  // Same token, but target a different itemId → the mock returns the same item under a
  // different id, so identity binding (itemId) no longer matches → invalid_preview_token.
  await expectRejects(service.removeExperienceItem(QID, 'other-item', ACTOR, { previewToken: token }), 'invalid_preview_token');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: a changed quote after the preview returns stale_preview and removes nothing', async () => {
  const { service, calls, state } = build(withItem({ removableItem: ACTIVITY_ITEM }));
  const token = await removeToken(service);
  state.totals.totalCost += 50; // quote moved since the preview
  await expectRejects(service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: token }), 'stale_preview');
  assert.equal(calls.removeItem.length, 0);
});

test('delete: happy path delegates to removeItem exactly once and writes a sanitized quote.item.removed audit', async () => {
  const { service, calls } = build(withItem({ removableItem: ACTIVITY_ITEM }));
  const token = await removeToken(service);
  await service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: token });
  assert.equal(calls.removeItem.length, 1);
  assert.equal(calls.createItem.length, 0); // delete never creates
  assert.equal(calls.auditLog.length, 1);
  const audit = calls.auditLog[0];
  assert.equal(audit.action, 'quote.item.removed');
  assert.equal(audit.entity, 'quoteItem');
  assert.equal(audit.entityId, ITEM);
  assert.equal(audit.metadata.quoteId, QID);
  assert.equal(audit.metadata.itemId, ITEM);
  assert.equal(audit.metadata.itemType, 'activity');
  assert.equal(audit.metadata.dayId, DAY); // resolved BEFORE the delete cascades the link
  assert.equal(audit.metadata.cost, 120);
  assert.equal(audit.metadata.sell, 144);
  // Sanitized: no PII / supplier / external internals in the audit metadata.
  for (const leak of ['externalNetCost', 'externalInternalNotes', 'externalSupplierName', 'supplierName', 'pii', 'email']) {
    assert.equal(leak in audit.metadata, false, `audit metadata must not include ${leak}`);
  }
});

test('delete: a failing audit write does not block a successful removal', async () => {
  const { service, calls } = build(withItem({ removableItem: ACTIVITY_ITEM, auditThrows: true }));
  const token = await removeToken(service);
  const result: any = await service.removeExperienceItem(QID, ITEM, ACTOR, { previewToken: token });
  assert.equal(result.removed, true);
  assert.equal(calls.removeItem.length, 1);
  assert.equal(calls.auditLog.length, 1); // attempted, threw, swallowed
});
