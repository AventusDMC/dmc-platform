import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';

// Phase K.1 — pax-banded, explicit guide policy for PackageTemplate SERVICE
// components linked to a guide service. No silent default: guideType +
// guideDuration must be present; overnight only when escort AND guideOvernight.
// Pricing flows through createItem's GUIDE_RATES (not exercised here).

function makeService() {
  const prisma: any = {};
  return new QuotesService(prisma, {} as any, {} as any, {} as any, {} as any) as any;
}

const GUIDE_SVC = {
  id: 'svc-guide',
  name: 'Licensed Jordan Guide Service',
  category: 'Guiding',
  currency: 'USD',
  serviceType: { code: 'GUIDE', name: 'Guiding' },
};
const PLAIN_SVC = { id: 'svc-meet', name: 'Airport Meet And Assist', category: 'assistance', serviceType: { code: 'MEET_ASSIST', name: 'Meet & Assist' } };

const PKG = { id: 'pkg1' };
const DAY = { id: 'day1', dayNumber: 2 };
const QDAY = { id: 'qday1' };
const quote = (adults: number) => ({ id: 'q', adults, children: 0 });

function guideComponent(overrides: any = {}) {
  return {
    id: 'c-guide',
    componentType: 'SERVICE',
    label: 'Licensed Jordan Guide Service',
    supplierServiceId: 'svc-guide',
    supplierService: GUIDE_SVC,
    guideType: 'local',
    guideDuration: 'full_day',
    guideOvernight: false,
    minPax: 1,
    maxPax: 5,
    ...overrides,
  };
}
const status = (s: any, c: any, q: any) => s.getPackageComponentMappingStatus(c, q);
const payload = (s: any, c: any, q: any) =>
  s.buildPackageComponentQuoteItemPayload({ quote: q, packageTemplate: PKG, packageDay: DAY, packageComponent: c, quoteDay: QDAY });

// ---- pax band ----
test('pax band: local guide (1–5) is applicable for 2 pax', async () => {
  const s = makeService();
  const st = await status(s, guideComponent(), quote(2));
  assert.equal(st.insertable, true);
});

test('pax band: escort guide (6–∞) is NOT applicable for 2 pax (benign skip)', async () => {
  const s = makeService();
  const st = await status(s, guideComponent({ guideType: 'escort', minPax: 6, maxPax: null }), quote(2));
  assert.equal(st.insertable, false);
  assert.match(st.reason, /applies to 6–∞ pax.*has 2/);
});

test('pax band: local guide (1–5) is NOT applicable for 10 pax', async () => {
  const s = makeService();
  const st = await status(s, guideComponent(), quote(10));
  assert.equal(st.insertable, false);
  assert.match(st.reason, /applies to 1–5 pax.*has 10/);
});

test('pax band: a component with no min/max (pre-K) is always applicable', async () => {
  const s = makeService();
  const st = await status(s, { componentType: 'SERVICE', supplierServiceId: 'svc-meet', supplierService: PLAIN_SVC, minPax: null, maxPax: null }, quote(99));
  assert.equal(st.insertable, true);
});

// ---- guide mapping status ----
test('guide service WITHOUT guideType/guideDuration is not insertable (clear reason, no silent default)', async () => {
  const s = makeService();
  const st = await status(s, guideComponent({ guideType: null, guideDuration: null }), quote(2));
  assert.equal(st.insertable, false);
  assert.match(st.reason, /guideType.*guideDuration/);
});

test('guide service WITH guideType + guideDuration (in band) is insertable', async () => {
  const s = makeService();
  const st = await status(s, guideComponent(), quote(2));
  assert.equal(st.insertable, true);
  assert.equal(st.reason, null);
});

test('non-guide SERVICE is unaffected (insertable with just a linked service)', async () => {
  const s = makeService();
  const st = await status(s, { componentType: 'SERVICE', supplierServiceId: 'svc-meet', supplierService: PLAIN_SVC }, quote(2));
  assert.equal(st.insertable, true);
});

// ---- payload ----
test('local/full_day guide payload: guideType+duration passed, overnight false, 20% markup, provenance', async () => {
  const s = makeService();
  const p = await payload(s, guideComponent(), quote(2));
  assert.ok(p);
  assert.equal(p.serviceId, 'svc-guide');
  assert.equal(p.guideType, 'local');
  assert.equal(p.guideDuration, 'full_day');
  assert.equal(p.overnight, false);
  assert.equal(p.markupPercent, 20);
  assert.equal(p.packageTemplateComponentId, 'c-guide');
  assert.equal(p.itineraryId, 'qday1');
});

test('escort + guideOvernight true → overnight true; escort + false → false; local + true → false', async () => {
  const s = makeService();
  const escOn = await payload(s, guideComponent({ guideType: 'escort', minPax: 6, maxPax: null, guideOvernight: true }), quote(8));
  assert.equal(escOn.overnight, true);
  const escOff = await payload(s, guideComponent({ guideType: 'escort', minPax: 6, maxPax: null, guideOvernight: false }), quote(8));
  assert.equal(escOff.overnight, false);
  const localOn = await payload(s, guideComponent({ guideType: 'local', guideOvernight: true }), quote(2));
  assert.equal(localOn.overnight, false, 'overnight supplement only applies to escort');
});

test('guide service payload returns null when guideType/guideDuration missing', async () => {
  const s = makeService();
  const p = await payload(s, guideComponent({ guideType: null, guideDuration: null }), quote(2));
  assert.equal(p, null);
});

test('non-guide SERVICE payload carries serviceId and NO guide fields', async () => {
  const s = makeService();
  const p = await payload(s, { id: 'c-meet', componentType: 'SERVICE', supplierServiceId: 'svc-meet', supplierService: PLAIN_SVC }, quote(2));
  assert.ok(p);
  assert.equal(p.serviceId, 'svc-meet');
  assert.equal(p.guideType, undefined);
  assert.equal(p.guideDuration, undefined);
  assert.equal(p.overnight, undefined);
});
