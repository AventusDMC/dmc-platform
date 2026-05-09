import test = require('node:test');
import assert = require('node:assert/strict');
import {
  OPERATIONAL_SERVICE_TYPE_CODES,
  isActivityTaxonomyGroup,
  resolveServiceTaxonomyGroup,
} from './service-taxonomy';

test('canonical operational service codes resolve to operational assistance', () => {
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

test('operational assistance labels do not inherit activity execution rules', () => {
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Airport Meet And Assist' }), 'operationalAssistance');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Border Assistance' }), 'operationalAssistance');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Fast Track' }), 'operationalAssistance');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Porterage' }), 'operationalAssistance');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Visa Assistance' }), 'operationalAssistance');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Airport Assistance' }), 'operationalAssistance');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Escort Services' }), 'operationalAssistance');
  assert.equal(isActivityTaxonomyGroup({ category: 'Airport Meet And Assist' }), false);
});

test('existing activity and entrance labels remain activity classified', () => {
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Sightseeing' }), 'activity');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Entrance Ticket' }), 'activity');
});
