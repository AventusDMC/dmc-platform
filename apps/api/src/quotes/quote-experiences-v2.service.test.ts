import { test, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuoteExperiencesV2Service } from './quote-experiences-v2.service';
import { buildCreatePreviewToken } from './quote-create-preview-token';
import { getPreviewTokenSecret } from './quote-preview-token';

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
  // or null to exercise service_not_found.
  service?: { id: string; category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null } | null;
  created?: any;
  createThrows?: boolean;
  auditThrows?: boolean;
  previewThrows?: boolean;
  removeThrows?: boolean;
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
// Default actor is a cost-visible role (admin) so the pre-2C guard tests keep
// asserting cost values. Slice 2C redaction for restricted roles is covered by the
// dedicated tests at the end of this file.
const ACTOR = { id: 'user-1', companyId: 'company-A', auditLabel: 'Alice', role: 'admin' as const };
// A restricted (non-finance) actor: same access to add, but no cost/margin visibility.
const OPS_ACTOR = { id: 'user-2', companyId: 'company-A', auditLabel: 'Omar', role: 'operations' as const };
const GOOD = { itemType: 'activity', dayId: DAY, activityId: ACT, activityRateVariantId: VAR, serviceDate: '2026-08-07' };
const SVC = 'svc-1';
const GOOD_GUIDE = { itemType: 'guide', dayId: DAY, serviceId: SVC, guideType: 'local', guideDuration: 'full_day', serviceDate: '2026-08-07' };

function build(opts: Options = {}) {
  const calls: Record<string, any[]> = { createItem: [], removeItem: [], previewValues: [], auditLog: [] };
  const projected = opts.projected ?? { totalCost: 120, totalSell: 144, currency: 'USD' };
  const state = {
    totals: { ...(opts.preTotals ?? { totalCost: 200, totalSell: 240 }) },
    items: [] as { id: string; totalCost: number; totalSell: number }[],
  };

  const prisma = {
    quote: {
      findFirst: async (args: any) => {
        if (args?.where?.revisedFromId) return opts.newerRevision ?? null;
        return opts.quote === undefined
          ? { id: QID, brandCompanyId: null, status: 'DRAFT', quoteCurrency: 'USD', adults: 2, children: 0 }
          : opts.quote;
      },
      // Reads current mutable totals (pre-create during snapshots, post-create during compare).
      findUnique: async () => ({ totalCost: state.totals.totalCost, totalSell: state.totals.totalSell, quoteCurrency: 'USD' }),
    },
    quoteItem: {
      findMany: async () => state.items,
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

test('a non-activity itemType is rejected out_of_scope', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.addActivityItem(QID, { ...GOOD, itemType: 'meal' }, ACTOR, { previewToken: 'x', acknowledgedDelta: true }), 'out_of_scope');
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
