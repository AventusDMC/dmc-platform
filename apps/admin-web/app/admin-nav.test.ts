import test = require('node:test');
import assert = require('node:assert/strict');
import { getActiveNavGroup, getVisibleNavGroups } from './admin-nav';

test('admin navigation exposes Companies without role restriction', () => {
  const groups = getVisibleNavGroups('admin');
  const adminGroup = groups.find((group) => group.label === 'Admin');

  assert.ok(adminGroup);
  assert.equal(adminGroup.roles, undefined);
  assert.ok(adminGroup.children.some((child) => child.label === 'Companies' && child.href === '/companies'));
});

test('companies route resolves to Admin navigation group', () => {
  const activeGroup = getActiveNavGroup('/companies', 'admin');

  assert.equal(activeGroup.label, 'Admin');
});
