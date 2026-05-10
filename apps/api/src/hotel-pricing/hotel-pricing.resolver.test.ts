import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { HotelPricingResolver } from './hotel-pricing.resolver';

const resolver = new HotelPricingResolver();

test('PER_ROOM_NIGHT prices rooms by night', () => {
  const result = resolver.resolve({
    pax: 20,
    rooms: 10,
    nights: 1,
    rates: [{ amount: 90, basis: 'PER_ROOM_NIGHT' }],
  });

  assert.equal(result.totalCost, 900);
});

test('PER_PERSON_NIGHT prices pax by night', () => {
  const result = resolver.resolve({
    pax: 21,
    rooms: 10,
    nights: 1,
    rates: [{ amount: 45, basis: 'PER_PERSON_NIGHT' }],
  });

  assert.equal(result.totalCost, 945);
});

test('PER_PERSON_NIGHT plus derived HB supplement prices both by pax night', () => {
  const result = resolver.resolve({
    pax: 21,
    rooms: 10,
    nights: 1,
    selectedMealPlan: 'HB',
    baseMealPlan: 'BB',
    rates: [{ amount: 45, basis: 'PER_PERSON_NIGHT', mealPlan: 'BB' }],
    supplements: [{ type: 'EXTRA_DINNER', amount: 10, basis: 'PER_PERSON_NIGHT', isActive: true }],
  });

  assert.equal(result.baseCost, 945);
  assert.equal(result.supplementCost, 210);
  assert.equal(result.totalCost, 1155);
});

test('PER_ROOM_NIGHT plus HB per-person supplement keeps independent bases', () => {
  const result = resolver.resolve({
    pax: 21,
    rooms: 11,
    nights: 1,
    selectedMealPlan: 'HB',
    baseMealPlan: 'BB',
    rates: [{ amount: 90, basis: 'PER_ROOM_NIGHT', mealPlan: 'BB' }],
    supplements: [{ type: 'EXTRA_DINNER', amount: 10, basis: 'PER_PERSON_NIGHT', isActive: true }],
  });

  assert.equal(result.baseCost, 990);
  assert.equal(result.supplementCost, 210);
  assert.equal(result.totalCost, 1200);
});

test('direct HB rate does not add optional HB supplement again', () => {
  const result = resolver.resolve({
    pax: 21,
    rooms: 10,
    nights: 1,
    selectedMealPlan: 'HB',
    baseMealPlan: 'HB',
    rates: [{ amount: 55, basis: 'PER_PERSON_NIGHT', mealPlan: 'HB' }],
    supplements: [{ type: 'EXTRA_DINNER', amount: 10, basis: 'PER_PERSON_NIGHT', isActive: true }],
  });

  assert.equal(result.totalCost, 1155);
  assert.equal(result.supplementCost, 0);
});

test('single supplement on DBL prices double sharing pax and single pax uplift', () => {
  const result = resolver.resolve({
    pax: 21,
    rooms: 11,
    nights: 1,
    selectedMealPlan: 'HB',
    baseMealPlan: 'BB',
    roomAllocation: {
      doubleSharingPax: 20,
      singlePax: 1,
      singleRooms: 1,
    },
    rates: [
      { amount: 45, basis: 'PER_PERSON_IN_DBL_NIGHT', label: 'DBL per person' },
      { amount: 65, basis: 'SINGLE_SUPPLEMENT_ON_DBL', label: 'Single on DBL plus supplement' },
    ],
    supplements: [{ type: 'EXTRA_DINNER', amount: 10, basis: 'PER_PERSON_NIGHT', isActive: true }],
  });

  assert.equal(result.baseCost, 965);
  assert.equal(result.supplementCost, 210);
  assert.equal(result.totalCost, 1175);
});

test('single direct room rate can combine with DBL per-person basis', () => {
  const result = resolver.resolve({
    pax: 11,
    rooms: 6,
    nights: 1,
    roomAllocation: {
      doubleSharingPax: 10,
      singleRooms: 1,
      singlePax: 1,
    },
    rates: [
      { amount: 45, basis: 'PER_PERSON_IN_DBL_NIGHT' },
      { amount: 80, basis: 'SINGLE_ROOM_NIGHT' },
    ],
  });

  assert.equal(result.totalCost, 530);
});

test('persists resolver sell/profit/margin from total cost', () => {
  const result = resolver.resolve({
    pax: 21,
    rooms: 10,
    nights: 1,
    markupPercent: 20,
    rates: [{ amount: 45, basis: 'PER_PERSON_NIGHT' }],
    supplements: [{ type: 'GALA_DINNER', amount: 10, basis: 'PER_PERSON_NIGHT', isMandatory: true, isActive: true }],
  });

  assert.equal(result.totalCost, 1155);
  assert.equal(result.totalSell, 1386);
  assert.equal(result.profit, 231);
  assert.equal(result.margin, 16.67);
});
