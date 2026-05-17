import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getAvailableTransportPricingModesForSelection,
  getCanonicalPickerVehicleType,
  getCanonicalRateVehicleType,
  getQuoteTransportPersistedCostPreview,
  getQuoteTransportRateBillableDays,
  getTransportPricingModeOptionLabel,
  formatVehicleOptionLabel,
  getRankedVehicles,
  transportRateMatchesSelectedRoute,
} from './QuoteTransportPicker';
import { normalizeTransportRouteText } from '../../lib/transport-routes';

const activeDate = new Date('2026-05-07T12:00:00Z');
const route = {
  id: 'route-aqaba-petra',
  name: 'Aqaba -> Petra',
  fromPlaceId: 'aqaba',
  toPlaceId: 'petra',
  fromPlace: { id: 'aqaba', name: 'Aqaba', city: 'Aqaba', country: 'Jordan' },
  toPlace: { id: 'petra', name: 'Petra', city: 'Petra', country: 'Jordan' },
} as any;
const ammanRoute = {
  id: 'route-amman-amman',
  name: 'Amman -> Amman',
  fromPlaceId: 'amman-from',
  toPlaceId: 'amman-to',
  fromPlace: { id: 'amman-from', name: 'Amman', city: 'Amman', country: 'Jordan' },
  toPlace: { id: 'amman-to', name: 'Amman', city: 'Amman', country: 'Jordan' },
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

  it('formats picker vehicles with canonical type, pax, and supplier label', () => {
    const examples = [
      [{ name: 'Medium 30', maxPax: 30 }, 'Coach · 30 pax — Medium 30'],
      [{ name: 'Large 49', maxPax: 49 }, 'Coach · 49 pax — Large 49'],
      [{ name: 'Small 17', maxPax: 17 }, 'Mini Bus · 17 pax — Small 17'],
      [{ name: 'Van VIP 9', maxPax: 9 }, 'Van · 9 pax — Van VIP 9'],
    ] as const;

    for (const [vehicle, expected] of examples) {
      assert.equal(formatVehicleOptionLabel({ vehicle, group: 'Available', isRecommended: false, isTooSmall: false } as any, []), expected);
    }
  });

  it('suggests every overlapping Jordan vehicle capacity match without blocking override choices', () => {
    const ranked = getRankedVehicles(
      [
        { id: 'sedan', name: 'Sedan', maxPax: 2 },
        { id: 'mini-van', name: 'Mini Van', maxPax: 6 },
        { id: 'van', name: 'Van', maxPax: 9 },
        { id: 'coaster', name: 'Toyota Coaster', maxPax: 17 },
        { id: 'medium-bus', name: 'Medium Bus', maxPax: 29 },
        { id: 'large-bus', name: 'Large Bus', maxPax: 48 },
        { id: 'large-bus-x', name: 'Large Bus X', maxPax: 51 },
      ] as any,
      9,
    );

    assert.deepEqual(
      ranked.filter((entry) => entry.isRecommended).map((entry) => entry.vehicle.id),
      ['van', 'coaster'],
    );
    assert.equal(ranked.find((entry) => entry.vehicle.id === 'sedan')?.isTooSmall, true);
    assert.match(formatVehicleOptionLabel(ranked.find((entry) => entry.vehicle.id === 'sedan') as any, []), /Manual override/);
  });

  it('previews Full Day costs as a daily rate with editable billable days', () => {
    const fullDayRate = rate('Medium 30', 'Full Day', {
      price: 509,
      maxPax: 30,
      vehicle: { name: 'Medium 30', vehicleType: null, maxPax: 30 },
      serviceType: { name: 'Full Day', code: 'FULL_DAY', classification: 'FULL_DAY' },
    });

    assert.equal(getQuoteTransportRateBillableDays(fullDayRate, 1), 1);
    assert.equal(getQuoteTransportPersistedCostPreview(fullDayRate, 21, 1), 509);
    assert.equal(getQuoteTransportPersistedCostPreview(fullDayRate, 21, 2), 1018);
  });

  it('previews transfer costs without Full Day minimums and applies capacity units when pax exceeds one vehicle', () => {
    const transferRate = rate('Medium 30', 'Point-to-Point', {
      price: 120,
      maxPax: 30,
      vehicle: { name: 'Medium 30', vehicleType: null, maxPax: 30 },
      serviceType: { name: 'Point-to-Point', code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER' },
    });

    assert.equal(getQuoteTransportRateBillableDays(transferRate, 1), 1);
    assert.equal(getQuoteTransportPersistedCostPreview(transferRate, 31, 1), 240);
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

  it('keeps Day Tour as a disposal pricing mode for matching, not a point-to-point fallback', () => {
    const modes = getAvailableTransportPricingModesForSelection({
      rates: [rate('Small 17', 'Day Tour', { serviceType: { name: 'Day Tour', code: 'DAY_TOUR', classification: 'FULL_DAY' } })],
      route,
      selectedCanonicalVehicleType: 'Mini Bus',
      now: activeDate,
    });

    assert.deepEqual(modes, ['Day Tour']);
  });

  it('shows Full Day disposal modes for Amman service-area rows when Half Day and Stationary are exact route rows', () => {
    const modes = getAvailableTransportPricingModesForSelection({
      rates: [
        rate('Alpha Medium Coach 30 Pax', 'Half Day', { id: 'half-exact', routeId: ammanRoute.id, routeName: ammanRoute.name, route: ammanRoute, maxPax: 30 }),
        rate('Alpha Medium Coach 30 Pax', 'Stationary / Waiting', { id: 'stationary-exact', routeId: ammanRoute.id, routeName: ammanRoute.name, route: ammanRoute, maxPax: 30 }),
        rate('Medium 30', 'Full Day', {
          id: 'full-service-area',
          routeId: null,
          routeName: 'Jordan Program',
          route: null,
          maxPax: 30,
          serviceType: { name: 'Full Day', code: 'FULL_DAY', classification: 'FULL_DAY' },
        }),
      ],
      route: ammanRoute,
      selectedCanonicalVehicleType: 'Coach',
      requestedPax: 30,
      now: activeDate,
    });

    assert.ok(modes.includes('Full Day'));
    assert.ok(modes.includes('Half Day'));
    assert.ok(modes.includes('Stationary / Waiting'));
  });

  it('normalizes daily package full-day disposal rows and labels the minimum rule', () => {
    const dailyPackageFullDay = rate('Medium 30', 'Daily FD rate minimum 3 full days', {
      id: 'full-daily-package',
      routeId: null,
      routeName: 'Amman City',
      route: null,
      maxPax: 30,
      serviceType: { name: 'Daily FD rate minimum 3 full days', code: 'DAILY_FD', classification: 'DAILY_PACKAGE' },
    });
    const rates = [
      rate('Alpha Medium Coach 30 Pax', 'Half Day', { id: 'half-amman-city', routeId: ammanRoute.id, routeName: ammanRoute.name, route: ammanRoute, maxPax: 30 }),
      rate('Alpha Medium Coach 30 Pax', 'Stationary / Waiting', { id: 'stationary-amman-city', routeId: ammanRoute.id, routeName: ammanRoute.name, route: ammanRoute, maxPax: 30 }),
      dailyPackageFullDay,
    ];

    const modes = getAvailableTransportPricingModesForSelection({
      rates,
      route: ammanRoute,
      selectedCanonicalVehicleType: 'Coach',
      requestedPax: 30,
      now: activeDate,
    });

    assert.ok(modes.includes('Full Day'));
    assert.ok(modes.includes('Half Day'));
    assert.ok(modes.includes('Stationary / Waiting'));
    assert.equal(
      getTransportPricingModeOptionLabel({
        mode: 'Full Day',
        rates,
        route: ammanRoute,
        selectedCanonicalVehicleType: 'Coach',
        requestedPax: 30,
        now: activeDate,
      }),
      'Full Day - minimum 3 days',
    );
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

  it('matches equivalent route labels with arrows, hyphens, slashes, and to', () => {
    const selectedRoute = {
      ...route,
      id: 'route-petra-amman-selected',
      name: 'Petra -> Amman',
      fromPlaceId: 'petra',
      toPlaceId: 'amman',
      fromPlace: { id: 'petra', name: 'Petra', city: 'Petra', country: 'Jordan' },
      toPlace: { id: 'amman', name: 'Amman', city: 'Amman', country: 'Jordan' },
    } as any;
    const routeLabels = ['Petra to Amman', 'Petra - Amman', 'Petra / Amman', 'Petra -> Amman', 'Petra to Amman (1 day)'];

    for (const routeName of routeLabels) {
      assert.equal(
        transportRateMatchesSelectedRoute(rate('Medium 30', 'Point-to-Point', { routeId: 'legacy-route-id', routeName, route: null }), selectedRoute),
        true,
      );
    }

    assert.equal(new Set(routeLabels.map(normalizeTransportRouteText)).size, 1);
    assert.equal(normalizeTransportRouteText('Petra → Amman'), 'petra_amman');
  });

  it('matches selected route label to supplier rows with duration suffixes', () => {
    const selectedRoute = {
      ...route,
      name: 'Aqaba South Border -> Petra',
      fromPlace: { id: 'aqaba-border', name: 'Aqaba South Border', city: 'Aqaba', country: 'Jordan' },
      toPlace: { id: 'petra', name: 'Petra', city: 'Petra', country: 'Jordan' },
    } as any;

    assert.equal(
      transportRateMatchesSelectedRoute(
        rate('Large 49', 'Point-to-Point', { routeId: 'legacy-route-id', routeName: 'Aqaba South Border -> Petra (1 day)', route: null }),
        selectedRoute,
      ),
      true,
    );
  });

  it('keeps exact route id matching first even when labels differ', () => {
    assert.equal(
      transportRateMatchesSelectedRoute(rate('Large 49', 'Point-to-Point', { routeId: route.id, routeName: 'Different route label', route: null }), route),
      true,
    );
  });

  it('rejects non-matching route labels', () => {
    const selectedRoute = {
      ...route,
      id: 'route-petra-amman-selected',
      name: 'Petra -> Amman',
      fromPlaceId: 'petra',
      toPlaceId: 'amman',
      fromPlace: { id: 'petra', name: 'Petra', city: 'Petra', country: 'Jordan' },
      toPlace: { id: 'amman', name: 'Amman', city: 'Amman', country: 'Jordan' },
    } as any;

    assert.equal(
      transportRateMatchesSelectedRoute(rate('Medium 30', 'Point-to-Point', { routeId: 'legacy-route-id', routeName: 'Amman to Aqaba', route: null }), selectedRoute),
      false,
    );
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
