import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase N — the proposal investment/notes area must not carry the noisy
// "Child policy: No child policy available" fallback (it repeated once per
// hotel). A meaningful child policy must still render when present.

function quote(ratePolicies: any) {
  return {
    id: 'quote-1',
    quoteCurrency: 'USD',
    title: 'Jordan Explorer',
    createdAt: new Date('2026-04-27T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 1,
    adults: 2,
    children: 0,
    totalCost: 148,
    totalSell: 170.2,
    pricePerPax: 85.1,
    quoteOptions: [],
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Amman', description: 'Overnight in Amman.' }],
    quoteItems: [
      {
        id: 'hotel-1',
        itineraryId: 'day-1',
        service: { name: 'Corp Amman Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } },
        hotel: { name: 'Corp Amman Hotel', city: 'Amman' },
        roomCategory: { name: 'Premium Room' },
        occupancyType: 'DBL',
        mealPlan: 'BB',
        pricingBasis: 'PER_ROOM',
        ratePolicies,
        totalCost: 148,
        totalSell: 170.2,
      },
    ],
  };
}

test('no rate policies → the empty child-policy fallback is suppressed', () => {
  for (const rp of [undefined, null, [], [{ policyType: 'UNKNOWN' }]]) {
    const vm: any = mapQuoteToProposalV3(quote(rp) as any);
    const notes = vm.investment?.noteLines || [];
    assert.ok(!notes.includes('Child policy: No child policy available'), `fallback suppressed for ratePolicies=${JSON.stringify(rp)}`);
    assert.ok(!notes.some((l: string) => /No child policy available/i.test(l)), 'no variant of the fallback appears');
    // and the full view model carries none of it either
    assert.ok(!JSON.stringify(vm).includes('No child policy available'));
  }
});

test('a meaningful child policy still renders', () => {
  const vm: any = mapQuoteToProposalV3(quote([{ policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 }]) as any);
  const notes = vm.investment?.noteLines || [];
  assert.ok(notes.includes('Child policy: Children 0-5 free'), 'meaningful policy preserved');
});
