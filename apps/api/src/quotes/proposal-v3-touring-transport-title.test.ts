import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase P.3X-2 — proposal-v3 touring transport day labels.
//
// Regression source: PDF Q-2026-0073 showed touring days titled "Airport Transfer"
// (the raw SupplierService name) because the transport line fell back to
// item.service.name when no client-safe route label was derivable. Touring days
// must read a safe generic title; only genuine airport transfers may surface an
// airport-bearing label.

const FORBIDDEN: Array<[string, RegExp]> = [
  ['ROUTE_TRANSFER', /ROUTE_TRANSFER/],
  ['FULL_DAY', /FULL_DAY/],
  ['DAILY_PACKAGE', /DAILY_PACKAGE/],
  ['Capacity unit', /Capacity unit/i],
  ['Sedan 2', /Sedan 2/],
  ['SUV 4', /SUV 4/],
];

function hotelItem(dayId: string, city: string) {
  return {
    id: `h-${dayId}`,
    itineraryId: dayId,
    service: { name: `${city} Hotel`, category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
    hotel: { name: `${city} Hotel`, city },
    roomCategory: { name: 'Standard Room' },
    occupancyType: 'DBL',
    mealPlan: 'BB',
    pricingBasis: 'PER_ROOM',
    totalCost: 100,
    totalSell: 120,
  };
}

// A touring-day transport item attached to the generic "Airport Transfer" service
// with NO parseable route path and no client-friendly routeName (the PDF bug case).
function touringTransportItem(dayId: string) {
  return {
    id: `t-${dayId}`,
    itineraryId: dayId,
    service: { name: 'Airport Transfer', category: 'Transport', serviceType: { name: 'Transport', code: 'TRANSPORT' } },
    appliedVehicleRate: { vehicle: { name: 'Sedan 2' }, serviceType: { name: 'Airport Transfer', code: 'TRANSFER' } },
    pricingDescription: 'Airport Transfer | Sedan 2 | ROUTE_TRANSFER | Capacity unit x 1',
    transportPricingMode: 'capacity_unit',
    totalCost: 50,
    totalSell: 60,
  };
}

// A genuine airport transfer with a client-friendly route name.
function airportTransferItem(dayId: string, routeName: string) {
  return {
    id: `air-${dayId}`,
    itineraryId: dayId,
    service: { name: 'Airport Transfer', category: 'Transport', serviceType: { name: 'Transport', code: 'TRANSPORT' } },
    appliedVehicleRate: { routeName, vehicle: { name: 'Sedan 2' }, serviceType: { name: 'Airport Transfer', code: 'TRANSFER' } },
    pricingDescription: `Airport Transfer | ${routeName} | Sedan 2 | ROUTE_TRANSFER`,
    transportPricingMode: 'capacity_unit',
    totalCost: 50,
    totalSell: 60,
  };
}

function baseQuote(items: any[], itineraries: any[]) {
  return {
    id: 'q-p3x2',
    quoteCurrency: 'USD',
    title: 'Jordan Private Journey',
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 7,
    adults: 2,
    children: 0,
    totalCost: 1000,
    totalSell: 1200,
    pricePerPax: 600,
    quoteOptions: [],
    itineraries,
    quoteItems: items,
  };
}

function transferTitles(vm: any): string[] {
  return (vm.days || [])
    .flatMap((d: any) => d.groups || [])
    .filter((g: any) => g.label === 'Transfer')
    .flatMap((g: any) => (g.items || []).map((it: any) => it.title || ''));
}

// All day-card item titles (group label is localized, so for non-EN locales we
// can't filter by the English "Transfer" group label).
function allItemTitles(vm: any): string[] {
  return (vm.days || [])
    .flatMap((d: any) => d.groups || [])
    .flatMap((g: any) => (g.items || []).map((it: any) => it.title || ''));
}

const TOURING_DAYS = [
  'Amman / Jerash / Amman',
  'Amman / Madaba / Mount Nebo / Petra',
  'Petra Visit / Wadi Rum',
  'Wadi Rum / Dead Sea',
  'Bethany / Dead Sea',
];

test('P.3X-2: non-airport touring days never title transport as "Airport Transfer"', () => {
  const itineraries = TOURING_DAYS.map((t, i) => ({ id: `d${i + 1}`, dayNumber: i + 1, title: `Day ${i + 1}: ${t}` }));
  const items = itineraries.map((d) => touringTransportItem(d.id));
  const vm: any = mapQuoteToProposalV3(baseQuote(items, itineraries) as any);
  const titles = transferTitles(vm);
  assert.ok(titles.length >= TOURING_DAYS.length, 'a transport line per touring day is present');
  for (const titleText of titles) {
    assert.ok(!/Airport Transfer/i.test(titleText), `touring transport title must not be "Airport Transfer" (got "${titleText}")`);
    assert.equal(titleText, 'Private touring transport', `touring day uses the safe generic title (got "${titleText}")`);
  }
});

test('P.3X-2: a genuine QAIA → Amman airport transfer still shows a client-safe airport label', () => {
  const itineraries = [{ id: 'd1', dayNumber: 1, title: 'Day 1: Arrival — Amman' }];
  const vm: any = mapQuoteToProposalV3(
    baseQuote([hotelItem('d1', 'Amman'), airportTransferItem('d1', 'QAIA to Amman')], itineraries) as any,
  );
  const titles = transferTitles(vm);
  assert.ok(titles.some((t) => /QAIA/.test(t)), `airport transfer keeps a QAIA-bearing route label (got ${JSON.stringify(titles)})`);
  assert.ok(!titles.some((t) => /^Airport Transfer$/i.test(t)), 'raw "Airport Transfer" is not used as the title');
});

test('P.3X-2: a Dead Sea → QAIA departure transfer shows a client-safe label', () => {
  const itineraries = [{ id: 'd1', dayNumber: 1, title: 'Day 1: Departure' }];
  const vm: any = mapQuoteToProposalV3(
    baseQuote([airportTransferItem('d1', 'Dead Sea to QAIA')], itineraries) as any,
  );
  const titles = transferTitles(vm);
  assert.ok(titles.some((t) => /QAIA|Dead Sea/.test(t)), `departure transfer keeps a client-safe route label (got ${JSON.stringify(titles)})`);
});

test('P.3X-2: a generic airport transfer with no route name falls back to "Private airport transfer"', () => {
  const itineraries = [{ id: 'd1', dayNumber: 1, title: 'Day 1: Arrival' }];
  const item: any = touringTransportItem('d1');
  item.transportLabel = 'QAIA → Amman'; // airport detected from the transport label, no client-friendly routeName
  const vm: any = mapQuoteToProposalV3(baseQuote([item], itineraries) as any);
  const titles = transferTitles(vm);
  assert.ok(titles.includes('Private airport transfer'), `generic airport transfer uses the safe airport title (got ${JSON.stringify(titles)})`);
});

test('P.3X-2: no transport metadata leaks anywhere in the view model', () => {
  const itineraries = TOURING_DAYS.map((t, i) => ({ id: `d${i + 1}`, dayNumber: i + 1, title: `Day ${i + 1}: ${t}` }));
  const items = itineraries.map((d) => touringTransportItem(d.id));
  const vm: any = mapQuoteToProposalV3(baseQuote(items, itineraries) as any);
  const text = JSON.stringify(vm);
  for (const [label, pattern] of FORBIDDEN) {
    assert.ok(!pattern.test(text), `client view must not contain "${label}"`);
  }
});

test('P.3X-2: localized touring-transport title (PT/ES/AR carry no raw English service name)', () => {
  const itineraries = [{ id: 'd1', dayNumber: 1, title: 'Day 1: Amman / Jerash / Amman' }];
  for (const [lang, expected] of [
    ['pt', 'Transporte turístico privado'],
    ['es', 'Transporte turístico privado'],
    ['ar', 'نقل سياحي خاص'],
  ] as Array<[string, string]>) {
    const vm: any = mapQuoteToProposalV3(baseQuote([touringTransportItem('d1')], itineraries) as any, lang);
    const titles = allItemTitles(vm);
    assert.ok(titles.includes(expected), `${lang} touring title is localized (got ${JSON.stringify(titles)})`);
    assert.ok(!titles.some((t) => /Airport Transfer/i.test(t)), `${lang}: no raw "Airport Transfer" title`);
  }
});
