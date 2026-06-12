import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveTransportFallbackLabel } from './transport-fallback-label';

// Emergency display hardening — a transport item with a route / service type but
// no vehicle rate and no operator label must show a safe route-based label, not
// the raw container SupplierService name (e.g. a mislabelled "Petra Overnight").
describe('deriveTransportFallbackLabel', () => {
  it('3. airport transfer with no vehicle rate / no transportLabel → route-based label', () => {
    const label = deriveTransportFallbackLabel({
      routeId: 'route-1',
      transportServiceTypeId: 'st-airport',
      transportLabel: null,
      appliedVehicleRate: null,
      pricingDescription: 'Airport Transfer | QAIA Airport → Amman | Sedan 2 | ROUTE_TRANSFER | Capacity unit x 1',
    });
    assert.equal(label, 'Airport Transfer — QAIA Airport → Amman');
    assert.ok(!/petra overnight/i.test(label || ''), 'never reads the container name');
  });

  it('4. bad-shaped item whose container is "Petra Overnight" still shows the safe route label', () => {
    // The fallback only uses route + service type — never the SupplierService name.
    const label = deriveTransportFallbackLabel({
      routeId: 'route-1',
      transportServiceTypeId: 'st-airport',
      pricingDescription: 'Airport Transfer | QAIA Airport → Amman | Sedan 2',
    });
    assert.equal(label, 'Airport Transfer — QAIA Airport → Amman');
  });

  it('uses the applied vehicle-rate route + service type when present', () => {
    const label = deriveTransportFallbackLabel({
      routeId: 'r',
      transportServiceTypeId: 's',
      appliedVehicleRate: {
        serviceType: { name: 'Point-to-Point' },
        route: { fromPlace: { name: 'Dead Sea' }, toPlace: { name: 'QAIA Airport' } },
      },
    });
    assert.equal(label, 'Point-to-Point — Dead Sea → QAIA Airport');
  });

  it('returns null for non-transport items (no route / service type) → caller keeps its fallback', () => {
    assert.equal(deriveTransportFallbackLabel({ pricingDescription: 'Mövenpick | Deluxe | DBL' }), null);
    assert.equal(deriveTransportFallbackLabel({}), null);
  });
});
