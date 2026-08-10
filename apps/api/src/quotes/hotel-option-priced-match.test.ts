import test = require('node:test');
import assert = require('node:assert/strict');
const { computeHotelOptionPricedMatch } = require('./hotel-option-priced-match');

// H-A1: pure hotel option → priced QuoteItem match metadata. The candidate pool is
// always the SAME option set's priced items. The matcher must never guess: undecidable
// rows return ambiguous/none so the UI keeps the Classic fallback. It reads NO cost.

// A fully-priced, contracted hotel item (the happy path candidate).
const item = (over: Record<string, unknown> = {}) => ({
  id: 'it1',
  optionId: 'set1',
  hotelId: 'hA',
  contractId: 'cA',
  roomCategoryId: 'rcDBL',
  mealPlan: 'HB',
  occupancyType: 'DOUBLE',
  seasonName: 'High',
  serviceDate: '2026-06-01',
  hotel: { name: 'Hotel Amman' },
  ...over,
});

test('one option + one matching hotel item → matched, id set, safe discriminators only', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA', roomCategoryId: 'rcDBL', hotelNameSnapshot: 'Hotel Amman', mealPlanCode: 'HB' },
    [item()],
  );
  assert.equal(res.pricingMatchStatus, 'matched');
  assert.equal(res.matchedPricedQuoteItemId, 'it1');
  assert.equal(res.pricingMatchReason, 'direct_option_item_match');
  // matchedDiscriminators is non-cost/non-PII only.
  assert.deepEqual(res.matchedDiscriminators, {
    roomCategoryId: 'rcDBL', mealPlan: 'HB', mealPlanCode: 'HB', occupancyType: 'DOUBLE',
    seasonName: 'High', serviceDate: '2026-06-01', optionId: 'set1',
  });
  // No cost/margin/rate/contract/hotel-object/PII keys leak into the result.
  const keys = new Set([...Object.keys(res), ...Object.keys(res.matchedDiscriminators)]);
  for (const forbidden of ['totalCost', 'totalSell', 'baseCost', 'margin', 'sellPrice', 'contract', 'hotel', 'rate', 'supplier', 'notes', 'price']) {
    assert.equal(keys.has(forbidden), false, `must not expose ${forbidden}`);
  }
});

test('same option set with multiple hotel items narrows by hotelId', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hB', roomCategoryId: null, hotelNameSnapshot: 'Hotel Petra' },
    [item(), item({ id: 'it2', hotelId: 'hB', hotel: { name: 'Hotel Petra' } })],
  );
  assert.equal(res.pricingMatchStatus, 'matched');
  assert.equal(res.matchedPricedQuoteItemId, 'it2');
});

test('same hotelId, distinct roomCategoryId resolves', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA', roomCategoryId: 'rcSGL' },
    [item({ id: 'itDbl', roomCategoryId: 'rcDBL' }), item({ id: 'itSgl', roomCategoryId: 'rcSGL' })],
  );
  assert.equal(res.matchedPricedQuoteItemId, 'itSgl');
  assert.equal(res.pricingMatchReason, 'narrowed_by_room_meal_occupancy_season_date');
});

test('same hotelId + roomCategory, distinct mealPlan resolves by mealPlanCode', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA', roomCategoryId: 'rcDBL', mealPlanCode: 'BB' },
    [item({ id: 'itHB', mealPlan: 'HB' }), item({ id: 'itBB', mealPlan: 'BB' })],
  );
  assert.equal(res.matchedPricedQuoteItemId, 'itBB');
  assert.equal(res.pricingMatchReason, 'narrowed_by_room_meal_occupancy_season_date');
});

test('distinct occupancyType alone does NOT resolve (row has no occupancy) → missing_discriminator', () => {
  // Two candidates identical except occupancyType; the row cannot supply occupancy,
  // so we must NOT guess — they differ on a row-absent field → missing_discriminator.
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA', roomCategoryId: 'rcDBL', mealPlanCode: 'HB' },
    [item({ id: 'itDbl', occupancyType: 'DOUBLE' }), item({ id: 'itTwin', occupancyType: 'TWIN' })],
  );
  assert.equal(res.pricingMatchStatus, 'ambiguous');
  assert.equal(res.matchedPricedQuoteItemId, null);
  assert.equal(res.pricingMatchReason, 'missing_discriminator');
});

test('distinct seasonName alone does NOT resolve (row has no season) → missing_discriminator', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA', roomCategoryId: 'rcDBL', mealPlanCode: 'HB' },
    [item({ id: 'itHi', seasonName: 'High' }), item({ id: 'itLo', seasonName: 'Low' })],
  );
  assert.equal(res.pricingMatchStatus, 'ambiguous');
  assert.equal(res.pricingMatchReason, 'missing_discriminator');
});

test('distinct serviceDate alone does NOT resolve (row has no date) → missing_discriminator', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA', roomCategoryId: 'rcDBL', mealPlanCode: 'HB' },
    [item({ id: 'itJun', serviceDate: '2026-06-01' }), item({ id: 'itJul', serviceDate: '2026-07-01' })],
  );
  assert.equal(res.pricingMatchStatus, 'ambiguous');
  assert.equal(res.pricingMatchReason, 'missing_discriminator');
});

test('true duplicate candidates (identical on every discriminator) → ambiguous_duplicate_candidates', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA', roomCategoryId: 'rcDBL', mealPlanCode: 'HB' },
    [item({ id: 'itA' }), item({ id: 'itB' })],
  );
  assert.equal(res.pricingMatchStatus, 'ambiguous');
  assert.equal(res.pricingMatchReason, 'ambiguous_duplicate_candidates');
  assert.equal(res.matchedPricedQuoteItemId, null);
});

test('no hotelId and no name → ambiguous / missing_discriminator (never guess)', () => {
  const res = computeHotelOptionPricedMatch({ hotelId: null, hotelNameSnapshot: null }, [item(), item({ id: 'it2' })]);
  assert.equal(res.pricingMatchStatus, 'ambiguous');
  assert.equal(res.pricingMatchReason, 'missing_discriminator');
});

test('name fallback used only when hotelId absent and unique', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: null, hotelNameSnapshot: 'Hotel Amman' },
    [item(), item({ id: 'it2', hotelId: 'hB', hotel: { name: 'Hotel Petra' } })],
  );
  assert.equal(res.pricingMatchStatus, 'matched');
  assert.equal(res.matchedPricedQuoteItemId, 'it1');
});

test('duplicate names, no hotelId → ambiguous (no name-only guess)', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: null, hotelNameSnapshot: 'Hotel Amman' },
    [item({ id: 'itA' }), item({ id: 'itB' })],
  );
  assert.equal(res.pricingMatchStatus, 'ambiguous');
  assert.equal(res.matchedPricedQuoteItemId, null);
});

test('row hotelId present but no candidate carries it → none / no_priced_item_for_option (no name fallback)', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hZ', hotelNameSnapshot: 'Hotel Amman' },
    [item()],
  );
  assert.equal(res.pricingMatchStatus, 'none');
  assert.equal(res.pricingMatchReason, 'no_priced_item_for_option');
});

test('no candidate items at all → none / no_priced_item_for_option', () => {
  const res = computeHotelOptionPricedMatch({ hotelId: 'hA' }, []);
  assert.equal(res.pricingMatchStatus, 'none');
  assert.equal(res.pricingMatchReason, 'no_priced_item_for_option');
});

test('non-hotel items in the pool are ignored (filtered by hotelId presence)', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA' },
    [{ id: 'meal1', hotelId: null }, item()],
  );
  assert.equal(res.pricingMatchStatus, 'matched');
  assert.equal(res.matchedPricedQuoteItemId, 'it1');
});

test('single match but candidate has NO linked contract → none / no_contract_linked (keep fallback)', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA', roomCategoryId: 'rcDBL' },
    [item({ contractId: null })],
  );
  assert.equal(res.pricingMatchStatus, 'none');
  assert.equal(res.pricingMatchReason, 'no_contract_linked');
  assert.equal(res.matchedPricedQuoteItemId, null);
  assert.equal(res.matchedDiscriminators, undefined);
});

test('serviceDate given as a Date is normalized to a day string in discriminators', () => {
  const res = computeHotelOptionPricedMatch(
    { hotelId: 'hA', roomCategoryId: 'rcDBL' },
    [item({ serviceDate: new Date('2026-06-01T22:00:00.000Z') })],
  );
  assert.equal(res.matchedPricedQuoteItemId, 'it1');
  assert.equal(res.matchedDiscriminators.serviceDate, '2026-06-01');
});

test('pure: does not mutate its inputs', () => {
  const row = { hotelId: 'hA', roomCategoryId: 'rcDBL' };
  const items = [item()];
  const snapshotRow = JSON.stringify(row);
  const snapshotItems = JSON.stringify(items);
  computeHotelOptionPricedMatch(row, items);
  assert.equal(JSON.stringify(row), snapshotRow);
  assert.equal(JSON.stringify(items), snapshotItems);
});
