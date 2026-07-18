import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { canViewQuoteCostMargin, QUOTE_COST_VISIBLE_ROLES } from './cost-visibility';

// Slice 2C role predicate for Quote Builder V2 cost/margin visibility. Narrower than
// PII_FULL_ROLES: operations must NOT see cost (only admin / super_admin / finance).

test('admin / super_admin / finance can view cost/margin', () => {
  assert.equal(canViewQuoteCostMargin('admin'), true);
  assert.equal(canViewQuoteCostMargin('super_admin'), true);
  assert.equal(canViewQuoteCostMargin('finance'), true);
});

test('operations / agent / viewer / agent_admin cannot view cost/margin', () => {
  assert.equal(canViewQuoteCostMargin('operations'), false);
  assert.equal(canViewQuoteCostMargin('agent'), false);
  assert.equal(canViewQuoteCostMargin('viewer'), false);
  assert.equal(canViewQuoteCostMargin('agent_admin'), false);
});

test('null / undefined / empty / unknown roles are restricted (fail-closed)', () => {
  assert.equal(canViewQuoteCostMargin(null), false);
  assert.equal(canViewQuoteCostMargin(undefined), false);
  assert.equal(canViewQuoteCostMargin(''), false);
  assert.equal(canViewQuoteCostMargin('not-a-real-role'), false);
});

test('the visible-roles list excludes operations (distinct from PII_FULL_ROLES)', () => {
  assert.ok(!(QUOTE_COST_VISIBLE_ROLES as readonly string[]).includes('operations'));
  assert.deepEqual([...QUOTE_COST_VISIBLE_ROLES].sort(), ['admin', 'finance', 'super_admin']);
});
