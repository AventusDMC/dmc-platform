import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isTouringRoutePackageItem,
  formatTouringRoutePackagePath,
  formatTouringRoutePackageLabel,
} from './quote-item-label';

describe('Phase 3D.2D quote-item-label — touring-route package detection', () => {
  const danaRoute = { id: 'r', name: 'Amman -> Dana -> Petra ON', startCity: 'Amman', mainDestinations: ['Dana', 'Petra'] };

  it('package = touring route + pricing row -> true', () => {
    assert.equal(isTouringRoutePackageItem({ touringRoute: danaRoute, touringRoutePricingId: 'pr-1' }), true);
    assert.equal(isTouringRoutePackageItem({ touringRoute: danaRoute, touringRoutePricing: { id: 'pr-1' } }), true);
  });

  it('touring-route EXCURSION (route, no pricing row) -> false (keeps existing label)', () => {
    assert.equal(isTouringRoutePackageItem({ touringRoute: danaRoute, touringRoutePricingId: null }), false);
    assert.equal(isTouringRoutePackageItem({ touringRoute: danaRoute }), false);
  });

  it('true airport transfer / regular transfer / disposal (no touring route) -> false (unchanged)', () => {
    assert.equal(isTouringRoutePackageItem({ touringRoute: null, touringRoutePricingId: null }), false); // airport transfer
    assert.equal(isTouringRoutePackageItem({}), false); // disposal / regular transfer
    // even a stray pricing id without a route is not a package
    assert.equal(isTouringRoutePackageItem({ touringRoute: null, touringRoutePricingId: 'pr-x' }), false);
  });
});

describe('Phase 3D.2D quote-item-label — route-aware package label', () => {
  it('Amman -> Dana -> Petra package shows "Touring Route — Amman → Dana → Petra" (no Airport Transfer)', () => {
    const route = { id: 'r', name: 'Amman -> Dana -> Petra ON', startCity: 'Amman', mainDestinations: ['Dana', 'Petra'] };
    const label = formatTouringRoutePackageLabel(route);
    assert.equal(label, 'Touring Route — Amman → Dana → Petra');
    assert.doesNotMatch(label, /Airport Transfer/);
    assert.doesNotMatch(label, /From Amman/);
  });

  it('uses the clean → arrow and drops the return-to-start city from stops', () => {
    const route = {
      id: 'r', name: 'RT', startCity: 'Amman', mainDestinations: null,
      stops: [{ city: 'Amman' }, { city: 'Dana' }, { city: 'Petra' }, { city: 'Amman' }],
    };
    assert.equal(formatTouringRoutePackagePath(route), 'Amman → Dana → Petra');
  });

  it('Petra → Wadi Rum package', () => {
    const route = { id: 'r2', name: 'Petra -> Wadi Rum ON', startCity: 'Petra', mainDestinations: ['Wadi Rum'] };
    assert.equal(formatTouringRoutePackageLabel(route), 'Touring Route — Petra → Wadi Rum');
  });

  it('falls back to the route name when no start/destinations are available', () => {
    const route = { id: 'r3', name: 'Special Route', startCity: '', mainDestinations: [] };
    assert.equal(formatTouringRoutePackageLabel(route), 'Touring Route — Special Route');
  });

  it('prefers mainDestinations over stops', () => {
    const route = {
      id: 'r4', name: 'n', startCity: 'Amman', mainDestinations: ['Petra'],
      stops: [{ city: 'Amman' }, { city: 'Dana' }, { city: 'Petra' }],
    };
    assert.equal(formatTouringRoutePackagePath(route), 'Amman → Petra');
  });
});
