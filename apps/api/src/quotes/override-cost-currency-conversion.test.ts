/**
 * Phase 3D.1H — tests for the overrideCost cross-currency conversion fix.
 *
 * Root cause: when useOverride=true the raw overrideCost (e.g. JOD 100) was used
 * directly as the "finalCost" before markup, bypassing the FX conversion that
 * calculateMultiCurrencyQuoteItemPricing performs. Result: JOD 100 × 1.2 = USD 120
 * instead of the correct USD 141 × 1.2 = USD 169.20.
 *
 * The fix: convertCurrency(overrideCost, supplierCostCurrency, quoteCurrency) before
 * applying markup. Same-currency pairs are a no-op.
 *
 * These tests verify the exported convertCurrency helper directly, then verify the
 * system FX rate constants for the three pilot examples.  The integration path
 * (quotes.service.ts createItem) is exercised in quote-pricing-scenarios.test.ts.
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { convertCurrency, isSupportedCurrency } from './multi-currency-pricing';

// System FX rates (from multi-currency-pricing.ts FX_TO_USD):
//   USD: 1, EUR: 1.08, JOD: 1.41, ILS: 0.27
// These constants are intentionally duplicated here so the test breaks if the
// rates change unexpectedly — a forcing function to update the tests AND the
// operator pricing documentation together.
const JOD_TO_USD = 1.41;
const EUR_TO_USD = 1.08;
const ILS_TO_USD = 0.27;

function roundMoney(v: number) {
  return Number(v.toFixed(2));
}

describe('convertCurrency — same-currency pairs (must be no-op)', () => {
  test('USD → USD: 100 stays 100', () => {
    const { amount, fxRate } = convertCurrency(100, 'USD', 'USD');
    assert.equal(amount, 100);
    assert.equal(fxRate, null, 'no FX rate for same-currency conversion');
  });

  test('JOD → JOD: 100 stays 100', () => {
    const { amount, fxRate } = convertCurrency(100, 'JOD', 'JOD');
    assert.equal(amount, 100);
    assert.equal(fxRate, null);
  });
});

describe('convertCurrency — JOD → USD (pilot routes)', () => {
  // Ajloun & Jerash Mini Van 5: baseCost 100 JOD
  test('100 JOD → USD at system rate (1.41)', () => {
    const { amount } = convertCurrency(100, 'JOD', 'USD');
    assert.equal(amount, roundMoney(100 * JOD_TO_USD)); // 141.00
  });

  // Amman → Dana → Petra ON: baseCost 70 JOD
  test('70 JOD → USD at system rate', () => {
    const { amount } = convertCurrency(70, 'JOD', 'USD');
    assert.equal(amount, roundMoney(70 * JOD_TO_USD)); // 98.70
  });

  // Petra → Wadi Rum ON: baseCost 145 JOD
  test('145 JOD → USD at system rate', () => {
    const { amount } = convertCurrency(145, 'JOD', 'USD');
    assert.equal(amount, roundMoney(145 * JOD_TO_USD)); // 204.45
  });
});

describe('sell price after 20% markup on converted cost (pilot examples)', () => {
  // Pre-fix (WRONG): cost treated as USD → 100 × 1.2 = 120
  // Post-fix (CORRECT): cost converted first → 141 × 1.2 = 169.20
  test('Ajloun: 100 JOD → USD, then 20% markup', () => {
    const convertedCost = convertCurrency(100, 'JOD', 'USD').amount;
    const sell = roundMoney(convertedCost * 1.2);
    assert.equal(convertedCost, 141.00);
    assert.equal(sell, 169.20);
    assert.notEqual(sell, 120.00, 'old wrong value must no longer appear');
  });

  test('Dana → Petra: 70 JOD → USD, then 20% markup', () => {
    const convertedCost = convertCurrency(70, 'JOD', 'USD').amount;
    const sell = roundMoney(convertedCost * 1.2);
    assert.equal(convertedCost, 98.70);
    assert.equal(sell, roundMoney(98.70 * 1.2)); // 118.44
    assert.notEqual(sell, 84.00, 'old wrong value must no longer appear');
  });

  test('Petra → Wadi Rum: 145 JOD → USD, then 20% markup', () => {
    const convertedCost = convertCurrency(145, 'JOD', 'USD').amount;
    const sell = roundMoney(convertedCost * 1.2);
    assert.equal(convertedCost, 204.45);
    assert.equal(sell, roundMoney(204.45 * 1.2)); // 245.34
    assert.notEqual(sell, 174.00, 'old wrong value must no longer appear');
  });
});

describe('convertCurrency — USD cost on USD quote (must be unchanged)', () => {
  test('100 USD at 20% markup → sell 120 USD', () => {
    const { amount } = convertCurrency(100, 'USD', 'USD');
    assert.equal(amount, 100); // no conversion
    assert.equal(roundMoney(amount * 1.2), 120.00);
  });
});

describe('convertCurrency — JOD cost on JOD quote (must be unchanged)', () => {
  test('100 JOD on JOD quote at 20% markup → sell 120 JOD', () => {
    const { amount } = convertCurrency(100, 'JOD', 'JOD');
    assert.equal(amount, 100); // no conversion
    assert.equal(roundMoney(amount * 1.2), 120.00);
  });
});

describe('isSupportedCurrency', () => {
  test('USD, JOD, EUR, ILS are all supported', () => {
    assert.equal(isSupportedCurrency('USD'), true);
    assert.equal(isSupportedCurrency('JOD'), true);
    assert.equal(isSupportedCurrency('EUR'), true);
    assert.equal(isSupportedCurrency('ILS'), true);
  });

  test('case-insensitive', () => {
    assert.equal(isSupportedCurrency('usd'), true);
    assert.equal(isSupportedCurrency('jod'), true);
  });

  test('unknown currencies are not supported', () => {
    assert.equal(isSupportedCurrency('GBP'), false);
    assert.equal(isSupportedCurrency('AED'), false);
    assert.equal(isSupportedCurrency(null), false);
    assert.equal(isSupportedCurrency(undefined), false);
    assert.equal(isSupportedCurrency(''), false);
  });
});
