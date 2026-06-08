import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase M — the client-facing Accommodation section must not expose internal
// rate-contract/agreement names. Client-safe fields are hotel name, room
// category, meal plan, and city. The contract stays on the QuoteItem (admin).

function quoteWith(contractName: string) {
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
        contract: { name: contractName },
        totalCost: 148,
        totalSell: 170.2,
      },
    ],
  };
}

const LEAKY = ['TRAVEL AGENT AGREEMENT 2026', 'Travel Agent Contracted Rates 2026/27', '2026 contract', 'Contractual Agreement for Petra Moon Hotel 2026'];

for (const contractName of LEAKY) {
  test(`accommodation row drops the internal contract name: "${contractName}"`, () => {
    const proposal: any = mapQuoteToProposalV3(quoteWith(contractName) as any);
    const rows = proposal.accommodationRows || [];
    assert.ok(rows.length >= 1, 'has an accommodation row');
    const row = rows[0];
    // client-safe fields preserved
    assert.equal(row.hotelName, 'Corp Amman Hotel');
    assert.equal(row.room, 'Premium Room');
    assert.equal(row.meals, 'BB');
    assert.equal(row.location, 'Amman');
    // contract name not surfaced
    assert.equal(row.note, null, 'note must not carry the contract name');
    // and it must not leak anywhere in the rendered view model
    const text = JSON.stringify(proposal);
    assert.ok(!text.includes(contractName), `proposal must not contain "${contractName}"`);
    assert.doesNotMatch(text, /AGREEMENT/i, 'no AGREEMENT text');
    assert.doesNotMatch(text, /Contracted Rates/i, 'no "Contracted Rates" text');
  });
}

test('hotel still renders with its client-safe identity (name/room/meal/city)', () => {
  const proposal: any = mapQuoteToProposalV3(quoteWith('TRAVEL AGENT AGREEMENT 2026') as any);
  const text = JSON.stringify(proposal);
  assert.match(text, /Corp Amman Hotel/);
  assert.match(text, /Premium Room/);
  assert.match(text, /Amman/);
});
