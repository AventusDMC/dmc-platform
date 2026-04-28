import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculatePercentChange, formatPercentChange } from './dashboard-metrics';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const loadingSource = readFileSync(new URL('./loading.tsx', import.meta.url), 'utf8');
const adminIndexSource = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

test('admin dashboard renders KPI cards from existing report endpoints', () => {
  assert.match(pageSource, /\/api\/reports\/finance-summary/);
  assert.match(pageSource, /\/api\/reports\/booking-summary/);
  assert.match(pageSource, /Total Revenue/);
  assert.match(pageSource, /Total Profit/);
  assert.match(pageSource, /Outstanding Receivables/);
  assert.match(pageSource, /Overdue Receivables/);
  assert.match(pageSource, /Total Bookings/);
  assert.match(pageSource, /Avg Margin/);
});

test('admin dashboard renders alerts preview and links to reports', () => {
  assert.match(pageSource, /\/api\/reports\/alerts/);
  assert.match(pageSource, /Alerts preview/);
  assert.match(pageSource, /Overdue Receivables/);
  assert.match(pageSource, /Low Margin Bookings/);
  assert.match(pageSource, /High Cost Services/);
  assert.match(pageSource, /Unpaid Supplier Payables/);
  assert.match(pageSource, /href="\/admin\/reports"/);
});

test('admin dashboard renders monthly trends and operational snapshot', () => {
  assert.match(pageSource, /\/api\/reports\/monthly-trends/);
  assert.match(pageSource, /Monthly mini trend/);
  assert.match(pageSource, /reports-mini-bar/);
  assert.match(pageSource, /Operational snapshot/);
  assert.match(pageSource, /Upcoming Bookings/);
  assert.match(pageSource, /Bookings In Progress/);
  assert.match(pageSource, /Pending Operations Assignments/);
});

test('admin dashboard renders quick actions empty and loading states', () => {
  assert.match(pageSource, /Quick actions/);
  assert.match(pageSource, /New Quote/);
  assert.match(pageSource, /New Booking/);
  assert.match(pageSource, /Companies/);
  assert.match(pageSource, /Reports/);
  assert.match(pageSource, /Finance/);
  assert.match(pageSource, /No dashboard activity yet/);
  assert.match(loadingSource, /Loading dashboard metrics/);
  assert.match(loadingSource, /Fetching dashboard data/);
});

test('admin dashboard renders selling KPI upgrade sections', () => {
  assert.match(pageSource, /This Month/);
  assert.match(pageSource, /Sales performance at a glance/);
  assert.match(pageSource, /Top Agent This Month/);
  assert.match(pageSource, /Attention Needed/);
  assert.match(pageSource, /Commercial risk signals/);
  assert.match(pageSource, /admin-dashboard-trend-positive/);
  assert.match(pageSource, /admin-dashboard-trend-negative/);
  assert.match(pageSource, /calculatePercentChange\(thisMonth\.totalSell, lastMonth\.totalSell\)/);
});

test('dashboard percentage calculations display correctly', () => {
  assert.equal(calculatePercentChange(150, 100), 50);
  assert.equal(calculatePercentChange(75, 100), -25);
  assert.equal(formatPercentChange(50), '+50%');
  assert.equal(formatPercentChange(-25), '-25%');
});

test('dashboard attention counts render from alerts', () => {
  assert.match(pageSource, /alerts\.overdueReceivables\.length/);
  assert.match(pageSource, /alerts\.lowMarginBookings\.length/);
  assert.match(pageSource, /alerts\.highCostServices\.length/);
});

test('admin index redirects to dashboard homepage', () => {
  assert.match(adminIndexSource, /redirect\('\/admin\/dashboard'\)/);
});
