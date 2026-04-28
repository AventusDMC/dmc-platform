import test = require('node:test');
import assert = require('node:assert/strict');
import { readFileSync } from 'node:fs';
import { getActiveNavGroup, getVisibleNavGroups } from './admin-nav';

const layoutSource = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8');
const chromeNavSource = readFileSync(new URL('./components/AdminChromeNav.tsx', import.meta.url), 'utf8');
const breadcrumbsSource = readFileSync(new URL('./components/AdminBreadcrumbs.tsx', import.meta.url), 'utf8');
const backButtonSource = readFileSync(new URL('./components/AdminBackButton.tsx', import.meta.url), 'utf8');
const headerActionsSource = readFileSync(new URL('./components/AdminHeaderActions.tsx', import.meta.url), 'utf8');
const quotePageSource = readFileSync(new URL('./quotes/[id]/page.tsx', import.meta.url), 'utf8');
const bookingPageSource = readFileSync(new URL('./bookings/[id]/page.tsx', import.meta.url), 'utf8');
const activityPageSource = readFileSync(new URL('./activities/[id]/page.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

test('admin navigation exposes Sales companies without role restriction', () => {
  const groups = getVisibleNavGroups('admin');
  const salesGroup = groups.find((group) => group.label === 'Sales');

  assert.ok(salesGroup);
  assert.equal(salesGroup.roles, undefined);
  assert.ok(salesGroup.children.some((child) => child.label === 'Companies' && child.href === '/companies'));
});

test('companies route resolves to Sales navigation group', () => {
  const activeGroup = getActiveNavGroup('/companies', 'admin');

  assert.equal(activeGroup.label, 'Sales');
});

test('admin navigation exposes first-class Activities catalog', () => {
  const groups = getVisibleNavGroups('admin');
  const catalogGroup = groups.find((group) => group.label === 'Product Catalog');

  assert.ok(catalogGroup);
  assert.ok(catalogGroup.children.some((child) => child.label === 'Activities' && child.href === '/activities'));
  assert.equal(getActiveNavGroup('/activities', 'admin').label, 'Product Catalog');
});

test('admin sidebar renders the requested groups and section items', () => {
  const groups = getVisibleNavGroups('admin');
  const labels = groups.map((group) => group.label);

  assert.deepEqual(labels, ['Dashboard', 'Sales', 'Operations', 'Product Catalog', 'Finance', 'Administration']);
  assert.ok(groups.find((group) => group.label === 'Sales')?.children.some((child) => child.label === 'Quotes'));
  assert.ok(groups.find((group) => group.label === 'Operations')?.children.some((child) => child.label === 'Bookings'));
  assert.ok(groups.find((group) => group.label === 'Product Catalog')?.children.some((child) => child.label === 'Suppliers'));
  assert.ok(groups.find((group) => group.label === 'Finance')?.children.some((child) => child.label === 'Payments / Reconciliation'));
  assert.ok(groups.find((group) => group.label === 'Administration')?.children.some((child) => child.label === 'Branding'));
});

test('active admin navigation state is based on pathname', () => {
  assert.equal(getActiveNavGroup('/quotes/quote-123', 'admin').label, 'Sales');
  assert.equal(getActiveNavGroup('/bookings/booking-123', 'admin').label, 'Operations');
  assert.equal(getActiveNavGroup('/finance/reconciliation', 'admin').label, 'Finance');
  assert.match(chromeNavSource, /aria-current=\{active \? 'page' : undefined\}/);
  assert.match(chromeNavSource, /admin-top-nav-link-active/);
});

test('breadcrumbs render on quote booking and activity detail pages', () => {
  assert.match(breadcrumbsSource, /aria-label="Breadcrumb"/);
  assert.match(quotePageSource, /<AdminBreadcrumbs/);
  assert.match(quotePageSource, /label: `Quote \$\{quoteNumberLabel\}`/);
  assert.match(bookingPageSource, /<AdminBreadcrumbs/);
  assert.match(bookingPageSource, /label: `Booking \$\{bookingRef\}`/);
  assert.match(activityPageSource, /<AdminBreadcrumbs/);
  assert.match(activityPageSource, /label: activity\.name/);
});

test('back button uses browser history with a fallback route', () => {
  assert.match(backButtonSource, /window\.history\.length > 1/);
  assert.match(backButtonSource, /router\.back\(\)/);
  assert.match(backButtonSource, /router\.push\(fallbackHref\)/);
  assert.match(quotePageSource, /fallbackHref="\/quotes" label="Back to Quotes"/);
  assert.match(bookingPageSource, /fallbackHref="\/bookings" label="Back to Bookings"/);
  assert.match(activityPageSource, /fallbackHref="\/activities" label="Back to Activities"/);
});

test('dashboard shortcut routes consistently from page headers', () => {
  assert.match(headerActionsSource, /href="\/admin\/dashboard"/);
  assert.match(quotePageSource, /<AdminHeaderActions className="quote-dashboard-actions">/);
  assert.match(bookingPageSource, /<AdminHeaderActions className="booking-dashboard-actions">/);
  assert.match(activityPageSource, /<AdminHeaderActions>/);
});

test('mobile admin navigation hooks and collapse classes exist', () => {
  assert.match(layoutSource, /className="admin-mobile-nav"/);
  assert.match(layoutSource, /<summary className="secondary-button">Menu<\/summary>/);
  assert.match(cssSource, /\.admin-mobile-nav/);
  assert.match(cssSource, /@media \(max-width: 859px\)/);
  assert.match(cssSource, /\.admin-sidebar\s*\{\s*display: none;/);
});
