import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotePricingService } from './quote-pricing.service';

const service = new QuotePricingService();

test('validatePricingConfig allows non-overlapping slab gaps', () => {
  const result = service.validatePricingConfig({
    mode: 'group',
    pricingSlabs: [
      { minPax: 1, maxPax: 4, price: 100 },
      { minPax: 6, maxPax: 8, price: 90 },
    ],
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(result.errors, []);
});

test('resolveApplicableSlab returns missing_coverage when no slab matches requested pax', () => {
  const result = service.resolveApplicableSlab({
    mode: 'group',
    requestedPax: 5,
    pricingSlabs: [{ minPax: 1, maxPax: 4, price: 100 }],
  });

  assert.equal(result.status, 'missing_coverage');
  assert.equal(result.matchedSlab, null);
  assert.deepEqual(result.warnings, ['Price unavailable for selected passenger count.']);
});

test('calculateFoc resolves ratio-based complimentary guests', () => {
  const result = service.calculateFoc({
    adults: 10,
    children: 0,
    focType: 'ratio',
    focRatio: 5,
    focRoomType: 'double',
  });

  assert.equal(result.resolvedFocCount, 2);
  assert.equal(result.note?.includes('complimentary place'), true);
});

test('calculateFoc resolves fixed complimentary guests', () => {
  const result = service.calculateFoc({
    adults: 12,
    children: 0,
    focType: 'fixed',
    focCount: 2,
    focRoomType: 'single',
  });

  assert.equal(result.resolvedFocCount, 2);
  assert.equal(result.focType, 'fixed');
});

test('calculateFoc returns no complimentary guests when disabled', () => {
  const result = service.calculateFoc({
    adults: 12,
    children: 0,
    focType: 'none',
  });

  assert.equal(result.resolvedFocCount, 0);
  assert.equal(result.focType, 'none');
});

test('computePriceResult returns unified group pricing contract with fixed foc support', () => {
  const result = service.computePriceResult({
    pricingMode: 'SLAB',
    pricingType: 'group',
    pricingSlabs: [
      { minPax: 1, maxPax: 4, price: 100, actualPax: 1, focPax: 0, payingPax: 1, totalCost: 60, totalSell: 100, pricePerPayingPax: 100, pricePerActualPax: 100 },
      { minPax: 5, maxPax: 8, price: 90, actualPax: 5, focPax: 1, payingPax: 4, totalCost: 300, totalSell: 360, pricePerPayingPax: 90, pricePerActualPax: 72 },
    ],
    adults: 5,
    children: 0,
    totalCost: 300,
    totalSell: 360,
    pricePerPax: 90,
    singleSupplement: 25,
    focType: 'fixed',
    focCount: 1,
    focRoomType: 'single',
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.display.summaryLabel, 'Group pricing');
  assert.equal(result.display.slabLines?.length, 2);
  assert.deepEqual(result.display.contextLines?.slice(0, 2), [
    'Based on 5–8 guests + 1 FOC bracket',
    'Selected group size: 5 actual pax, 1 FOC, 4 paying pax',
  ]);
  assert.equal(result.display.slabLines?.[0]?.isSelected, false);
  assert.equal(result.display.slabLines?.[1]?.isSelected, true);
  assert.equal(result.display.singleSupplementText?.includes('Single supplement'), true);
  assert.equal(result.totals?.pricePerPayingPax, 90);
  assert.equal(result.totals?.pricePerActualPax, 72);
  assert.equal(result.totals?.focCount, 1);
  assert.equal(result.totals?.payingPax, 4);
  assert.equal(result.totals?.totalSell, 360);
});

test('computePriceResult returns fixed price contract when pricingMode is FIXED', () => {
  const result = service.computePriceResult({
    pricingMode: 'FIXED',
    pricingType: 'simple',
    adults: 4,
    children: 0,
    totalSell: 800,
    pricePerPax: 200,
    fixedPricePerPerson: 185,
    singleSupplement: 30,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.display.summaryLabel, 'Fixed price');
  assert.equal(result.totals?.pricePerPayingPax, 185);
  assert.equal(result.totals?.totalPrice, 740);
});
