import test = require('node:test');
import assert = require('node:assert/strict');
import {
  ACTIVITY_SERVICE_TYPE_CODES,
  OPERATIONAL_SERVICE_TYPE_CODES,
  TICKETING_SERVICE_TYPE_CODES,
  isActivityTaxonomyGroup,
  isTicketingTaxonomyGroup,
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

test('existing activity labels remain activity classified', () => {
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Sightseeing' }), 'activity');
});

test('canonical excursion service codes resolve to activity', () => {
  for (const code of ACTIVITY_SERVICE_TYPE_CODES) {
    assert.equal(
      resolveServiceTaxonomyGroup({
        category: 'Legacy label',
        serviceType: { name: 'Any label', code },
      }),
      'activity',
    );
  }
});

test('excursion activity labels resolve to activity', () => {
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Jeep Tour' }), 'activity');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Boat Ride' }), 'activity');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Petra by Night' }), 'activity');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Sound & Light Show' }), 'activity');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Safari' }), 'activity');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Cruise' }), 'activity');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Optional Excursion' }), 'activity');
});

test('canonical ticketing service codes resolve to ticketing', () => {
  for (const code of TICKETING_SERVICE_TYPE_CODES) {
    assert.equal(
      resolveServiceTaxonomyGroup({
        category: 'Legacy label',
        serviceType: { name: 'Any label', code },
      }),
      'ticketing',
    );
  }
});

test('ticketing and entrance labels resolve to ticketing', () => {
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Petra Entrance Ticket' }), 'ticketing');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Jerash Entrance' }), 'ticketing');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Pyramids Entry' }), 'ticketing');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Dead Sea Resort Access' }), 'ticketing');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Museum Tickets' }), 'ticketing');
  assert.equal(resolveServiceTaxonomyGroup({ category: 'Religious site entry' }), 'ticketing');
  assert.equal(isTicketingTaxonomyGroup({ category: 'Entrance Ticket' }), true);
  assert.equal(isActivityTaxonomyGroup({ category: 'Entrance Ticket' }), false);
});
