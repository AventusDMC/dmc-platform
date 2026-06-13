import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase P.3X-3 — proposal-v3 duration / night-count hygiene.
//
// Regression source: PDF Q-2026-0073 showed "8 Days / 1 Night" because the
// duration label trusted a stale quote.nightCount (1) over the 7-night itinerary.
// The display night count now prefers itinerary evidence when it clearly exceeds
// the stored value, but never reduces a stored value and never invents nights
// without overnight evidence.

function hotelItem(dayId: string, city: string, nights: number) {
  return {
    id: `h-${dayId}`,
    itineraryId: dayId,
    service: { name: `${city} Hotel`, category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
    hotel: { name: `${city} Hotel`, city },
    roomCategory: { name: 'Standard Room' },
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingBasis: 'PER_ROOM',
    nightCount: nights,
    totalCost: 100 * nights,
    totalSell: 120 * nights,
  };
}

function baseQuote(overrides: Record<string, unknown>, itineraries: any[], items: any[]) {
  return {
    id: 'q-p3x3',
    quoteCurrency: 'USD',
    title: 'Jordan Private Journey',
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    adults: 2,
    children: 0,
    totalCost: 1000,
    totalSell: 1200,
    pricePerPax: 600,
    quoteOptions: [],
    itineraries,
    quoteItems: items,
    ...overrides,
  };
}

function days(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}`, dayNumber: i + 1, title: `Day ${i + 1}` }));
}

test('P.3X-3: stale-low quote.nightCount is corrected from itinerary evidence (8 Days / 7 Nights)', () => {
  // 8 itinerary days, stored nightCount = 1 (stale), hotels evidence 7 nights.
  const itineraries = days(8);
  const items = [
    hotelItem('d1', 'Amman', 2),
    hotelItem('d3', 'Petra', 2),
    hotelItem('d4', 'Wadi Rum', 1),
    hotelItem('d7', 'Dead Sea', 2),
  ];
  const vm: any = mapQuoteToProposalV3(baseQuote({ nightCount: 1 }, itineraries, items) as any);
  assert.equal(vm.durationLabel, '8 Days / 7 Nights');
  assert.match(vm.subtitle, /\b7 nights\b/i); // subtitle uses the locale night unit label

});

test('P.3X-3: a correct quote.nightCount is left unchanged', () => {
  const itineraries = days(8);
  const items = [
    hotelItem('d1', 'Amman', 2),
    hotelItem('d3', 'Petra', 2),
    hotelItem('d4', 'Wadi Rum', 1),
    hotelItem('d7', 'Dead Sea', 2),
  ];
  const vm: any = mapQuoteToProposalV3(baseQuote({ nightCount: 7 }, itineraries, items) as any);
  assert.equal(vm.durationLabel, '8 Days / 7 Nights');
});

test('P.3X-3: a stored night count is never REDUCED by partial hotel evidence', () => {
  // Stored 7 nights, but only 6 hotel-nights captured → keep the stored 7.
  const itineraries = days(8);
  const items = [hotelItem('d1', 'Amman', 2), hotelItem('d3', 'Petra', 2), hotelItem('d4', 'Wadi Rum', 2)];
  const vm: any = mapQuoteToProposalV3(baseQuote({ nightCount: 7 }, itineraries, items) as any);
  assert.equal(vm.durationLabel, '8 Days / 7 Nights');
});

test('P.3X-3: one-day quote with no overnight evidence → 1 Day / 0 Nights', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote({ nightCount: 0 }, days(1), []) as any);
  assert.equal(vm.durationLabel, '1 Day / 0 Nights');
});

test('P.3X-3: incomplete shell itinerary keeps the intentional stored night count (not dayCount-1)', () => {
  // 5 days, intentional stored 2 nights, NO hotel/overnight evidence → keep 2 (not 4).
  const vm: any = mapQuoteToProposalV3(baseQuote({ nightCount: 2 }, days(5), []) as any);
  assert.equal(vm.durationLabel, '5 Days / 2 Nights');
});

test('P.3X-3: night-count evidence from hotel OPTION SETS (no day-attached hotels)', () => {
  const itineraries = days(8);
  const quote: any = baseQuote({ nightCount: 1 }, itineraries, []);
  quote.quoteOptions = [
    {
      id: 'os1',
      kind: 'HOTEL_OPTION_SET',
      name: 'Amman',
      hotelOptions: [{ id: 'o1', city: 'Amman', hotelNameSnapshot: 'Amman Hotel', nights: 3, isPrimary: true }],
    },
    {
      id: 'os2',
      kind: 'HOTEL_OPTION_SET',
      name: 'Petra',
      hotelOptions: [{ id: 'o2', city: 'Petra', hotelNameSnapshot: 'Petra Hotel', nights: 4, isPrimary: true }],
    },
  ];
  const vm: any = mapQuoteToProposalV3(quote as any);
  assert.equal(vm.durationLabel, '8 Days / 7 Nights');
});

test('P.3X-3: English night pluralization (1 Night / 2 Nights)', () => {
  const one: any = mapQuoteToProposalV3(baseQuote({ nightCount: 1 }, days(2), [hotelItem('d1', 'Amman', 1)]) as any);
  assert.equal(one.durationLabel, '2 Days / 1 Night');
  const two: any = mapQuoteToProposalV3(baseQuote({ nightCount: 2 }, days(3), [hotelItem('d1', 'Amman', 2)]) as any);
  assert.equal(two.durationLabel, '3 Days / 2 Nights');
});
