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
      totalCost: 300,
      totalSell: 0,
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
    assert.equal(diagnostics.policyEligible, 'Yes');
    assert.equal(diagnostics.suggestedMarkup, '20.00%');
    assert.equal(diagnostics.policySkippedBecause, 'None');
  });

  it('reports transport rate diagnostics without changing pricing totals', () => {
    const diagnostics = buildPricingDiagnostics({
      quantity: 2,
      totalCost: 120,
      totalSell: 0,
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
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pricing basis' && row.value === 'PER GROUP'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Calculated total' && row.value === 'USD 120.00'));
    assert.equal(diagnostics.policyEligible, 'Yes');
    assert.equal(diagnostics.suggestedMarkup, '20.00%');
  });

  it('reports transport per-group card totals as one vehicle unit', () => {
    const diagnostics = buildPricingDiagnostics({
      quantity: 1,
      paxCount: 2,
      totalCost: 95,
      totalSell: 95,
      currency: 'USD',
      pricingDescription: 'Excursion origin variant | Amman -> Petra -> Amman | Touring route | Sedan 2 | PER_VEHICLE',
      appliedVehicleRate: {
        routeName: 'Amman to Petra',
        vehicle: { name: 'Sedan 2' },
        serviceType: { name: 'Touring route', code: 'TOURING_ROUTE' },
      },
      service: {
        name: 'Jordan Private Transfer Service',
        category: 'transport',
        unitType: 'per_group',
      },
    });

    assert.equal(diagnostics.pricingSource, 'Transport rate');
    assert.equal(diagnostics.pricingMode, 'PER GROUP');
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pricing basis' && row.value === 'PER GROUP'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Units' && row.value === '1 vehicle'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Calculated total' && row.value === 'USD 95.00'));
  });

  it('reports hotel room-night diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      roomCount: 2,
      nightCount: 3,
      totalCost: 450,
      totalSell: 0,
      costBaseAmount: 450,
      contract: { name: '2026 Contract' },
      seasonName: 'High season',
      roomCategory: { name: 'DLX' },
      mealPlan: 'HB',
      hotel: { name: 'City Hotel' },
    });

    assert.equal(diagnostics.pricingSource, 'Hotel rate');
    assert.equal(diagnostics.unitsUsed, '2 rooms x 3 nights');
    assert.equal(diagnostics.pricingMode, 'Hotel room/night');
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pricing basis' && row.value === 'PER ROOM / NIGHT'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Unit price' && row.value === 'USD 75.00'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Nights' && row.value === '3'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Calculated total' && row.value === 'USD 450.00'));
    assert.equal(diagnostics.appliedRateSource, '2026 Contract | High season | DLX | HB');
    assert.equal(diagnostics.policyEligible, 'Yes');
    assert.equal(diagnostics.suggestedMarkup, '15.00%');
  });

  it('reports hotel per-person-night diagnostics from saved rate description and totals', () => {
    const diagnostics = buildPricingDiagnostics({
      paxCount: 2,
      roomCount: 1,
      nightCount: 1,
      totalCost: 90,
      totalSell: 90,
      costBaseAmount: 90,
      currency: 'USD',
      pricingDescription: 'Corp Amman Hotel Travel Agent Agreement 2026 | Premium Room | DBL | BB | Rate USD 45.00 x 2 pax x 1 night',
      contract: { name: 'Corp Amman Hotel Travel Agent Agreement 2026' },
      seasonName: '2026',
      roomCategory: { name: 'Premium Room' },
      mealPlan: 'BB',
      hotel: { name: 'Corp Amman Hotel' },
    });

    assert.equal(diagnostics.pricingSource, 'Hotel rate');
    assert.equal(diagnostics.pricingMode, 'Hotel per person/night');
    assert.equal(diagnostics.unitsUsed, '2 pax x 1 night');
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pricing basis' && row.value === 'PER PERSON / NIGHT'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Unit price' && row.value === 'USD 45.00'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pax' && row.value === '2 pax'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Nights' && row.value === '1'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Calculated total' && row.value === 'USD 90.00'));
  });

  it('reports catalog activity per-person diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      activityId: 'activity-1',
      activity: { name: 'Jerash Visit' },
      paxCount: 5,
      totalCost: 100,
      totalSell: 0,
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
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pricing basis' && row.value === 'PER PERSON'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Unit price' && row.value === 'USD 20.00'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pax' && row.value === '5 pax'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Calculated total' && row.value === 'USD 100.00'));
    assert.equal(diagnostics.appliedRateSource, 'Jerash Visit');
    assert.equal(diagnostics.policyEligible, 'No');
    assert.equal(diagnostics.policySkippedBecause, 'Activities preserve catalog or planner sell pricing.');
  });

  it('reports catalog activity per-group diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      activityId: 'activity-1',
      activity: { name: 'Petra Guided Experience' },
      paxCount: 2,
      quantity: 1,
      totalCost: 70.5,
      totalSell: 98.7,
      currency: 'USD',
      pricingDescription: 'Petra Guided Experience | Activity | PER_GROUP | Capacity 10 pax/unit | Required units 1',
      service: {
        name: 'Petra Guided Experience',
        category: 'activity',
        unitType: 'PER_GROUP',
      },
    });

    assert.equal(diagnostics.pricingSource, 'Activity catalog');
    assert.equal(diagnostics.pricingMode, 'PER GROUP');
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pricing basis' && row.value === 'PER GROUP'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Unit price' && row.value === 'USD 70.50'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Units' && row.value === '1 group unit'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Calculated total' && row.value === 'USD 70.50'));
  });

  it('shows ticket unit price and aggregated total price separately', () => {
    const diagnostics = buildPricingDiagnostics({
      service: {
        name: 'Petra Entrance Ticket',
        category: 'Entrance Ticket',
        unitType: 'per_person',
        serviceType: { name: 'Entrance Ticket', code: 'ENTRANCE_TICKET' },
      },
      quantity: 2,
      paxCount: 2,
      costBaseAmount: 50,
      costCurrency: 'JOD',
      totalCost: 141,
      totalSell: 141,
      currency: 'USD',
      pricingDescription: 'Petra Entrance Ticket | 1 Day | Entrance fee',
    });

    assert.equal(diagnostics.pricingSource, 'Entrance fee');
    assert.equal(diagnostics.pricingMode, 'PER PERSON unit rate');
    assert.equal(diagnostics.unitsUsed, '2 pax');
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pricing basis' && row.value === 'PER PERSON'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Unit price' && row.value === 'USD 70.50'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Pax' && row.value === '2 pax'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Calculated total' && row.value === 'USD 141.00'));
  });

  it('reports external package diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      externalPackageName: 'Saudi extension',
      externalPackageCountry: 'Saudi Arabia',
      externalPricingBasis: 'PER_GROUP',
      externalNetCost: 1200,
      totalCost: 1200,
      totalSell: 0,
      quantity: 1,
      paxCount: 4,
    });

    assert.equal(diagnostics.pricingSource, 'External package');
    assert.equal(diagnostics.pricingMode, 'PER GROUP');
    assert.equal(diagnostics.unitsUsed, '1 group unit');
    assert.equal(diagnostics.fallbackStatus, 'External net cost available');
    assert.equal(diagnostics.policyEligible, 'No');
    assert.equal(diagnostics.policySkippedBecause, 'External packages remain manual in Phase 1.');
  });

  it('reports SupplierService base-cost fallback diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      quantity: 2,
      totalCost: 50,
      totalSell: 0,
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
    assert.ok(quoteServicePlannerSource.includes("['Pricing basis', 'Unit price', 'Pax', 'Units', 'Nights', 'Calculated total'].includes(row.label)"));
    assert.ok(quoteItemCardSource.includes('buildPricingDiagnostics(currentItem)'));
    assert.ok(quoteServicePlannerSource.includes('buildPricingDiagnostics(item)'));
  });

  it('renders quote item cards from saved totals instead of recalculating hotel totals', () => {
    assert.ok(quoteItemCardSource.includes('Total sell {formatMoney(currentItem.totalSell, currentItem.currency)}'));
    assert.ok(quoteItemCardSource.includes('Total cost {formatMoney(currentItem.totalCost, currentItem.currency)}'));
    assert.ok(quoteItemCardSource.includes('<strong>{formatMoney(currentItem.totalSell, currentItem.currency)}</strong>'));
  });

  it('surfaces pricing policy dry-run rows in admin diagnostics', () => {
    const diagnostics = buildPricingDiagnostics({
      totalCost: 100,
      totalSell: 0,
      service: {
        name: 'Transfer',
        category: 'Transport',
        unitType: 'PER_GROUP',
      },
    });

    assert.ok(diagnostics.rows.some((row) => row.label === 'Policy eligible' && row.value === 'Yes'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Suggested markup' && row.value === '20.00%'));
    assert.ok(diagnostics.rows.some((row) => row.label === 'Skipped because...' && row.value === 'None'));
  });
});
