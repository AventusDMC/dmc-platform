import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTransportPricingModeServiceTypeOptions,
  TRANSPORT_RATE_CARD_PRICING_MODES,
} from './transport-pricing-modes';

describe('transport pricing mode dropdown options', () => {
  it('keeps rate-card pricing modes in the operational order without duplicate Full Day rows', () => {
    assert.deepEqual(TRANSPORT_RATE_CARD_PRICING_MODES, [
      'Airport Transfer',
      'Point-to-Point',
      'Half Day',
      'Full Day',
      'Day Tour',
      'Stationary / Waiting',
      'Extra Hour',
      'Extra KM',
    ]);
    assert.equal(TRANSPORT_RATE_CARD_PRICING_MODES.filter((mode) => mode === 'Full Day').length, 1);
  });

  it('dedupes legacy Full Day aliases and preserves Day Tour as a selectable service type', () => {
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
    ]);

    assert.deepEqual(options.map((option) => option.mode), TRANSPORT_RATE_CARD_PRICING_MODES);
    assert.equal(options.find((option) => option.mode === 'Full Day')?.serviceType.id, 'full');
    assert.equal(options.find((option) => option.mode === 'Day Tour')?.serviceType.id, 'day-tour');
  });
});
