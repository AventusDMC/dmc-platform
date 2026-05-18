import test = require('node:test');
import assert = require('node:assert/strict');
import { deriveTransportPricingMode, normalizeTransportPricingMode } from './transport-pricing-mode-normalization';

test('normalizes legacy full-day labels to the canonical daily full-day mode', () => {
  for (const label of ['Full Day', 'Day Tour', 'Full Day Tour']) {
    assert.equal(normalizeTransportPricingMode(label), 'Daily Full Day');
  }
});

test('normalizes legacy overnight labels with destination-specific canonical modes when possible', () => {
  assert.equal(normalizeTransportPricingMode('Driver Overnight'), 'Petra Overnight');
  assert.equal(normalizeTransportPricingMode('Overnight'), 'Petra Overnight');
  assert.equal(deriveTransportPricingMode({ routeName: 'Wadi Rum Driver Overnight', pricingMode: null }), 'Wadi Rum Overnight');
  assert.equal(deriveTransportPricingMode({ routeName: 'Aqaba Overnight', pricingMode: null }), 'Aqaba Overnight');
  assert.equal(deriveTransportPricingMode({ routeName: 'Petra Driver Overnight', pricingMode: null }), 'Petra Overnight');
});
