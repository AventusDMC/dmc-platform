import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3, parseTransportRouteSegments } from './proposal-v3.mapper';

// Phase P.3X-1 — proposal-v3 route-anchor / transport-metadata sanitization.
//
// Regression source: PDF Q-2026-0073 leaked raw transport metadata into the
// client-facing cover title / journey overview / route summary, e.g.
//   "Airport Transfer | QAIA → Amman | Sedan 2 | ROUTE_TRANSFER | Capacity unit x 1"
// because buildRouteIntelligence parsed the raw pricingDescription into route
// anchors (cleanText turns " | " into ", ", so the arrow sat inside a longer
// chain and the trailing vehicle/classification/pricing fragments were taken as
// the destination). These tests lock the fragments out while keeping real cities.

const POLLUTED_DESCRIPTION =
  'Airport Transfer | QAIA → Amman | Sedan 2 | ROUTE_TRANSFER | Capacity unit x 1';

// Tokens that must never reach client-facing proposal text.
const FORBIDDEN: Array<[string, RegExp]> = [
  ['Sedan 2', /Sedan 2/],
  ['SUV 4', /SUV 4/],
  ['Mini Van', /Mini Van/i],
  ['Van 9', /Van 9/],
  ['Coaster', /Coaster/i],
  ['ROUTE_TRANSFER', /ROUTE_TRANSFER/],
  ['POINT_TO_POINT', /POINT_TO_POINT/],
  ['FULL_DAY', /FULL_DAY/],
  ['DAILY_PACKAGE', /DAILY_PACKAGE/],
  ['ADD_ON', /ADD_ON/],
  ['Capacity unit', /Capacity unit/i],
  ['pricing mode', /pricing mode/i],
  ['PER_VEHICLE', /PER_VEHICLE/],
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

// A per-day route transport item whose appliedVehicleRate has NO routeName, so
// buildRouteIntelligence falls back to the raw pricingDescription (the leak path).
function pollutedTransportItem(dayId: string) {
  return {
    id: `t-${dayId}`,
    itineraryId: dayId,
    service: { name: 'Airport Transfer', category: 'Transport', serviceType: { name: 'Transport', code: 'TRANSPORT' } },
    appliedVehicleRate: { vehicle: { name: 'Sedan 2' }, serviceType: { name: 'Airport Transfer', code: 'TRANSFER' } },
    pricingDescription: POLLUTED_DESCRIPTION,
    transportPricingMode: 'capacity_unit',
    totalCost: 50,
    totalSell: 60,
  };
}

// Weak title ("Multi currency QA quote" → stripped to empty by cleanText) forces
// buildProposalDocumentTitle to fall back to the destination line, so the cover
// title is built from route anchors — exactly where the leak surfaced.
function quoteFixture() {
  return {
    id: 'q-p3x1',
    quoteCurrency: 'USD',
    title: 'Multi currency QA quote',
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 7,
    adults: 2,
    children: 0,
    totalCost: 1000,
    totalSell: 1200,
    pricePerPax: 600,
    quoteOptions: [],
    itineraries: [
      { id: 'd1', dayNumber: 1, title: 'Day 1: Amman' },
      { id: 'd2', dayNumber: 2, title: 'Day 2: Amman / Jerash / Amman' },
      { id: 'd3', dayNumber: 3, title: 'Day 3: Petra' },
      { id: 'd4', dayNumber: 4, title: 'Day 4: Wadi Rum' },
      { id: 'd5', dayNumber: 5, title: 'Day 5: Dead Sea' },
    ],
    quoteItems: [
      hotelItem('d1', 'Amman'),
      hotelItem('d3', 'Petra'),
      hotelItem('d4', 'Wadi Rum'),
      hotelItem('d5', 'Dead Sea'),
      pollutedTransportItem('d2'),
    ],
  };
}

test('P.3X-1: parseTransportRouteSegments extracts only the clean endpoints from a polluted descriptor', () => {
  // "Airport Transfer, QAIA → Amman, Sedan 2, ROUTE_TRANSFER, Capacity unit x 1"
  // → endpoints adjacent to the arrow only.
  assert.deepEqual(parseTransportRouteSegments(POLLUTED_DESCRIPTION), [{ from: 'QAIA', to: 'Amman' }]);
});

test('P.3X-1: a clean route name is parsed unchanged (no regression)', () => {
  assert.deepEqual(parseTransportRouteSegments('QAIA to Petra'), [{ from: 'QAIA', to: 'Petra' }]);
  assert.deepEqual(parseTransportRouteSegments('Petra → Wadi Rum'), [{ from: 'Petra', to: 'Wadi Rum' }]);
});

test('P.3X-1: a descriptor that is ONLY internal metadata yields no anchors', () => {
  assert.deepEqual(parseTransportRouteSegments('Daily Full Day | Sedan 2 | FULL_DAY'), []);
});

test('P.3X-1: no transport metadata leaks anywhere in the rendered view model', () => {
  const vm: any = mapQuoteToProposalV3(quoteFixture() as any);
  const text = JSON.stringify(vm);
  for (const [label, pattern] of FORBIDDEN) {
    assert.ok(!pattern.test(text), `client view must not contain "${label}"`);
  }
});

test('P.3X-1: cover title / subtitle / journey summary are free of transport metadata', () => {
  const vm: any = mapQuoteToProposalV3(quoteFixture() as any);
  const clientHeaderText = [
    vm.documentTitle,
    vm.metaTitle,
    vm.coverSubtitle,
    vm.subtitle,
    vm.coverIntro,
    vm.journeySummary,
    vm.dayByDayIntro,
    vm.accommodationStory,
  ]
    .filter(Boolean)
    .join('  ');
  for (const [label, pattern] of FORBIDDEN) {
    assert.ok(!pattern.test(clientHeaderText), `client header/summary must not contain "${label}"`);
  }
  assert.ok(vm.documentTitle && vm.documentTitle.trim().length > 0, 'document title is non-empty');
});

test('P.3X-1: real client destinations are retained', () => {
  const vm: any = mapQuoteToProposalV3(quoteFixture() as any);
  const text = JSON.stringify(vm);
  for (const city of ['Amman', 'Petra', 'Wadi Rum', 'Dead Sea']) {
    assert.ok(new RegExp(city).test(text), `destination "${city}" should still be present`);
  }
});
