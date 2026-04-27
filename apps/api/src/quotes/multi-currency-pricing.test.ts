import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateMultiCurrencyQuoteItemPricing } from './multi-currency-pricing';

function createInput(overrides?: Partial<Parameters<typeof calculateMultiCurrencyQuoteItemPricing>[0]>) {
  return {
    supplierPricing: {
      costBaseAmount: 100,
      costCurrency: 'USD',
      salesTaxPercent: 0,
      salesTaxIncluded: false,
      serviceChargePercent: 0,
      serviceChargeIncluded: false,
      tourismFeeAmount: 0,
      tourismFeeCurrency: 'USD',
      tourismFeeMode: null,
      ...(overrides?.supplierPricing || {}),
    },
    pricingUnits: {
      pricingUnits: 1,
      roomCount: 1,
      nightCount: 1,
      paxCount: 1,
      ...(overrides?.pricingUnits || {}),
    },
    quoteCurrency: 'USD',
    markupPercent: 0,
    legacyPricing: null,
    ...overrides,
  };
}

test('handles tax included without increasing subtotal', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'USD',
        salesTaxPercent: 16,
        salesTaxIncluded: true,
      },
    }),
  );

  assert.equal(result.supplierCostTotal, 100);
  assert.equal(result.totalCost, 100);
});

test('handles tax excluded by increasing subtotal', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'USD',
        salesTaxPercent: 16,
        salesTaxIncluded: false,
      },
    }),
  );

  assert.equal(result.supplierCostTotal, 116);
  assert.equal(result.totalCost, 116);
});

test('handles service charge included without increasing subtotal', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'USD',
        serviceChargePercent: 10,
        serviceChargeIncluded: true,
      },
    }),
  );

  assert.equal(result.supplierCostTotal, 100);
  assert.equal(result.totalCost, 100);
});

test('handles service charge excluded by increasing subtotal', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'USD',
        serviceChargePercent: 10,
        serviceChargeIncluded: false,
      },
    }),
  );

  assert.equal(result.supplierCostTotal, 110);
  assert.equal(result.totalCost, 110);
});

test('tax-exclusive rate adds VAT and service charge exactly once and sell total follows calculated cost', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'USD',
        salesTaxPercent: 16,
        salesTaxIncluded: false,
        serviceChargePercent: 10,
        serviceChargeIncluded: false,
      },
      markupPercent: 25,
    }),
  );

  assert.equal(result.supplierCostTotal, 127.6);
  assert.equal(result.totalCost, 127.6);
  assert.equal(result.totalSell, 159.5);
});

test('decimal VAT, service charge, and markup round once at quote total level', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 99.99,
        costCurrency: 'USD',
        salesTaxPercent: 16.25,
        salesTaxIncluded: false,
        serviceChargePercent: 7.5,
        serviceChargeIncluded: false,
      },
      markupPercent: 12.345,
    }),
  );

  assert.equal(result.supplierCostTotal, 124.96);
  assert.equal(result.totalCost, 124.96);
  assert.equal(result.totalSell, 140.39);
});

test('missing or invalid tax fields use the current neutral fallback instead of changing totals', () => {
  const missing = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'USD',
        salesTaxPercent: null,
        serviceChargePercent: null,
      },
    }),
  );
  const invalid = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'USD',
        salesTaxPercent: Number.NaN,
        serviceChargePercent: -10,
      },
    }),
  );

  assert.equal(missing.totalCost, 100);
  assert.equal(invalid.totalCost, 100);
});

test('applies tourism fee per night per person', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'USD',
        tourismFeeAmount: 5,
        tourismFeeCurrency: 'USD',
        tourismFeeMode: 'PER_NIGHT_PER_PERSON',
      },
      pricingUnits: {
        pricingUnits: 1,
        nightCount: 3,
        paxCount: 2,
        roomCount: 1,
      },
    }),
  );

  assert.equal(result.supplierCostTotal, 100);
  assert.equal(result.totalCost, 130);
});

test('applies tourism fee per night per room', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'USD',
        tourismFeeAmount: 5,
        tourismFeeCurrency: 'USD',
        tourismFeeMode: 'PER_NIGHT_PER_ROOM',
      },
      pricingUnits: {
        pricingUnits: 1,
        nightCount: 3,
        paxCount: 2,
        roomCount: 2,
      },
    }),
  );

  assert.equal(result.totalCost, 130);
});

test('supports hotel per room per night pricing by multiplying pricing units', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 40,
        costCurrency: 'USD',
      },
      pricingUnits: {
        pricingUnits: 6,
        roomCount: 2,
        nightCount: 3,
        paxCount: 2,
      },
    }),
  );

  assert.equal(result.supplierCostTotal, 240);
  assert.equal(result.totalCost, 240);
});

test('supports hotel per person per night pricing by multiplying pricing units', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 35,
        costCurrency: 'USD',
      },
      pricingUnits: {
        pricingUnits: 6,
        roomCount: 1,
        nightCount: 3,
        paxCount: 2,
      },
    }),
  );

  assert.equal(result.supplierCostTotal, 210);
  assert.equal(result.totalCost, 210);
});

test('stores FX snapshot when converting supplier cost currency into quote currency', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'EUR',
      },
      quoteCurrency: 'USD',
    }),
  );

  assert.equal(result.totalCost, 108);
  assert.equal(result.quoteCurrency, 'USD');
  assert.equal(result.fxFromCurrency, 'EUR');
  assert.equal(result.fxToCurrency, 'USD');
  assert.equal(result.fxRate, 1.08);
  assert.ok(result.fxRateDate instanceof Date);
});

test('quote pricing keeps totals in quote currency and flags mixed supplier currency with FX fields', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 100,
        costCurrency: 'JOD',
      },
      quoteCurrency: 'EUR',
      markupPercent: 20,
    }),
  );

  assert.equal(result.quoteCurrency, 'EUR');
  assert.equal(result.totalCost, 130.56);
  assert.equal(result.totalSell, 156.67);
  assert.equal(result.fxFromCurrency, 'JOD');
  assert.equal(result.fxToCurrency, 'EUR');
  assert.equal(result.fxRate, Number((1.41 / 1.08).toFixed(6)));
});

test('quote pricing rejects invalid quote or supplier currency codes clearly', () => {
  assert.throws(
    () =>
      calculateMultiCurrencyQuoteItemPricing(
        createInput({
          quoteCurrency: 'GBP',
        }),
      ),
    /quoteCurrency must be one of USD, EUR, or JOD/,
  );
  assert.throws(
    () =>
      calculateMultiCurrencyQuoteItemPricing(
        createInput({
          supplierPricing: {
            costBaseAmount: 100,
            costCurrency: 'AED',
          },
        }),
      ),
    /costCurrency must be one of USD, EUR, or JOD/,
  );
});

test('falls back to legacy pricing when structured pricing is missing', () => {
  const result = calculateMultiCurrencyQuoteItemPricing(
    createInput({
      supplierPricing: {
        costBaseAmount: 0,
        costCurrency: 'USD',
      },
      legacyPricing: {
        totalCost: 320,
        totalSell: 400,
        currency: 'USD',
      },
    }),
  );

  assert.equal(result.totalCost, 320);
  assert.equal(result.totalSell, 400);
  assert.equal(result.fxRate, null);
});
