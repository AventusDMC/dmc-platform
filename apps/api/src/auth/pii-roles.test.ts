import test = require('node:test');
import assert = require('node:assert/strict');
import { PII_FULL_ROLES, isFullPiiRole, shouldRedactPassengerPii } from './pii-roles';

test('PII_FULL_ROLES is exactly admin, operations, super_admin', () => {
  assert.deepEqual([...PII_FULL_ROLES], ['admin', 'operations', 'super_admin']);
});

test('isFullPiiRole is true only for full-PII roles', () => {
  assert.equal(isFullPiiRole('admin'), true);
  assert.equal(isFullPiiRole('operations'), true);
  assert.equal(isFullPiiRole('super_admin'), true);

  assert.equal(isFullPiiRole('agent_admin'), false);
  assert.equal(isFullPiiRole('agent'), false);
  assert.equal(isFullPiiRole('viewer'), false);
  assert.equal(isFullPiiRole('finance'), false);
  assert.equal(isFullPiiRole(null), false);
  assert.equal(isFullPiiRole(undefined), false);
});

test('shouldRedactPassengerPii redacts every known restricted role', () => {
  assert.equal(shouldRedactPassengerPii('agent_admin'), true);
  assert.equal(shouldRedactPassengerPii('agent'), true);
  assert.equal(shouldRedactPassengerPii('viewer'), true);
  assert.equal(shouldRedactPassengerPii('finance'), true);
});

test('shouldRedactPassengerPii does not redact full-PII roles', () => {
  assert.equal(shouldRedactPassengerPii('admin'), false);
  assert.equal(shouldRedactPassengerPii('operations'), false);
  assert.equal(shouldRedactPassengerPii('super_admin'), false);
});

test('shouldRedactPassengerPii treats a missing role (internal caller) as full', () => {
  assert.equal(shouldRedactPassengerPii(null), false);
  assert.equal(shouldRedactPassengerPii(undefined), false);
});
