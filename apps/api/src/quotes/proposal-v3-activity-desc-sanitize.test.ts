import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase P.3X-5C.1 — activity-rate / capacity / unit metadata must never reach a
// client service description, in ANY proposal language. P.3X-QA1 found the
// Spanish + English proposal exposing:
//   "Wadi Rum Jeep Tour, 2 Hours – Rum Area, Activity, PER_GROUP,
//    Capacity 6 pax/unit, Required units 1, 120 minutes."

const META = [
  /PER_GROUP/i,
  /PER_PERSON/i,
  /PER_VEHICLE/i,
  /Capacity\s+\d+\s*pax/i,
  /pax\s*\/\s*unit/i,
  /Required\s+units?/i,
  /rate\s*basis/i,
  /pricing\s*basis/i,
];

function baseQuote(items: any[]) {
  return {
    id: 'q-p3x5c1',
    quoteCurrency: 'USD',
    title: 'Jordan Explorer',
    createdAt: new Date('2026-04-27T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 1,
    adults: 2,
    children: 0,
    totalCost: 200,
    totalSell: 240,
    pricePerPax: 120,
    quoteOptions: [],
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Wadi Rum' }],
    quoteItems: items,
  };
}

function cards(vm: any): Array<{ title: string; description: string | null }> {
  return (vm.days || [])
    .flatMap((d: any) => d.groups || [])
    .flatMap((g: any) => g.items || [])
    .map((it: any) => ({ title: it.title || '', description: it.description ?? null }));
}

// A service-less activity item whose pricingDescription carries the internal
// rate/capacity metadata (the field that leaked in Q-2026-0073).
// Mirrors the real Q-2026-0073 shape: a service-less activity item (empty
// service name) whose title comes from activity name + rate-variant, so the
// client title reads "Wadi Rum Jeep Tour — 2 Hours – Rum Area".
const jeepWithMeta = (pricingDescription: string) => ({
  id: 'jeep-1',
  itineraryId: 'day-1',
  service: { name: '', category: 'Activity', serviceType: { name: 'Activity', code: 'ACTIVITY' } },
  activity: { name: 'Wadi Rum Jeep Tour' },
  activityRateVariant: { name: '2 Hours – Rum Area' },
  pricingDescription,
  totalCost: 80,
  totalSell: 96,
});

const cleanActivity = (description: string) => ({
  id: 'clean-1',
  itineraryId: 'day-1',
  service: { name: 'Wadi Rum Jeep Tour', category: 'Activity', serviceType: { name: 'Activity', code: 'ACTIVITY' } },
  activity: { name: 'Wadi Rum Jeep Tour', description },
  activityRateVariant: { name: '2 Hours – Rum Area' },
  totalCost: 80,
  totalSell: 96,
});

const LEAKY = 'Wadi Rum Jeep Tour | 2 Hours – Rum Area | Activity | PER_GROUP | Capacity 6 pax/unit | Required units 1 | 120 minutes';

for (const lang of ['en', 'es', 'pt', 'ar']) {
  test(`P.3X-5C.1: activity rate/capacity/unit metadata never reaches the client (${lang})`, () => {
    const vm: any = mapQuoteToProposalV3(baseQuote([jeepWithMeta(LEAKY)]) as any, lang);
    const text = JSON.stringify(vm);
    for (const pattern of META) {
      assert.ok(!pattern.test(text), `client view (${lang}) must not contain ${pattern}`);
    }
    // "120 minutes" went with the dropped descriptor.
    assert.ok(!/120\s*minutes/i.test(text), `client view (${lang}) must not contain "120 minutes"`);
    // The clean activity title is preserved (incl. the legitimate "2 Hours").
    const jeep = cards(vm).find((c) => /Wadi Rum Jeep Tour/.test(c.title));
    assert.ok(jeep, `jeep card present (${lang})`);
    assert.match(jeep!.title, /Wadi Rum Jeep Tour/);
    assert.match(jeep!.title, /2 Hours/);
    // The metadata description is dropped (or at least carries none of the tokens).
    for (const pattern of [...META, /120\s*minutes/i]) {
      assert.ok(!jeep!.description || !pattern.test(jeep!.description), `desc (${lang}) free of ${pattern}`);
    }
  });
}

test('P.3X-5C.1: a clean activity description is unchanged', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([cleanActivity('Explore the desert landscapes of Wadi Rum by 4x4.')]) as any);
  const jeep = cards(vm).find((c) => /Wadi Rum Jeep Tour/.test(c.title));
  assert.ok(jeep, 'jeep card present');
  assert.match(jeep!.description || '', /Explore the desert landscapes of Wadi Rum by 4x4\./);
});

test('P.3X-5C.1: a clean description mentioning "120 minutes" prose is NOT over-stripped', () => {
  // No rate-basis enum / pax-unit / required-units tokens → kept verbatim.
  const vm: any = mapQuoteToProposalV3(baseQuote([cleanActivity('A relaxed 120 minutes jeep tour across the Rum valley.')]) as any);
  const jeep = cards(vm).find((c) => /Wadi Rum Jeep Tour/.test(c.title));
  assert.ok(jeep, 'jeep card present');
  assert.match(jeep!.description || '', /120 minutes/);
});
