import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';

// Phase I.1 — PackageTemplate ACTIVITY apply via an explicitly linked
// ActivityRateVariant. No auto-pick: the component must carry an
// activityRateVariantId that is active and belongs to its activity. Pricing
// flows through the existing createItem activity path (not exercised here).

const ACT = 'act-1';
const VAR = 'var-1';

function makeService(variantById: Record<string, any> = {}) {
  const calls: string[] = [];
  const prisma: any = {
    activityRateVariant: {
      findUnique: async (args: any) => {
        calls.push(args.where.id);
        return variantById[args.where.id] ?? null;
      },
    },
  };
  const service = new QuotesService(prisma, {} as any, {} as any, {} as any, {} as any) as any;
  return { service, calls };
}

const QUOTE = { id: 'q1', adults: 2, children: 0 };
const PKG = { id: 'pkg1' };
const DAY = { id: 'day1', dayNumber: 5 };
const QDAY = { id: 'qday1' };

function activityComponent(overrides: any = {}) {
  return {
    id: 'comp-act',
    componentType: 'ACTIVITY',
    label: 'Wadi Rum Jeep Tour',
    activityId: ACT,
    activityRateVariantId: VAR,
    ...overrides,
  };
}

const ACTIVE_VARIANT = { id: VAR, activityId: ACT, active: true, name: '2 Hours – Rum Area', costPrice: 40, sellPrice: 40, currency: 'JOD' };

function status(service: any, component: any) {
  return service.getPackageComponentMappingStatus(component, QUOTE);
}
function buildPayload(service: any, component: any) {
  return service.buildPackageComponentQuoteItemPayload({ quote: QUOTE, packageTemplate: PKG, packageDay: DAY, packageComponent: component, quoteDay: QDAY });
}

test('ACTIVITY without activityRateVariantId is NOT insertable (clear reason)', async () => {
  const { service, calls } = makeService();
  const s = await status(service, activityComponent({ activityRateVariantId: null }));
  assert.equal(s.insertable, false);
  assert.match(s.reason, /active rate variant/i);
  assert.equal(calls.length, 0, 'no variant lookup when none is linked');
  assert.equal(await buildPayload(service, activityComponent({ activityRateVariantId: null })), null);
});

test('ACTIVITY with an inactive variant is NOT insertable', async () => {
  const { service } = makeService({ [VAR]: { ...ACTIVE_VARIANT, active: false } });
  const s = await status(service, activityComponent());
  assert.equal(s.insertable, false);
  assert.equal(await buildPayload(service, activityComponent()), null);
});

test('ACTIVITY whose variant belongs to a different activity is NOT insertable', async () => {
  const { service } = makeService({ [VAR]: { ...ACTIVE_VARIANT, activityId: 'other-activity' } });
  const s = await status(service, activityComponent());
  assert.equal(s.insertable, false);
  assert.equal(await buildPayload(service, activityComponent()), null);
});

test('ACTIVITY with a valid active variant becomes insertable', async () => {
  const { service, calls } = makeService({ [VAR]: ACTIVE_VARIANT });
  const s = await status(service, activityComponent());
  assert.equal(s.insertable, true);
  assert.equal(s.reason, null);
  assert.deepEqual(calls, [VAR]);
});

test('buildPackageComponentQuoteItemPayload returns activityId + activityRateVariantId + participantCount + provenance', async () => {
  const { service } = makeService({ [VAR]: ACTIVE_VARIANT });
  const payload = await buildPayload(service, activityComponent());
  assert.ok(payload, 'payload should resolve');
  assert.equal(payload.activityId, ACT);
  assert.equal(payload.activityRateVariantId, VAR);
  assert.equal(payload.participantCount, 2); // 2 adults + 0 children
  // provenance + markup (per-type ACTIVITY = 20%)
  assert.equal(payload.packageTemplateId, 'pkg1');
  assert.equal(payload.packageTemplateDayId, 'day1');
  assert.equal(payload.packageTemplateComponentId, 'comp-act');
  assert.equal(payload.itineraryId, 'qday1');
  assert.equal(payload.markupPercent, 20);
});

test('inline component.activityRateVariant is used without a DB lookup', async () => {
  const { service, calls } = makeService(); // empty store -> findUnique would return null
  const comp = activityComponent({ activityRateVariant: ACTIVE_VARIANT });
  const s = await status(service, comp);
  assert.equal(s.insertable, true);
  assert.equal(calls.length, 0, 'preloaded variant avoids the lookup');
});
