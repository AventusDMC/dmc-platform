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
const ACTOR = { id: 'user-1', companyId: 'company-A', auditLabel: 'Alice' };
const GOOD = { itemType: 'activity', dayId: DAY, activityId: ACT, activityRateVariantId: VAR, serviceDate: '2026-08-07' };

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
