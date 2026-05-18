import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTransportPricingModeServiceTypeOptions,
  deriveTransportPricingMode,
  getOriginalTransportPricingModeAlias,
  normalizeTransportPricingMode,
  TRANSPORT_RATE_CARD_PRICING_MODES,
  TRANSPORT_PRICING_MODE_GROUPS,
} from './transport-pricing-modes';

describe('transport pricing mode dropdown options', () => {
  it('keeps rate-card pricing modes in canonical operational order', () => {
    assert.deepEqual(TRANSPORT_RATE_CARD_PRICING_MODES, [
      'Airport Transfer',
      'Point-to-Point',
      'Daily Full Day',
      'Half Day',
      'Stationary / Waiting',
      'Extra Hour',
      'Extra KM',
      'Petra Overnight',
      'Wadi Rum Overnight',
      'Aqaba Overnight',
    ]);
    assert.deepEqual(TRANSPORT_PRICING_MODE_GROUPS.map((group) => group.label), ['Movement', 'Touring', 'Operational Supplements']);
    assert.equal(TRANSPORT_RATE_CARD_PRICING_MODES.includes('Day Tour' as any), false);
    assert.equal(TRANSPORT_RATE_CARD_PRICING_MODES.includes('Full Day' as any), false);
  });

  it('dedupes legacy aliases into canonical selectable service types', () => {
    const options = buildTransportPricingModeServiceTypeOptions([
      { id: 'airport', name: 'Airport Transfer', code: 'AIRPORT_TRANSFER' },
      { id: 'point', name: 'Point-to-Point', code: 'POINT_TO_POINT' },
      { id: 'half', name: 'Half Day', code: 'HALF_DAY' },
      { id: 'full', name: 'Full Day', code: 'FULL_DAY' },
      { id: 'full-alias', name: 'Full Day (200 KM)', code: 'FULL_DAY_200_KM' },
      { id: 'day-tour', name: 'Day Tour', code: 'DAY_TOUR' },
      { id: 'stationary', name: 'Stationary / Waiting', code: 'STATIONARY_WAITING' },
      { id: 'hour', name: 'Extra Hour', code: 'EXTRA_HOUR' },
      { id: 'km', name: 'Extra KM', code: 'EXTRA_KM' },
      { id: 'petra', name: 'Driver Overnight outside Amman', code: 'DRIVER_OVERNIGHT' },
      { id: 'rum', name: 'Wadi Rum Overnight', code: 'WADI_RUM_OVERNIGHT' },
      { id: 'aqaba', name: 'Aqaba Overnight', code: 'AQABA_OVERNIGHT' },
    ]);

    assert.deepEqual(options.map((option) => option.mode), TRANSPORT_RATE_CARD_PRICING_MODES);
    assert.equal(options.find((option) => option.mode === 'Daily Full Day')?.serviceType.id, 'full');
    assert.equal(options.find((option) => option.mode === 'Petra Overnight')?.serviceType.id, 'petra');
    assert.equal(getOriginalTransportPricingModeAlias(options.find((option) => option.mode === 'Daily Full Day')?.serviceType.name), 'Full Day');
  });

  it('normalizes aliases and derives operational defaults without exposing legacy modes', () => {
    assert.equal(normalizeTransportPricingMode('Private Transfer'), 'Point-to-Point');
    assert.equal(normalizeTransportPricingMode('Transfer'), 'Point-to-Point');
    assert.equal(normalizeTransportPricingMode('Full Day Tour'), 'Daily Full Day');
    assert.equal(normalizeTransportPricingMode('Day Tour'), 'Daily Full Day');
    assert.equal(normalizeTransportPricingMode('Waiting'), 'Stationary / Waiting');
    assert.equal(normalizeTransportPricingMode('Wadi Rum Overnight'), 'Wadi Rum Overnight');

    assert.equal(deriveTransportPricingMode({ routeName: 'QAIA Airport -> Amman City' }), 'Airport Transfer');
    assert.equal(deriveTransportPricingMode({ routeName: 'Amman - Jerash - Ajloun - Amman Full Day' }), 'Daily Full Day');
    assert.equal(deriveTransportPricingMode({ routeName: 'Petra touring day' }), 'Daily Full Day');
    assert.equal(deriveTransportPricingMode({ routeName: 'Wadi Rum free day waiting' }), 'Stationary / Waiting');
    assert.equal(deriveTransportPricingMode({ routeName: 'Aqaba free day waiting' }), 'Stationary / Waiting');
  });
});
