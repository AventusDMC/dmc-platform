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

test('admin navigation exposes first-class Activities catalog', () => {
  const groups = getVisibleNavGroups('admin');
  const catalogGroup = groups.find((group) => group.label === 'Product Catalog');

  assert.ok(catalogGroup);
  assert.ok(catalogGroup.children.some((child) => child.label === 'Activities' && child.href === '/activities'));
  assert.equal(getActiveNavGroup('/activities', 'admin').label, 'Product Catalog');
});
