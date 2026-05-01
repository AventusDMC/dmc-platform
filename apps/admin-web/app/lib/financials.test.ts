import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateMarginPercent,
  calculateProfit,
  formatMarginPercent,
  getItemMarginWarning,
  getQuoteMarginWarning,
} from './financials';

describe('margin intelligence helpers', () => {
  it('calculates positive margin', () => {
    assert.equal(calculateProfit(125, 100), 25);
    assert.equal(calculateMarginPercent(125, 100), 20);
    assert.equal(formatMarginPercent(20), '20.00%');
  });

  it('returns zero margin when sell is zero', () => {
    assert.equal(calculateProfit(0, 100), -100);
    assert.equal(calculateMarginPercent(0, 100), 0);
  });

  it('calculates negative margin and loss warnings', () => {
    assert.equal(calculateProfit(80, 100), -20);
    assert.equal(calculateMarginPercent(80, 100), -25);
    assert.equal(getItemMarginWarning(80, 100), 'Loss');
    assert.equal(getQuoteMarginWarning(80, 100), 'Loss');
  });

  it('flags low item and quote margin thresholds', () => {
    assert.equal(getItemMarginWarning(100, 92), 'Low margin');
    assert.equal(getQuoteMarginWarning(100, 88), 'Low quote margin');
    assert.equal(getItemMarginWarning(100, 85), null);
  });

  it('supports transport item margin inputs', () => {
    const transportSell = 130;
    const transportCost = 100;

    assert.equal(calculateProfit(transportSell, transportCost), 30);
    assert.equal(calculateMarginPercent(transportSell, transportCost), 23.08);
  });

  it('supports external package margin inputs', () => {
    const externalPackageSell = 1200;
    const externalPackageCost = 900;

    assert.equal(calculateProfit(externalPackageSell, externalPackageCost), 300);
    assert.equal(calculateMarginPercent(externalPackageSell, externalPackageCost), 25);
  });
});
