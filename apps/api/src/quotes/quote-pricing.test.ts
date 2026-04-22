import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { resolveCurrentQuotePricing } from './quote-pricing';

test('returns matched group slab when pax is covered', () => {
  const result = resolveCurrentQuotePricing({
    pricingType: 'group',
    adults: 4,
    children: 0,
    pricingSlabs: [
      { minPax: 1, maxPax: 3, price: 100 },
      { minPax: 4, maxPax: 6, price: 90 },
    ],
  });

  assert.equal(result.isAvailable, true);
  assert.equal(result.value, 90);
  assert.equal(result.matchedSlab?.label, '4–6 guests');
  assert.equal(result.message, null);
});

test('returns safe unavailable result when group slab coverage is missing', () => {
  const result = resolveCurrentQuotePricing({
    pricingType: 'group',
    adults: 5,
    children: 0,
    pricingSlabs: [{ minPax: 1, maxPax: 4, price: 100 }],
  });

  assert.equal(result.isAvailable, false);
  assert.equal(result.value, null);
  assert.equal(result.matchedSlab, null);
  assert.equal(result.message, 'Price unavailable for selected passenger count.');
});

test('keeps simple pricing behavior unchanged', () => {
  const result = resolveCurrentQuotePricing({
    pricingType: 'simple',
    adults: 2,
    children: 1,
    totalSell: 450,
    pricePerPax: 150,
  });

  assert.equal(result.isAvailable, true);
  assert.equal(result.label, 'Price per person');
  assert.equal(result.value, 150);
  assert.equal(result.message, null);
});
