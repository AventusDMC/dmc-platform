import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// P2-1 (proposal QA, #4/#5/#6) — accommodation grouping + overnight-span behavior.
//
// Consecutive nights at the same hotel/room/meals group into one row with a day range +
// night count folded into the Day cell ("Day 05–07 · 3 nights" / "Día 05–07 · 3 noches").
// Free days inside a stay span inherit the overnight city; checkout/departure days and
// genuine no-hotel days show no overnight. Transport/activity/meal/guide are never
// accommodation. resolveProposalNightCount is unchanged.

type HotelOpts = { city: string; room?: string; meals?: string; nights?: number };
function hotelItem(dayId: string, name: string, opts: HotelOpts) {
  return {
    id: `h-${dayId}-${name}`.replace(/\s+/g, '-'),
    itineraryId: dayId,
    service: { name, category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
    hotel: { name, city: opts.city },
    roomCategory: { name: opts.room ?? 'Standard Room' },
    mealPlan: opts.meals ?? 'BB',
    nightCount: opts.nights ?? 1,
    totalCost: 100,
    totalSell: 120,
  };
}
function transportItem(dayId: string, routeName: string) {
  return {
    id: `t-${dayId}`,
    itineraryId: dayId,
    service: { name: 'Transfer', category: 'Transport', serviceType: { name: 'Transport', code: 'TRANSPORT' } },
    appliedVehicleRate: { routeName, vehicle: { name: 'Sedan' }, serviceType: { name: 'Transfer', code: 'TRANSFER' } },
    totalCost: 30,
    totalSell: 40,
  };
}
function activityItem(dayId: string, name: string) {
  return { id: `a-${dayId}`, itineraryId: dayId, activity: { name }, totalCost: 20, totalSell: 25 };
}
function mealItem(dayId: string) {
  return { id: `m-${dayId}`, itineraryId: dayId, service: { name: 'Dinner', category: 'Meal', serviceType: { name: 'Meal', code: 'MEAL' } }, totalCost: 10, totalSell: 12 };
}
function guideItem(dayId: string) {
  return { id: `g-${dayId}`, itineraryId: dayId, service: { name: 'Guide', category: 'Guide', serviceType: { name: 'Guide', code: 'GUIDE' } }, totalCost: 15, totalSell: 18 };
}

function quoteWith(days: Array<{ n: number; title: string }>, items: any[], extra: Record<string, unknown> = {}) {
  return {
    id: 'q-acc',
    quoteCurrency: 'USD',
    title: 'Jordan Discovery',
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 0,
    adults: 2,
    children: 0,
    totalCost: 1000,
    totalSell: 1200,
    pricePerPax: 600,
    quoteOptions: [],
    itineraries: days.map((d) => ({ id: `d${d.n}`, dayNumber: d.n, title: d.title })),
    quoteItems: items,
    ...extra,
  };
}

const overnightOf = (vm: any, n: number) => vm.days.find((d: any) => d.dayNumber === n)?.overnightLocation ?? null;

test('1. consecutive nights at the same hotel (single nightCount item) → one grouped row with range + count', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Dead Sea' }, { n: 2, title: 'Day 2: Dead Sea' }, { n: 3, title: 'Day 3: Dead Sea' }, { n: 4, title: 'Day 4: Departure' }],
      [hotelItem('d1', 'Dead Sea Spa', { city: 'Dead Sea', nights: 3 }), transportItem('d4', 'Dead Sea → QAIA')],
    ) as any,
  );
  assert.equal(vm.accommodationRows.length, 1, 'one grouped row');
  assert.equal(vm.accommodationRows[0].nights, 3);
  assert.match(vm.accommodationRows[0].dayLabel, /01.*03.*3 nights/, 'range + night count in Day cell');
  assert.equal(vm.accommodationRows[0].hotelName, 'Dead Sea Spa');
});

test('1b. consecutive single-night items at the same hotel → merged into one row', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Petra' }, { n: 2, title: 'Day 2: Petra' }, { n: 3, title: 'Day 3: Petra' }],
      [hotelItem('d1', 'Petra Moon', { city: 'Petra', nights: 1 }), hotelItem('d2', 'Petra Moon', { city: 'Petra', nights: 1 }), hotelItem('d3', 'Petra Moon', { city: 'Petra', nights: 1 })],
    ) as any,
  );
  assert.equal(vm.accommodationRows.length, 1, 'merged into one row');
  assert.equal(vm.accommodationRows[0].nights, 3);
  assert.match(vm.accommodationRows[0].dayLabel, /01.*03.*3 nights/);
});

test('2. hotel change across nights → separate rows', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Amman' }, { n: 2, title: 'Day 2: Petra' }],
      [hotelItem('d1', 'Amman Grand', { city: 'Amman', nights: 1 }), hotelItem('d2', 'Petra Moon', { city: 'Petra', nights: 1 })],
    ) as any,
  );
  assert.equal(vm.accommodationRows.length, 2);
  assert.deepEqual(vm.accommodationRows.map((r: any) => r.hotelName), ['Amman Grand', 'Petra Moon']);
});

test('3. same hotel but different room/meal mid-stay → split rows', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Amman' }, { n: 2, title: 'Day 2: Amman' }],
      [hotelItem('d1', 'Amman Grand', { city: 'Amman', room: 'Deluxe', meals: 'BB', nights: 1 }), hotelItem('d2', 'Amman Grand', { city: 'Amman', room: 'Suite', meals: 'HB', nights: 1 })],
    ) as any,
  );
  assert.equal(vm.accommodationRows.length, 2, 'room/meal change splits the stay');
  assert.deepEqual(vm.accommodationRows.map((r: any) => r.room), ['Deluxe', 'Suite']);
});

test('4. free day inside a stay span shows the overnight hotel/location', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Dead Sea' }, { n: 2, title: 'Day 2: Dead Sea Leisure' }, { n: 3, title: 'Day 3: Dead Sea Leisure' }, { n: 4, title: 'Day 4: Departure' }],
      [hotelItem('d1', 'Dead Sea Spa', { city: 'Dead Sea', nights: 3 }), activityItem('d2', 'Spa Day')],
    ) as any,
  );
  assert.equal(overnightOf(vm, 1), 'Dead Sea', 'check-in day');
  assert.equal(overnightOf(vm, 2), 'Dead Sea', 'free day inside span');
  assert.equal(overnightOf(vm, 3), 'Dead Sea', 'free day inside span (with activity)');
});

test('5. free day with no accommodation span → no overnight', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Amman' }, { n: 2, title: 'Day 2: Free' }],
      [hotelItem('d1', 'Amman Grand', { city: 'Amman', nights: 1 }), activityItem('d2', 'City Walk')],
    ) as any,
  );
  assert.equal(overnightOf(vm, 1), 'Amman');
  assert.equal(overnightOf(vm, 2), null, 'day 2 is outside any stay span → no overnight');
});

test('6. round-trip / no-hotel day → no overnight', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith([{ n: 1, title: 'Day 1: Amman / Jerash / Amman' }], [transportItem('d1', 'Amman → Jerash → Amman')]) as any,
  );
  assert.equal(overnightOf(vm, 1), null);
  assert.equal(vm.accommodationRows.length, 0);
});

test('7. transport / activity / meal / guide items are never treated as accommodation', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Amman' }],
      [transportItem('d1', 'QAIA → Amman'), activityItem('d1', 'Citadel'), mealItem('d1'), guideItem('d1')],
    ) as any,
  );
  assert.equal(vm.accommodationRows.length, 0, 'no accommodation rows from non-hotel services');
  assert.equal(overnightOf(vm, 1), null, 'no overnight invented from non-hotel services');
});

test('8. resolveProposalNightCount is unchanged (3-night stay still reads 3 nights in the duration)', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Dead Sea' }, { n: 2, title: 'Day 2: Dead Sea' }, { n: 3, title: 'Day 3: Dead Sea' }, { n: 4, title: 'Day 4: Departure' }],
      [hotelItem('d1', 'Dead Sea Spa', { city: 'Dead Sea', nights: 3 })],
    ) as any,
  );
  assert.match(vm.durationLabel, /3 nights/i, 'night count derivation still yields 3 nights');
});

test('9. single-hotel single-night fixture still produces one row', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith([{ n: 1, title: 'Day 1: Amman' }], [hotelItem('d1', 'Amman Grand', { city: 'Amman', nights: 1 })]) as any,
  );
  assert.equal(vm.accommodationRows.length, 1);
  assert.equal(vm.accommodationRows[0].nights, 1);
  assert.match(vm.accommodationRows[0].dayLabel, /Day 01 · 1 night/);
});

test('10. Spanish grouped label renders without English leak', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Dead Sea' }, { n: 2, title: 'Day 2: Dead Sea' }, { n: 3, title: 'Day 3: Dead Sea' }],
      [hotelItem('d1', 'Dead Sea Spa', { city: 'Dead Sea', nights: 3 })],
    ) as any,
    'es',
  );
  const label = vm.accommodationRows[0].dayLabel;
  assert.match(label, /Día 01–03 · 3 noches/, 'localized Spanish range + nights');
  assert.doesNotMatch(label, /\bDay\b|\bnights?\b/, 'no English leak in the Spanish day label');
});

test('11. checkout / departure day does not show an overnight', () => {
  const vm: any = mapQuoteToProposalV3(
    quoteWith(
      [{ n: 1, title: 'Day 1: Dead Sea' }, { n: 2, title: 'Day 2: Dead Sea' }, { n: 3, title: 'Day 3: Dead Sea' }, { n: 4, title: 'Day 4: Departure' }],
      [hotelItem('d1', 'Dead Sea Spa', { city: 'Dead Sea', nights: 3 }), transportItem('d4', 'Dead Sea → QAIA')],
    ) as any,
  );
  assert.equal(overnightOf(vm, 3), 'Dead Sea', 'last night shows overnight');
  assert.equal(overnightOf(vm, 4), null, 'checkout/departure day shows no overnight');
});
