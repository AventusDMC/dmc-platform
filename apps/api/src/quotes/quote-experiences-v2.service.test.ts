import { test, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuoteExperiencesV2Service } from './quote-experiences-v2.service';

// Fakes for PrismaService + the delegated QuotesService.createItem + AuditService.
// The V2 service is thin (flag-gate → activity-only → required-fields → access-guard
// → day-belongs → activity/variant integrity → delegate → audit), so plain object
// fakes exercise every branch without a DB.

type Options = {
  flag?: boolean;
  quote?: { id: string; brandCompanyId?: string | null; status?: string; quoteCurrency?: string; adults?: number; children?: number } | null;
  newerRevision?: { id: string } | null;
  day?: { id: string; quoteId: string } | null;
  activity?: { id: string } | null;
  variant?: { id: string; activityId: string } | null;
  service?: { id: string; category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null } | null;
  created?: any;
  createThrows?: boolean;
  auditThrows?: boolean;
  totalsAfter?: { totalCost: number; totalSell: number };
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
const SVC = 'svc-1';
const ACTOR = { id: 'user-1', companyId: 'company-A', auditLabel: 'Alice' };
const GOOD = { itemType: 'activity', dayId: DAY, activityId: ACT, activityRateVariantId: VAR, serviceDate: '2026-08-07' };
const GUIDE = { itemType: 'guide', dayId: DAY, serviceId: SVC, guideType: 'local', guideDuration: 'half_day', serviceDate: '2026-08-07' };

function build(opts: Options = {}) {
  const calls: Record<string, any[]> = { createItem: [], auditLog: [] };

  const prisma = {
    quote: {
      findFirst: async (args: any) => {
        if (args?.where?.revisedFromId) return opts.newerRevision ?? null;
        return opts.quote === undefined
          ? { id: QID, brandCompanyId: null, status: 'DRAFT', quoteCurrency: 'USD', adults: 2, children: 0 }
          : opts.quote;
      },
      findUnique: async () => opts.totalsAfter ?? { totalCost: 320, totalSell: 384 },
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
    supplierService: {
      // Default is a guide-compatible service (serviceType code GUIDE).
      findUnique: async () =>
        opts.service === undefined ? { id: SVC, category: 'Guide', serviceType: { name: 'Guide', code: 'GUIDE' } } : opts.service,
    },
  };

  const quotes = {
    createItem: async (data: any, actor: any) => {
      calls.createItem.push({ data, actor });
      if (opts.createThrows) throw new Error('createItem boom');
      return opts.created ?? { id: 'item-new', totalCost: 120, totalSell: 144, currency: 'USD' };
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
  return { service, calls };
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

// 1. Flag OFF blocks create
test('addActivityItem is blocked (feature_disabled) when the flag is OFF and writes nothing', async () => {
  const { service, calls } = build({ flag: false });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR), 'feature_disabled');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

// 2. Flag ON + authorized creates one activity item (+ delegation args + audit)
test('addActivityItem creates one activity item, delegates to createItem, and writes a sanitized audit row', async () => {
  const { service, calls } = build({ flag: true });
  const result = await service.addActivityItem(QID, GOOD, ACTOR);

  assert.equal(calls.createItem.length, 1);
  const d = calls.createItem[0].data;
  assert.equal(d.quoteId, QID);
  assert.equal(d.activityId, ACT);
  assert.equal(d.activityRateVariantId, VAR);
  assert.equal(d.itineraryId, DAY); // linked to the selected day
  assert.ok(d.serviceDate instanceof Date);
  assert.equal(d.adultCount, 2); // defaulted from quote
  assert.equal(calls.createItem[0].actor.companyId, 'company-A');

  assert.equal(result.itemId, 'item-new');
  assert.equal(result.itemType, 'activity');
  assert.deepEqual(result.quote, { totalCost: 320, totalSell: 384 });

  assert.equal(calls.auditLog.length, 1);
  const a = calls.auditLog[0];
  assert.equal(a.action, 'quote.item.created');
  assert.equal(a.entity, 'quoteItem');
  assert.equal(a.entityId, 'item-new');
  assert.deepEqual(Object.keys(a.metadata).sort(), ['activityId', 'activityRateVariantId', 'cost', 'currency', 'dayId', 'itemId', 'itemType', 'quoteId', 'sell'].sort());
  assert.equal(a.metadata.itemType, 'activity');
  assert.equal(a.metadata.cost, 120);
  assert.equal(a.metadata.sell, 144);
  // no PII / token / secret keys
  for (const k of Object.keys(a.metadata)) {
    assert.ok(!/passenger|passport|token|secret|cookie|url|password/i.test(k), `unexpected metadata key: ${k}`);
  }
});

// 3. Non-activity type rejected out_of_scope
test('a non-activity itemType is rejected out_of_scope', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.addActivityItem(QID, { ...GOOD, itemType: 'meal' }, ACTOR), 'out_of_scope');
  assert.equal(calls.createItem.length, 0);
});

// 4. Missing required fields rejected
for (const field of ['dayId', 'activityId', 'activityRateVariantId', 'serviceDate']) {
  test(`missing ${field} is rejected (missing_field) and does not create`, async () => {
    const { service, calls } = build({ flag: true });
    const bad: any = { ...GOOD, [field]: '' };
    await expectRejects(service.addActivityItem(QID, bad, ACTOR), 'missing_field');
    assert.equal(calls.createItem.length, 0);
  });
}

// 5. Day must belong to quote
test('a day that does not belong to the quote is rejected (day_not_found)', async () => {
  const { service, calls } = build({ flag: true, day: { id: DAY, quoteId: 'other-quote' } });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR), 'day_not_found');
  assert.equal(calls.createItem.length, 0);
});

// 6. Rate variant must belong to activity
test('a rate variant that does not belong to the activity is rejected (variant_mismatch)', async () => {
  const { service, calls } = build({ flag: true, variant: { id: VAR, activityId: 'other-activity' } });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR), 'variant_mismatch');
  assert.equal(calls.createItem.length, 0);
});

// 7. Unauthorized (no company context) rejected
test('a caller without a company context is rejected (company isolation)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(
    service.addActivityItem(QID, GOOD, { id: 'user-1', companyId: null, auditLabel: 'NoCo' }),
    'Company context is required',
  );
  assert.equal(calls.createItem.length, 0);
});

// 8. Cross-company access rejected; legacy null-brand allowed
test('a quote owned by a different company is rejected (cross-company)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: 'company-B', status: 'DRAFT', quoteCurrency: 'USD', adults: 2, children: 0 } });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR), 'different company');
  assert.equal(calls.createItem.length, 0);
});

test('a legacy quote with no brandCompanyId is accessible (no regression)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: null, status: 'DRAFT', quoteCurrency: 'USD', adults: 2, children: 0 } });
  const result = await service.addActivityItem(QID, GOOD, ACTOR);
  assert.equal(result.itemId, 'item-new');
  assert.equal(calls.createItem.length, 1);
});

// non-editable status rejected
test('a non-editable quote status is rejected (quote_not_editable)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: null, status: 'SENT', quoteCurrency: 'USD', adults: 2, children: 0 } });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR), 'quote_not_editable');
  assert.equal(calls.createItem.length, 0);
});

// 9/10. Delegation carries the cost/sell + day link; result reflects fresh totals
test('the created item cost/sell and fresh quote totals are returned', async () => {
  const { service } = build({ flag: true, created: { id: 'item-9', totalCost: 200, totalSell: 240, currency: 'USD' }, totalsAfter: { totalCost: 400, totalSell: 480 } });
  const result = await service.addActivityItem(QID, GOOD, ACTOR);
  assert.equal(result.cost, 200);
  assert.equal(result.sell, 240);
  assert.deepEqual(result.quote, { totalCost: 400, totalSell: 480 });
});

// 12. Audit failure does not block the create
test('a failing audit write does not block the create', async () => {
  const { service, calls } = build({ flag: true, auditThrows: true });
  const result = await service.addActivityItem(QID, GOOD, ACTOR);
  assert.equal(result.itemId, 'item-new');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.auditLog.length, 1); // attempted, threw, swallowed
});

// 13. Failed create writes no success audit
test('a failed create writes no success audit and propagates the error', async () => {
  const { service, calls } = build({ flag: true, createThrows: true });
  await expectRejects(service.addActivityItem(QID, GOOD, ACTOR), 'createItem boom');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.auditLog.length, 0);
});

// ── Slice 3: Guide ───────────────────────────────────────────────────────────

// G1. Flag OFF blocks guide create.
test('guide: addItem is blocked (feature_disabled) when the flag is OFF and writes nothing', async () => {
  const { service, calls } = build({ flag: false });
  await expectRejects(service.addItem(QID, GUIDE, ACTOR), 'feature_disabled');
  assert.equal(calls.createItem.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

// G2 + G11 + G13 + G14. Flag ON creates one guide item; delegates guide args (incl.
// day link + overnight + guide markup); writes a sanitized guide audit row.
test('guide: creates one item, delegates guide args to createItem, and writes a sanitized guide audit row', async () => {
  const { service, calls } = build({ flag: true, created: { id: 'guide-item', totalCost: 96, totalSell: 96, currency: 'USD' }, totalsAfter: { totalCost: 96, totalSell: 96 } });
  const result = await service.addItem(QID, { ...GUIDE, overnight: true, guideLanguage: 'English' }, ACTOR);

  assert.equal(calls.createItem.length, 1);
  const d = calls.createItem[0].data;
  assert.equal(d.serviceId, SVC);
  assert.equal(d.guideType, 'local');
  assert.equal(d.guideDuration, 'half_day');
  assert.equal(d.overnight, true);
  assert.equal(d.itineraryId, DAY); // linked to the selected day
  assert.equal(d.quantity, 1);
  assert.equal(typeof d.markupPercent, 'number'); // GUIDE_DEFAULT_MARKUP applied (not forked)
  assert.ok(d.serviceDate instanceof Date);
  // No activity fields on a guide create.
  assert.equal(d.activityId, undefined);

  assert.equal(result.itemType, 'guide');
  assert.equal(result.itemId, 'guide-item');
  assert.deepEqual(result.quote, { totalCost: 96, totalSell: 96 });

  assert.equal(calls.auditLog.length, 1);
  const a = calls.auditLog[0];
  assert.equal(a.action, 'quote.item.created');
  assert.equal(a.entity, 'quoteItem');
  assert.equal(a.metadata.itemType, 'guide');
  assert.deepEqual(
    Object.keys(a.metadata).sort(),
    ['cost', 'currency', 'dayId', 'guideDuration', 'guideType', 'itemId', 'itemType', 'overnight', 'quoteId', 'sell', 'serviceId'].sort(),
  );
  // guideLanguage + guide-person id are intentionally NOT audited; no PII/leak keys.
  assert.equal(a.metadata.guideLanguage, undefined);
  for (const k of Object.keys(a.metadata)) {
    assert.ok(!/passenger|passport|guideperson|token|secret|cookie|url|password/i.test(k), `unexpected metadata key: ${k}`);
  }
});

// G3. Activity path still works via the shared dispatcher.
test('guide slice does not break activity: addItem with activity still creates an activity item', async () => {
  const { service, calls } = build({ flag: true });
  const result = await service.addItem(QID, GOOD, ACTOR);
  assert.equal(result.itemType, 'activity');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.createItem[0].data.activityId, ACT);
  assert.equal(calls.auditLog[0].metadata.itemType, 'activity');
});

// G4. Non-guide service rejected.
test('guide: a non-guide service is rejected (not_guide_service) and does not create', async () => {
  const { service, calls } = build({ flag: true, service: { id: SVC, category: 'Meal', serviceType: { name: 'Dinner', code: 'MEAL' } } });
  await expectRejects(service.addItem(QID, GUIDE, ACTOR), 'not_guide_service');
  assert.equal(calls.createItem.length, 0);
});

// Missing service on lookup.
test('guide: a missing service is rejected (service_not_found)', async () => {
  const { service, calls } = build({ flag: true, service: null });
  await expectRejects(service.addItem(QID, GUIDE, ACTOR), 'service_not_found');
  assert.equal(calls.createItem.length, 0);
});

// G5. Missing required fields rejected.
for (const field of ['dayId', 'serviceId', 'guideType', 'guideDuration', 'serviceDate']) {
  test(`guide: missing ${field} is rejected (missing_field) and does not create`, async () => {
    const { service, calls } = build({ flag: true });
    const bad: any = { ...GUIDE, [field]: '' };
    await expectRejects(service.addItem(QID, bad, ACTOR), 'missing_field');
    assert.equal(calls.createItem.length, 0);
  });
}

// G6. Invalid guideType.
test('guide: an invalid guideType is rejected (invalid_guide_type)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.addItem(QID, { ...GUIDE, guideType: 'senior' }, ACTOR), 'invalid_guide_type');
  assert.equal(calls.createItem.length, 0);
});

// G7. Invalid guideDuration.
test('guide: an invalid guideDuration is rejected (invalid_guide_duration)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.addItem(QID, { ...GUIDE, guideDuration: 'two_days' }, ACTOR), 'invalid_guide_duration');
  assert.equal(calls.createItem.length, 0);
});

// G8. Day must belong to quote.
test('guide: a day that does not belong to the quote is rejected (day_not_found)', async () => {
  const { service, calls } = build({ flag: true, day: { id: DAY, quoteId: 'other-quote' } });
  await expectRejects(service.addItem(QID, GUIDE, ACTOR), 'day_not_found');
  assert.equal(calls.createItem.length, 0);
});

// G9. No company context (company isolation).
test('guide: a caller without a company context is rejected', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.addItem(QID, GUIDE, { id: 'user-1', companyId: null, auditLabel: 'NoCo' }), 'Company context is required');
  assert.equal(calls.createItem.length, 0);
});

// G10. Cross-company rejected.
test('guide: a quote owned by a different company is rejected (cross-company)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: 'company-B', status: 'DRAFT', quoteCurrency: 'USD', adults: 2, children: 0 } });
  await expectRejects(service.addItem(QID, GUIDE, ACTOR), 'different company');
  assert.equal(calls.createItem.length, 0);
});

// Non-editable status rejected.
test('guide: a non-editable quote status is rejected (quote_not_editable)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: null, status: 'SENT', quoteCurrency: 'USD', adults: 2, children: 0 } });
  await expectRejects(service.addItem(QID, GUIDE, ACTOR), 'quote_not_editable');
  assert.equal(calls.createItem.length, 0);
});

// G15. Audit failure does not block a guide create.
test('guide: a failing audit write does not block the create', async () => {
  const { service, calls } = build({ flag: true, auditThrows: true });
  const result = await service.addItem(QID, GUIDE, ACTOR);
  assert.equal(result.itemType, 'guide');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.auditLog.length, 1);
});

// G16. Failed guide create writes no success audit.
test('guide: a failed create writes no success audit and propagates the error', async () => {
  const { service, calls } = build({ flag: true, createThrows: true });
  await expectRejects(service.addItem(QID, GUIDE, ACTOR), 'createItem boom');
  assert.equal(calls.createItem.length, 1);
  assert.equal(calls.auditLog.length, 0);
});

// Out-of-scope type (neither activity nor guide).
test('an unsupported itemType is rejected out_of_scope', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.addItem(QID, { ...GUIDE, itemType: 'meal' }, ACTOR), 'out_of_scope');
  assert.equal(calls.createItem.length, 0);
});
