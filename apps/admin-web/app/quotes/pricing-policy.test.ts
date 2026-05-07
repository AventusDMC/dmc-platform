import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getPricingPolicyRecommendation } from './[id]/pricing-policy';

describe('pricing policy recommendations', () => {
  it('recommends transport markup for missing-sell rows with resolved cost', () => {
    const recommendation = getPricingPolicyRecommendation({
      totalCost: 100,
      totalSell: 0,
      service: {
        name: 'Airport transfer',
        category: 'Transport',
        serviceType: { name: 'Transfer', code: 'TRANSFER' },
      },
    });

    assert.equal(recommendation.eligible, true);
    assert.equal(recommendation.markupPercent, 20);
    assert.equal(recommendation.reason, 'Transport row is missing sell and has a resolved cost.');
    assert.equal(recommendation.skippedReason, null);
  });

  it('recommends generic ServiceRate markup for missing-sell rows', () => {
    const recommendation = getPricingPolicyRecommendation({
      totalCost: 80,
      totalSell: 0,
      service: {
        name: 'Porterage',
        category: 'Service',
        serviceRates: [{ pricingMode: 'PER_GROUP' }],
      },
    });

    assert.equal(recommendation.eligible, true);
    assert.equal(recommendation.markupPercent, 20);
    assert.equal(recommendation.reason, 'Generic ServiceRate row is missing sell and has a resolved cost.');
  });

  it('recommends conservative hotel markup only for structured hotel-rate rows', () => {
    const recommendation = getPricingPolicyRecommendation({
      totalCost: 450,
      totalSell: 0,
      hotelId: 'hotel-1',
      contractId: 'contract-1',
      roomCategoryId: 'room-1',
      seasonName: 'High season',
      mealPlan: 'HB',
      service: {
        name: 'City Hotel',
        category: 'Hotel',
      },
    });

    assert.equal(recommendation.eligible, true);
    assert.equal(recommendation.markupPercent, 15);
    assert.equal(recommendation.reason, 'Structured hotel-rate row is missing sell and has a resolved cost.');
  });

  it('skips rows that are not missing sell', () => {
    const recommendation = getPricingPolicyRecommendation({
      totalCost: 100,
      totalSell: 125,
      service: {
        name: 'Airport transfer',
        category: 'Transport',
      },
    });

    assert.equal(recommendation.eligible, false);
    assert.equal(recommendation.markupPercent, null);
    assert.equal(recommendation.skippedReason, 'Sell price already exists.');
  });

  it('skips rows with missing cost', () => {
    const recommendation = getPricingPolicyRecommendation({
      totalCost: 0,
      totalSell: 0,
      service: {
        name: 'Airport transfer',
        category: 'Transport',
      },
    });

    assert.equal(recommendation.eligible, false);
    assert.equal(recommendation.skippedReason, 'Cost is missing or zero.');
  });

  it('preserves planner intent from explicit selling and cost overrides', () => {
    const baseItem = {
      totalCost: 100,
      totalSell: 0,
      service: {
        name: 'Airport transfer',
        category: 'Transport',
      },
    };

    assert.equal(getPricingPolicyRecommendation({ ...baseItem, sellPrice: 140 }).skippedReason, 'Sell override is active.');
    assert.equal(getPricingPolicyRecommendation({ ...baseItem, markupAmount: 35 }).skippedReason, 'Markup amount override is active.');
    assert.equal(getPricingPolicyRecommendation({ ...baseItem, useOverride: true, overrideCost: 90 }).skippedReason, 'Cost override is active.');
  });

  it('excludes activities, meals, guides, and external packages', () => {
    const common = { totalCost: 100, totalSell: 0 };

    assert.equal(
      getPricingPolicyRecommendation({
        ...common,
        activityId: 'activity-1',
        service: { name: 'Jerash tour', category: 'Activity' },
      }).skippedReason,
      'Activities preserve catalog or planner sell pricing.',
    );
    assert.equal(
      getPricingPolicyRecommendation({
        ...common,
        service: { name: 'Lunch', category: 'Dining', serviceType: { name: 'Dining', code: 'MEAL' } },
      }).skippedReason,
      'Meals remain manual in Phase 1.',
    );
    assert.equal(
      getPricingPolicyRecommendation({
        ...common,
        service: { name: 'Guide', category: 'Guiding', serviceType: { name: 'Guiding', code: 'GUIDE' } },
      }).skippedReason,
      'Guides remain manual in Phase 1.',
    );
    assert.equal(
      getPricingPolicyRecommendation({
        ...common,
        externalPackageName: 'Saudi extension',
        externalNetCost: 1200,
      }).skippedReason,
      'External packages remain manual in Phase 1.',
    );
  });
});
