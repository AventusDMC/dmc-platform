import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { ProposalV3Service } from './proposal-v3.service';

// Phase P — client-facing label polish:
//  - internal transport program label "Jordan Program" never becomes a client title
//  - transport descriptions show the uniform client-safe sentence (no pricing/vehicle/program leak)
//  - genuine route-like names ("QAIA to Petra") are still kept as titles
//  - guide "Overnight: No" / pipe-delimited descriptor is dropped
//  - the accommodation table's last column is "Meals" (not "Notes")

function baseQuote(items: any[]) {
  return {
    id: 'q-1',
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
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', description: 'Overnight in Amman.' }],
    quoteItems: items,
  };
}

const hotelItem = {
  id: 'hotel-1',
  itineraryId: 'day-1',
  service: { name: 'Corp Amman Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
  hotel: { name: 'Corp Amman Hotel', city: 'Amman' },
  roomCategory: { name: 'Premium Room' },
  occupancyType: 'DBL',
  mealPlan: 'BB',
  pricingBasis: 'PER_ROOM',
  totalCost: 100,
  totalSell: 120,
};

function transportItem(routeName: string, vrTypeName: string) {
  return {
    id: `t-${routeName}`,
    itineraryId: 'day-1',
    service: { name: 'Jordan Private Transfer Service', category: 'Transport', serviceType: { name: 'Transport', code: 'TRANSPORT' } },
    appliedVehicleRate: { routeName, vehicle: { name: 'Sedan 2' }, serviceType: { name: vrTypeName, code: 'TRANSFER' } },
    pricingDescription: `${vrTypeName} | ${routeName} | Sedan 2`,
    totalCost: 50,
    totalSell: 60,
  };
}

const guideItem = {
  id: 'g-1',
  itineraryId: 'day-1',
  service: { name: 'Licensed Jordan Guide Service', category: 'Guiding', serviceType: { name: 'Guide', code: 'GUIDE' } },
  pricingDescription: 'Guide | Local | Full day | Overnight: No',
  totalCost: 80,
  totalSell: 96,
};

function dayItems(vm: any) {
  return (vm.days || []).flatMap((d: any) => (d.groups || []).flatMap((g: any) => g.items || []));
}

test('the internal "Jordan Program" transport label never reaches the client', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([hotelItem, transportItem('Jordan Program', 'Daily Full Day')]) as any);
  const text = JSON.stringify(vm);
  assert.ok(!/Jordan Program/.test(text), 'no "Jordan Program" anywhere in the view model');
  assert.ok(!/Sedan 2/.test(text), 'no vehicle class leak');
  assert.ok(!/Daily Full Day/.test(text), 'no pricing-mode leak');
  // the transport item still renders, with a client-safe title + description
  const items = dayItems(vm);
  const transport = items.find((it: any) => /transfer|transport/i.test(it.title || ''));
  assert.ok(transport, 'transport line still present');
  assert.equal(transport.description, 'Private touring transport as scheduled.');
});

test('a genuine route-like transport name ("QAIA to Petra") is still used as the client title', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([hotelItem, transportItem('QAIA to Petra', 'Point-to-Point')]) as any);
  const text = JSON.stringify(vm);
  assert.ok(/QAIA to Petra/.test(text), 'route-like title preserved');
  assert.ok(!/Point-to-Point/.test(text), 'no pricing-mode leak');
});

test('the guide "Overnight: No" descriptor is dropped (title preserved)', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([hotelItem, guideItem]) as any);
  const text = JSON.stringify(vm);
  assert.ok(!/Overnight:\s*No/i.test(text), 'no "Overnight: No"');
  assert.ok(!/Guide \| Local/i.test(text), 'no pipe descriptor leak');
  const items = dayItems(vm);
  const guide = items.find((it: any) => /guide/i.test(it.title || ''));
  assert.ok(guide, 'guide line still present');
  assert.ok(!guide.description || !/Overnight|\|/.test(guide.description), 'guide description carries no internal descriptor');
});

test('the accommodation table column is "Meals", not "Notes", and shows the meal plan', async () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([hotelItem]) as any);
  const service = new ProposalV3Service({} as any);
  const html = await (service as any).renderHtml(vm);
  assert.match(html, /<th>Meals<\/th>/, 'last column header is Meals');
  assert.doesNotMatch(html, /<th>Notes<\/th>/, 'no Notes column header');
  assert.match(html, /<td>BB<\/td>/, 'meal plan rendered in the Meals column');
});
