import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase P.3X-5C — internal/operational service titles and descriptions must never
// reach the client proposal. Q-2026-0073 leaked the title
// "Petra 3 Days archived variant source" and an operational jeep-tour description.

const FORBIDDEN = [
  /\barchived\b/i,
  /\bvariant source\b/i,
  /\bvariant\b/i,
  /\boperational\b/i,
  /max(?:imum)?\s*capacity/i,
  /duration options/i,
  /per jeep/i,
  /per vehicle/i,
];

function baseQuote(items: any[]) {
  return {
    id: 'q-p3x5c',
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
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Petra' }],
    quoteItems: items,
  };
}

function cards(vm: any): Array<{ title: string; description: string | null }> {
  return (vm.days || [])
    .flatMap((d: any) => d.groups || [])
    .flatMap((g: any) => g.items || [])
    .map((it: any) => ({ title: it.title || '', description: it.description ?? null }));
}

const ticketItem = (name: string) => ({
  id: `t-${name}`,
  itineraryId: 'day-1',
  service: { name, category: 'Ticket', serviceType: { name: 'Entrance', code: 'TICKET' } },
  totalCost: 50,
  totalSell: 60,
});

const jeepActivity = (description: string) => ({
  id: 'jeep-1',
  itineraryId: 'day-1',
  service: { name: 'Wadi Rum Jeep Tour', category: 'Activity', serviceType: { name: 'Activity', code: 'ACTIVITY' } },
  activity: { name: 'Wadi Rum Jeep Tour', description },
  activityRateVariant: { name: '2 Hours – Rum Area' },
  totalCost: 80,
  totalSell: 96,
});

test('P.3X-5C: an internal/archived service title is sanitized (no archived/variant/source)', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([ticketItem('Petra 3 Days archived variant source')]) as any);
  const text = JSON.stringify(vm);
  for (const pattern of FORBIDDEN) {
    assert.ok(!pattern.test(text), `client view must not contain ${pattern}`);
  }
  // The clean remainder is kept and still names Petra.
  const ticket = cards(vm).find((c) => /Petra/.test(c.title));
  assert.ok(ticket, 'a Petra-titled ticket card is present');
  assert.doesNotMatch(ticket!.title, /archived|variant|source/i);
});

test('P.3X-5C: an operational activity description is dropped; the clean title is kept', () => {
  const vm: any = mapQuoteToProposalV3(
    baseQuote([jeepActivity('Operational jeep tour through Wadi Rum desert with multiple duration options and max capacity per jeep.')]) as any,
  );
  const jeep = cards(vm).find((c) => /Wadi Rum Jeep Tour/.test(c.title));
  assert.ok(jeep, 'jeep tour card present with a clean title');
  assert.match(jeep!.title, /Wadi Rum Jeep Tour/);
  // The operational description is dropped (or at least carries none of the tokens).
  for (const pattern of FORBIDDEN) {
    assert.ok(!jeep!.description || !pattern.test(jeep!.description), `description must not contain ${pattern}`);
  }
});

test('P.3X-5C: a legitimate clean service title is unchanged', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([ticketItem('Petra Entrance Ticket')]) as any);
  const ticket = cards(vm).find((c) => /Petra Entrance Ticket/.test(c.title));
  assert.ok(ticket, 'clean title preserved exactly');
  assert.equal(ticket!.title, 'Petra Entrance Ticket');
});

test('P.3X-5C: a legitimate clean activity description is unchanged', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([jeepActivity('Explore the desert landscapes of Wadi Rum by 4x4.')]) as any);
  const jeep = cards(vm).find((c) => /Wadi Rum Jeep Tour/.test(c.title));
  assert.ok(jeep, 'jeep card present');
  assert.match(jeep!.description || '', /Explore the desert landscapes of Wadi Rum by 4x4\./);
});

test('P.3X-5C: "3 Days" alone is never treated as internal (no over-strip)', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([ticketItem('Petra Pass 3 Days')]) as any);
  const ticket = cards(vm).find((c) => /Petra Pass 3 Days/.test(c.title));
  assert.ok(ticket, 'a clean "3 Days" title is kept verbatim');
  assert.equal(ticket!.title, 'Petra Pass 3 Days');
});
