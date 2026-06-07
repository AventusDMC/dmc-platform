import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase L — a PackageTemplate activity quote item is service-less (it links
// activity + activityRateVariant, not a SupplierService). Before the fix the
// proposal dropped it (isPresentQuoteItem required item.service) and would NPE
// on item.service.name. It must now render on its day under "Experience" with
// the title "<activity> — <variant>", without breaking other items.

function baseQuote(overrides: Record<string, any> = {}) {
  return {
    id: 'quote-1',
    quoteNumber: 'Q-2026-0001',
    quoteCurrency: 'USD',
    title: 'Jordan Explorer',
    createdAt: new Date('2026-04-27T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 5,
    adults: 2,
    children: 0,
    totalCost: 200,
    totalSell: 240,
    pricePerPax: 120,
    quoteOptions: [],
    itineraries: [{ id: 'day-5', dayNumber: 5, title: 'Day 5: Wadi Rum / Dead Sea', description: 'Wadi Rum then transfer to the Dead Sea.' }],
    quoteItems: [],
    ...overrides,
  };
}

function hotelItem() {
  return {
    id: 'hotel-1',
    itineraryId: 'day-5',
    service: { name: 'Dead Sea Spa Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
    hotel: { name: 'Dead Sea Spa Hotel', city: 'Dead Sea' },
    roomCategory: { name: 'Deluxe' },
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingBasis: 'PER_ROOM',
    totalCost: 148,
    totalSell: 170.2,
  };
}

// Service-less activity item, as produced by PackageTemplate apply.
function activityItem(overrides: Record<string, any> = {}) {
  return {
    id: 'act-1',
    itineraryId: 'day-5',
    service: null,
    activity: { name: 'Wadi Rum Jeep Tour' },
    activityRateVariant: { name: '2 Hours – Rum Area' },
    participantCount: 1,
    totalCost: 56.4,
    totalSell: 56.4,
    ...overrides,
  };
}

test('service-less activity renders on its day with "<activity> — <variant>" title', () => {
  const proposal = mapQuoteToProposalV3(baseQuote({ quoteItems: [hotelItem(), activityItem()] }) as any);
  const text = JSON.stringify(proposal);
  assert.match(text, /Wadi Rum Jeep Tour — 2 Hours – Rum Area/, 'activity card title present');
  assert.match(text, /Dead Sea Spa Hotel/, 'hotel still renders alongside');
});

test('activity is grouped under Experience on Day 5 (exactly once, no duplicate card)', () => {
  const proposal: any = mapQuoteToProposalV3(baseQuote({ quoteItems: [hotelItem(), activityItem()] }) as any);
  const days = proposal.days || proposal.itinerary || [];
  const day5 = days.find((d: any) => d.dayNumber === 5) || days[0];
  const groups = day5?.groups || day5?.dayGroups || [];
  const expGroup = groups.find((g: any) => g.label === 'Experience');
  assert.ok(expGroup, 'Day 5 has an Experience group');
  const jeepCards = expGroup.items.filter((it: any) => /Wadi Rum Jeep Tour/.test(it.title || ''));
  assert.equal(jeepCards.length, 1, 'exactly one Wadi Rum Jeep Tour card');
  assert.equal(jeepCards[0].title, 'Wadi Rum Jeep Tour — 2 Hours – Rum Area');
});

test('service-less item with NO activity is still excluded (no regression to the presence filter)', () => {
  const proposal = mapQuoteToProposalV3(baseQuote({ quoteItems: [hotelItem(), { id: 'ghost', itineraryId: 'day-5', service: null, totalCost: 0, totalSell: 0 }] }) as any);
  const text = JSON.stringify(proposal);
  assert.match(text, /Dead Sea Spa Hotel/);
  assert.doesNotMatch(text, /ghost/);
});

test('mapping does not throw when an activity item has no service', () => {
  assert.doesNotThrow(() => mapQuoteToProposalV3(baseQuote({ quoteItems: [activityItem()] }) as any));
});
