import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OPERATIONAL_SERVICE_TYPE_CODES,
  getPlannerCategoryForService,
  isActivityTaxonomyGroup,
  resolveServiceTaxonomyGroup,
} from './service-taxonomy';

describe('service taxonomy helper', () => {
  it('resolves canonical operational codes to operational assistance', () => {
    for (const code of OPERATIONAL_SERVICE_TYPE_CODES) {
      assert.equal(
        resolveServiceTaxonomyGroup({
          category: 'Legacy label',
          serviceType: { name: 'Any label', code },
        }),
        'operationalAssistance',
      );
    }
  });

  it('keeps operational assistance in the existing planner other lane for phase 1', () => {
    assert.equal(getPlannerCategoryForService({ category: 'Airport Meet And Assist' }), 'other');
    assert.equal(getPlannerCategoryForService({ category: 'Border Assistance' }), 'other');
    assert.equal(getPlannerCategoryForService({ category: 'Fast Track' }), 'other');
    assert.equal(getPlannerCategoryForService({ category: 'Porterage' }), 'other');
    assert.equal(getPlannerCategoryForService({ category: 'Visa Assistance' }), 'other');
    assert.equal(getPlannerCategoryForService({ category: 'Airport Assistance' }), 'other');
    assert.equal(getPlannerCategoryForService({ category: 'Escort Services' }), 'other');
    assert.equal(isActivityTaxonomyGroup({ category: 'Airport Meet And Assist' }), false);
  });

  it('preserves activity and external package planner classification', () => {
    assert.equal(getPlannerCategoryForService({ category: 'Entrance Ticket' }), 'activity');
    assert.equal(getPlannerCategoryForService({ serviceType: { name: 'External Package', code: 'EXTERNAL_PACKAGE' } }), 'externalPackage');
  });
});
