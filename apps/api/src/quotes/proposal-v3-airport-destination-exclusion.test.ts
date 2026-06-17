import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// P1 (proposal QA, Issue 3) — airports / transfer nodes (e.g. QAIA) are directional
// transfer ENDPOINTS, never trip DESTINATIONS. Regression source: PDF Q-2026-0079 listed
// "QAIA" as a destination in the cover subtitle + journey overview. These tests lock the
// airport OUT of the destination summary while keeping it IN the directional transfer row.

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

// Airport transfer with a CLEAN, client-friendly route name ("QAIA → Amman"), so the
// transfer ROW legitimately shows the airport endpoint.
function airportTransferItem(dayId: string) {
  return {
    id: `t-${dayId}`,
    itineraryId: dayId,
    service: { name: 'Airport Transfer', category: 'Transport', serviceType: { name: 'Transport', code: 'TRANSPORT' } },
    appliedVehicleRate: { routeName: 'QAIA → Amman', vehicle: { name: 'Sedan' }, serviceType: { name: 'Airport Transfer', code: 'TRANSFER' } },
    pricingDescription: 'Airport Transfer | QAIA → Amman',
    totalCost: 40,
    totalSell: 50,
  };
}

function quoteFixture() {
  return {
    id: 'q-airport',
    quoteCurrency: 'USD',
    title: 'Jordan Discovery',
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 4,
    adults: 2,
    children: 0,
    totalCost: 1000,
    totalSell: 1200,
    pricePerPax: 600,
    quoteOptions: [],
    itineraries: [
      { id: 'd1', dayNumber: 1, title: 'Day 1: Amman' },
      { id: 'd2', dayNumber: 2, title: 'Day 2: Amman' },
      { id: 'd3', dayNumber: 3, title: 'Day 3: Petra' },
      { id: 'd4', dayNumber: 4, title: 'Day 4: Wadi Rum' },
      { id: 'd5', dayNumber: 5, title: 'Day 5: Dead Sea' },
    ],
    quoteItems: [
      airportTransferItem('d1'),
      hotelItem('d1', 'Amman'),
      hotelItem('d3', 'Petra'),
      hotelItem('d4', 'Wadi Rum'),
      hotelItem('d5', 'Dead Sea'),
    ],
  };
}

test('Issue 3: QAIA / airport is excluded from the destination summary + cover subtitle', () => {
  const vm: any = mapQuoteToProposalV3(quoteFixture() as any);
  assert.doesNotMatch(vm.destinationLine, /qaia/i, 'destinationLine must not contain the airport');
  assert.doesNotMatch(vm.coverSubtitle, /qaia/i, 'coverSubtitle must not contain the airport');
  assert.doesNotMatch(vm.destinationLine, /airport/i, 'destinationLine must not contain "airport"');
});

test('Issue 3: real destinations are retained in the summary', () => {
  const vm: any = mapQuoteToProposalV3(quoteFixture() as any);
  for (const city of ['Amman', 'Petra', 'Wadi Rum', 'Dead Sea']) {
    assert.match(vm.destinationLine, new RegExp(city, 'i'), `destination "${city}" should remain`);
  }
});

test('Issue 3: QAIA still appears in the directional transfer row (not removed everywhere)', () => {
  const vm: any = mapQuoteToProposalV3(quoteFixture() as any);
  const daysText = JSON.stringify(vm.days);
  assert.match(daysText, /QAIA/i, 'the directional transfer row should still show the airport endpoint');
});
