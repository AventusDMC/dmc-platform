import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { buildPricingDiagnostics } from './[id]/pricing-diagnostics';

const quoteItemCardSource = readFileSync(new URL('./[id]/QuoteItemCard.tsx', import.meta.url), 'utf8');
const quoteServicePlannerSource = readFileSync(new URL('./[id]/QuoteServicePlanner.tsx', import.meta.url), 'utf8');

describe('pricing diagnostics', () => {
  it('reports latest ServiceRate pricing with capacity units', () => {
    const diagnostics = buildPricingDiagnostics({
      paxCount: 7,
      quantity: 1,
      markupPercent: 20,
      service: {
        name: 'Airport assistance',
        category: 'service',
        unitType: 'PER_GROUP',
        serviceRates: [
          {
            id: 'rate-1',
            pricingMode: 'PER_GROUP',
            maxPaxPerUnit: 3,
          },
        ],
      },
    });

    assert.equal(diagnostics.pricingSource, 'ServiceRate');
    assert.equal(diagnostics.pricingMode, 'PER GROUP');
    assert.equal(diagnostics.unitsUsed, '3 units for 7 pax');
    assert.equal(diagnostics.fallbackStatus, 'Structured service rate');
    assert.equal(diagnostics.overrideStatus, 'Markup 20%');
  });

  it('reports transport rate diagnostics without changing pricing totals', () => {
    const diagnostics = buildPricingDiagnostics({
      quantity: 2,
      pricingDescription: 'Capacity unit pricing',
      appliedVehicleRate: {
        routeName: 'Amman to Petra',
        vehicle: { name: 'Sprinter' },
        serviceType: { name: 'Transfer', code: 'TRANSFER' },
      },
      service: {
        name: 'Transfer',
        category: 'transport',
        unitType: 'PER_GROUP',
      },
    });

    assert.equal(diagnostics.pricingSource, 'Transport rate');
    assert.equal(diagnostics.pricingMode, 'CAPACITY UNIT');
    assert.equal(diagnostics.appliedRateSource, 'Amman to Petra | Sprinter | Transfer');
  });

  it('reports hotel room-night diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      roomCount: 2,
      nightCount: 3,
      costBaseAmount: 450,
      contract: { name: '2026 Contract' },
      seasonName: 'High season',
      roomCategory: { name: 'DLX' },
      mealPlan: 'HB',
      hotel: { name: 'City Hotel' },
    });

    assert.equal(diagnostics.pricingSource, 'Hotel rate');
    assert.equal(diagnostics.unitsUsed, '2 rooms x 3 nights');
    assert.equal(diagnostics.appliedRateSource, '2026 Contract | High season | DLX | HB');
  });

  it('reports catalog activity diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      activityId: 'activity-1',
      activity: { name: 'Jerash Visit' },
      paxCount: 5,
      pricingDescription: 'Activity PER_PERSON snapshot',
      service: {
        name: 'Jerash Visit',
        category: 'activity',
        unitType: 'PER_PERSON',
      },
    });

    assert.equal(diagnostics.pricingSource, 'Activity catalog');
    assert.equal(diagnostics.pricingMode, 'PER PERSON');
    assert.equal(diagnostics.unitsUsed, '5 pax');
    assert.equal(diagnostics.appliedRateSource, 'Jerash Visit');
  });

  it('reports external package diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      externalPackageName: 'Saudi extension',
      externalPackageCountry: 'Saudi Arabia',
      externalPricingBasis: 'PER_GROUP',
      externalNetCost: 1200,
      quantity: 1,
      paxCount: 4,
    });

    assert.equal(diagnostics.pricingSource, 'External package');
    assert.equal(diagnostics.pricingMode, 'PER GROUP');
    assert.equal(diagnostics.unitsUsed, '1 group unit');
    assert.equal(diagnostics.fallbackStatus, 'External net cost available');
  });

  it('reports SupplierService base-cost fallback diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      quantity: 2,
      useOverride: true,
      overrideCost: 50,
      service: {
        name: 'Porterage',
        category: 'service',
        unitType: 'PER_GROUP',
      },
    });

    assert.equal(diagnostics.pricingSource, 'SupplierService base cost');
    assert.equal(diagnostics.fallbackStatus, 'Base cost fallback');
    assert.equal(diagnostics.overrideStatus, 'Cost override active');
  });

  it('surfaces diagnostics in admin quote item displays only', () => {
    assert.ok(quoteItemCardSource.includes('aria-label="Pricing diagnostics"'));
    assert.ok(quoteServicePlannerSource.includes('aria-label="Pricing diagnostics"'));
    assert.ok(quoteServicePlannerSource.includes('<span>Pricing diagnostics</span>'));
    assert.ok(quoteServicePlannerSource.includes('const pricingDiagnostics = buildPricingDiagnostics(item);'));
    assert.ok(quoteItemCardSource.includes('buildPricingDiagnostics(currentItem)'));
    assert.ok(quoteServicePlannerSource.includes('buildPricingDiagnostics(item)'));
  });
});
