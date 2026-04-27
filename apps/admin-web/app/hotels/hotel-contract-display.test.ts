import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatCancellationRule,
  formatChildPolicyValue,
  formatPricingBasis,
  formatSupplementCharge,
  formatSupplementType,
  getCancellationFallback,
  getCancellationRules,
  getChildPolicies,
  toDisplayArray,
} from './hotel-contract-display';

describe('hotel contract display fallbacks', () => {
  it('formats rate matrix pricing basis labels with a safe fallback', () => {
    assert.equal(formatPricingBasis('PER_PERSON'), 'per person/night');
    assert.equal(formatPricingBasis('PER_ROOM'), 'per room/night');
    assert.equal(formatPricingBasis(undefined), 'per room/night');
  });

  it('renders cancellation rules and safe cancellation fallbacks', () => {
    assert.equal(
      formatCancellationRule({
        daysBefore: 7,
        penaltyPercent: 0,
        windowFromValue: 7,
        deadlineUnit: 'DAYS',
        penaltyType: 'PERCENT',
        penaltyValue: 0,
        notes: 'Free cancellation',
      }),
      '7 days before arrival: 0% | Free cancellation',
    );
    assert.equal(
      formatCancellationRule({
        daysBefore: 3,
        penaltyPercent: 50,
        windowFromValue: 3,
        deadlineUnit: 'DAYS',
        penaltyType: 'PERCENT',
        penaltyValue: 50,
      }),
      '3 days before arrival: 50%',
    );
    assert.deepEqual(getCancellationRules(null), []);
    assert.equal(getCancellationFallback(null), 'No cancellation policy available');
    assert.equal(getCancellationFallback({ rules: [] }), 'No cancellation rules');
  });

  it('renders child policies from ratePolicies and tolerates missing ratePolicies', () => {
    const ratePolicies = [
      { policyType: 'CHILD_FREE', ageFrom: 0, ageTo: 5 },
      { policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 },
    ];

    const childPolicies = getChildPolicies(ratePolicies);

    assert.equal(childPolicies.length, 2);
    assert.equal(formatChildPolicyValue(childPolicies[0], 'JOD'), 'Children 0-5 free');
    assert.equal(formatChildPolicyValue(childPolicies[1], 'JOD'), 'Children 6-11 pay 50%');
    assert.deepEqual(getChildPolicies(undefined), []);
  });

  it('ignores legacy child bands when ratePolicies exist', () => {
    const contract = {
      ratePolicies: [{ policyType: 'CHILD_DISCOUNT', ageFrom: 6, ageTo: 11, percent: 50 }],
      legacyChildBands: [{ ageFrom: 0, ageTo: 5, chargeValue: 0 }],
    };

    const childPolicies = getChildPolicies(contract.ratePolicies);

    assert.equal(childPolicies.length, 1);
    assert.equal(formatChildPolicyValue(childPolicies[0], 'JOD'), 'Children 6-11 pay 50%');
  });

  it('renders supplement amount and type with empty and malformed fallbacks', () => {
    assert.equal(formatSupplementType('GALA_DINNER'), 'Gala Dinner');
    assert.equal(formatSupplementType('EXTRA_DINNER'), 'Extra Dinner');
    assert.equal(formatSupplementType('EXTRA_BED'), 'Extra Bed');
    assert.deepEqual(formatSupplementCharge({ amount: 30, currency: 'JOD', chargeBasis: 'PER_PERSON' }), {
      amountLabel: '30.00 JOD',
      basisLabel: 'per person',
    });
    assert.deepEqual(formatSupplementCharge({ amount: 45, currency: 'JOD', chargeBasis: 'PER_ROOM' }), {
      amountLabel: '45.00 JOD',
      basisLabel: 'per room',
    });
    assert.deepEqual(formatSupplementCharge({ amount: 100, currency: 'JOD', chargeBasis: 'PER_STAY' }), {
      amountLabel: '100.00 JOD',
      basisLabel: 'one-time',
    });

    assert.deepEqual(toDisplayArray([]), []);
    assert.deepEqual(formatSupplementCharge({ amount: '', currency: 'JOD', chargeBasis: null }), {
      amountLabel: 'No amount',
      basisLabel: 'Charge basis',
    });
    assert.deepEqual(formatSupplementCharge({ amount: 'not-a-number', currency: null, chargeBasis: 'PER_NIGHT' }), {
      amountLabel: 'No amount',
      basisLabel: 'per night',
    });
  });
});
