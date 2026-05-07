import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getAvailableTransportPricingModesForSelection,
  getCanonicalPickerVehicleType,
  getCanonicalRateVehicleType,
} from './QuoteTransportPicker';

const activeDate = new Date('2026-05-07T12:00:00Z');
const route = {
  id: 'route-aqaba-petra',
  name: 'Aqaba -> Petra',
  fromPlaceId: 'aqaba',
  toPlaceId: 'petra',
  fromPlace: { id: 'aqaba', name: 'Aqaba', city: 'Aqaba', country: 'Jordan' },
  toPlace: { id: 'petra', name: 'Petra', city: 'Petra', country: 'Jordan' },
} as any;

function rate(vehicleName: string, pricingMode = 'Point-to-Point', overrides: Record<string, unknown> = {}) {
  return {
    id: `${vehicleName}-${pricingMode}`,
    vehicleId: `vehicle-${vehicleName}`,
    routeId: route.id,
    routeName: route.name,
    vehicleType: null,
    price: 100,
    currency: 'USD',
    active: true,
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    vehicle: { name: vehicleName, vehicleType: null },
    route,
    serviceType: { name: pricingMode, code: pricingMode.toUpperCase().replace(/[^A-Z0-9]+/g, '_') },
    ...overrides,
  } as any;
}

describe('QuoteTransportPicker transport pricing mode matching', () => {
  it('maps legacy coach rows to Coach pricing modes without exact vehicle id matching', () => {
    const modes = getAvailableTransportPricingModesForSelection({
      rates: [rate('Medium 30'), rate('Large 49', 'Full Day')],
      route,
      selectedCanonicalVehicleType: 'Coach',
      now: activeDate,
    });

    assert.deepEqual(modes, ['Point-to-Point', 'Full Day']);
    assert.equal(getCanonicalRateVehicleType(rate('Medium 30')), 'Coach');
    assert.equal(getCanonicalRateVehicleType(rate('Large 49')), 'Coach');
  });

  it('maps legacy Small 17 rows to Mini Bus pricing modes', () => {
    const modes = getAvailableTransportPricingModesForSelection({
      rates: [rate('Small 17', 'Half Day')],
      route,
      selectedCanonicalVehicleType: 'Mini Bus',
      now: activeDate,
    });

    assert.deepEqual(modes, ['Half Day']);
  });

  it('returns Aqaba to Petra coach modes when legacy route rows exist', () => {
    const selectedVehicle = { id: 'canonical-coach', name: 'Coach', vehicleType: 'Coach', maxPax: 49 } as any;
    const modes = getAvailableTransportPricingModesForSelection({
      rates: [rate('Large 49', 'Airport Transfer')],
      route,
      selectedCanonicalVehicleType: getCanonicalPickerVehicleType(selectedVehicle),
      now: activeDate,
    });

    assert.deepEqual(modes, ['Airport Transfer']);
  });

  it('excludes inactive and expired rates from pricing mode availability', () => {
    const modes = getAvailableTransportPricingModesForSelection({
      rates: [
        rate('Large 49', 'Full Day', { active: false }),
        rate('Medium 30', 'Half Day', { validTo: '2026-01-31' }),
      ],
      route,
      selectedCanonicalVehicleType: 'Coach',
      now: activeDate,
    });

    assert.deepEqual(modes, []);
  });
});
