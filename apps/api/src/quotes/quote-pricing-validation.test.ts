import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { validatePricingSlabs } from './quote-pricing-validation';

test('detects overlapping slabs', () => {
  const errors = validatePricingSlabs([
    { minPax: 1, maxPax: 4, price: 100 },
    { minPax: 4, maxPax: 6, price: 90 },
  ]);

  assert.equal(errors.some((error) => error.code === 'OVERLAP'), true);
});

test('allows gaps in slab coverage when ranges do not overlap', () => {
  const errors = validatePricingSlabs([
    { minPax: 1, maxPax: 4, price: 100 },
    { minPax: 6, maxPax: 8, price: 90 },
  ]);

  assert.deepEqual(errors, []);
});

test('detects reversed min and max pax', () => {
  const errors = validatePricingSlabs([{ minPax: 5, maxPax: 4, price: 100 }]);

  assert.equal(errors.some((error) => error.code === 'REVERSED_RANGE'), true);
});

test('accepts valid continuous slabs', () => {
  const errors = validatePricingSlabs([
    { minPax: 1, maxPax: 4, price: 100 },
    { minPax: 5, maxPax: 8, price: 90 },
    { minPax: 9, maxPax: 12, price: 80 },
  ]);

  assert.deepEqual(errors, []);
});

test('accepts open-ended final slab', () => {
  const errors = validatePricingSlabs([
    { minPax: 1, maxPax: 4, price: 100 },
    { minPax: 5, maxPax: null, price: 90, focPax: 1 },
  ]);

  assert.deepEqual(errors, []);
});

test('rejects open-ended slab before the final row', () => {
  const errors = validatePricingSlabs([
    { minPax: 1, maxPax: null, price: 100 },
    { minPax: 5, maxPax: 8, price: 90 },
  ]);

  assert.equal(errors.some((error) => error.code === 'OPEN_ENDED_NOT_LAST'), true);
});

test('rejects foc equal to the slab group size floor', () => {
  const errors = validatePricingSlabs([{ minPax: 4, maxPax: 6, price: 100, focPax: 4 }]);

  assert.equal(errors.some((error) => error.code === 'INVALID_FOC'), true);
});
