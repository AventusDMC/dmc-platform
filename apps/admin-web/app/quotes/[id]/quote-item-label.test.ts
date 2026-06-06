import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isTouringRoutePackageItem,
  formatTouringRoutePackagePath,
  formatTouringRoutePackageLabel,
  resolveTouringRoutePackageLabel,
} from './quote-item-label';

describe('Phase 3D.2D.1 quote-item-label — touring-route package detection (pricing-independent)', () => {
  const danaRoute = { id: 'r', name: 'Amman -> Dana -> Petra ON', startCity: 'Amman', mainDestinations: ['Dana', 'Petra'] };

  it('package = touring route, NOT an excursion -> true (regardless of pricing-row hydration)', () => {
    // The 3D.2D.1 regression: the generated package has a touring route but its
    // pricing row may be absent from the hydrated card payload. It must still be
    // detected as a package (this is what previously fell back to "Airport
    // Transfer — From Amman").
    assert.equal(isTouringRoutePackageItem({ touringRoute: danaRoute }), true);
    assert.equal(isTouringRoutePackageItem({ touringRoute: danaRoute, overrideReason: null }), true);
  });

  it('touring-route EXCURSION -> false (kept, even when it carries a pricing row)', () => {
    // Excursions are identified by the excursion template, NOT by the pricing row
    // (they DO carry a touringRoutePricingId, so pricing can't discriminate).
    assert.equal(isTouringRoutePackageItem({ touringRoute: danaRoute, excursionTemplateId: 'tmpl-1' }), false);
    assert.equal(isTouringRoutePackageItem({ touringRoute: danaRoute, excursionTemplateComponentId: 'cmp-1' }), false);
    assert.equal(isTouringRoutePackageItem({ touringRoute: danaRoute, overrideReason: 'Excursion template: Petra Full Day' }), false);
  });

  it('true airport transfer / regular transfer / disposal (no touring route) -> false (unchanged)', () => {
    assert.equal(isTouringRoutePackageItem({ touringRoute: null }), false); // airport transfer
    assert.equal(isTouringRoutePackageItem({}), false); // disposal / regular transfer
    assert.equal(isTouringRoutePackageItem({ touringRoute: null, overrideReason: 'Excursion template: x' }), false);
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

describe('Phase 3D.2D.1 quote-item-label — resolveTouringRoutePackageLabel (shared admin entry point)', () => {
  const danaRoute = { id: 'r', name: 'Amman -> Dana -> Petra ON', startCity: 'Amman', mainDestinations: ['Dana', 'Petra'] };

  it('returns the route-aware label for a touring-route package', () => {
    assert.equal(resolveTouringRoutePackageLabel({ touringRoute: danaRoute }), 'Touring Route — Amman → Dana → Petra');
  });

  it('returns null for an excursion (caller keeps its existing label)', () => {
    assert.equal(resolveTouringRoutePackageLabel({ touringRoute: danaRoute, excursionTemplateId: 'tmpl-1' }), null);
    assert.equal(resolveTouringRoutePackageLabel({ touringRoute: danaRoute, overrideReason: 'Excursion template: Petra Full Day' }), null);
  });

  it('returns null for non-touring items (airport transfer / regular / disposal)', () => {
    assert.equal(resolveTouringRoutePackageLabel({ touringRoute: null }), null);
    assert.equal(resolveTouringRoutePackageLabel({}), null);
  });
});
