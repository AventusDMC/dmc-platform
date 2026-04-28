import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculatePercentChange, formatPercentChange } from './dashboard-metrics';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const loadingSource = readFileSync(new URL('./loading.tsx', import.meta.url), 'utf8');
const adminIndexSource = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
const rootPageSource = readFileSync(new URL('../../page.tsx', import.meta.url), 'utf8');
const dashboardAliasSource = readFileSync(new URL('../../dashboard/page.tsx', import.meta.url), 'utf8');
const adminNavSource = readFileSync(new URL('../../components/AdminChromeNav.tsx', import.meta.url), 'utf8');
const adminHeaderActionsSource = readFileSync(new URL('../../components/AdminHeaderActions.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../globals.css', import.meta.url), 'utf8');

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
  assert.match(pageSource, /href="\/quotes\/new" className="primary-button"/);
  assert.match(pageSource, /href="\/quotes" className="primary-button"/);
  assert.match(pageSource, /href="\/bookings" className="primary-button"/);
  assert.match(pageSource, /href="\/finance" className="primary-button"/);
  assert.match(pageSource, /href="\/admin\/reports" className="primary-button"/);
  assert.match(pageSource, /New Quote/);
  assert.match(pageSource, /Quotes/);
  assert.match(pageSource, /Bookings/);
  assert.match(pageSource, /Finance/);
  assert.match(pageSource, /Reports/);
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
  assert.match(pageSource, /normalizeAlerts/);
  assert.match(pageSource, /overdueReceivables: asArray\(row\.overdueReceivables\)/);
  assert.match(pageSource, /lowMarginBookings: asArray\(row\.lowMarginBookings\)/);
  assert.match(pageSource, /highCostServices: asArray\(row\.highCostServices\)/);
});

test('admin index redirects to dashboard homepage', () => {
  assert.match(adminIndexSource, /redirect\('\/admin\/dashboard'\)/);
});

test('dashboard entry points redirect to the canonical admin dashboard', () => {
  assert.match(rootPageSource, /redirect\('\/admin\/dashboard'\)/);
  assert.match(dashboardAliasSource, /redirect\('\/admin\/dashboard'\)/);
  assert.doesNotMatch(dashboardAliasSource, /export \{ default \} from '..\/page'/);
  assert.doesNotMatch(rootPageSource, /DashboardHeader|FinanceDashboardSection|RecentQuotesList|RecentBookingsList|Executive Dashboard/);
});

test('admin dashboard is the only rendered dashboard implementation', () => {
  assert.match(pageSource, /export const dynamic = 'force-dynamic'/);
  assert.match(pageSource, /export const revalidate = 0/);
  assert.match(pageSource, /className="page admin-dashboard-shell"/);
  assert.match(pageSource, /Admin Dashboard/);
  assert.doesNotMatch(pageSource, /DashboardHeader|FinanceDashboardSection|RecentQuotesList|RecentBookingsList|Executive Dashboard/);
});

test('dashboard navigation points to canonical admin dashboard route', () => {
  assert.match(readFileSync(new URL('../../admin-nav.ts', import.meta.url), 'utf8'), /href:\s*'\/admin\/dashboard'/);
  assert.match(adminNavSource, /pathname === '\/admin\/dashboard'/);
  assert.match(adminHeaderActionsSource, /href="\/admin\/dashboard"/);
  assert.match(pageSource, /\{ label: 'Dashboard', href: '\/admin\/dashboard' \}/);
  assert.doesNotMatch(pageSource, /Admin Home/);
  assert.doesNotMatch(adminNavSource + adminHeaderActionsSource, /href=["']\/dashboard["']|href=["']\/["']/);
});

test('admin dashboard renders with failed report data using safe defaults', () => {
  assert.match(pageSource, /safeDashboardFetchJson/);
  assert.match(pageSource, /catch \(error\)/);
  assert.match(pageSource, /\[dashboard\].*unavailable/);
  assert.match(pageSource, /EMPTY_BOOKING_SUMMARY/);
  assert.match(pageSource, /EMPTY_FINANCE_SUMMARY/);
  assert.match(pageSource, /EMPTY_ALERTS/);
});

test('admin dashboard renders when monthly trends are empty', () => {
  assert.match(pageSource, /EMPTY_MONTHLY_TRENDS/);
  assert.match(pageSource, /months: \[\]/);
  assert.match(pageSource, /No monthly trend data yet/);
  assert.match(pageSource, /const recentMonths = monthlyTrends\.months\.slice\(-6\)/);
});

test('admin dashboard does not assume alert response fields exist', () => {
  assert.match(pageSource, /function normalizeAlerts/);
  assert.match(pageSource, /asRecord\(value\)/);
  assert.match(pageSource, /unpaidSupplierPayables: asArray\(row\.unpaidSupplierPayables\)/);
});

test('admin dashboard uses full-width responsive dashboard layout', () => {
  assert.match(pageSource, /className="page admin-dashboard-shell"/);
  assert.match(cssSource, /\.page\.admin-dashboard-shell/);
  assert.match(cssSource, /max-width:\s*none/);
  assert.match(cssSource, /padding:\s*24px/);
  assert.match(cssSource, /\.admin-dashboard-page\s*\{[\s\S]*max-width:\s*1400px/);
  assert.match(cssSource, /\.admin-dashboard-page\s*\.dashboard-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(cssSource, /\.admin-dashboard-page\s*\.reports-list-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*2fr\)\s*minmax\(320px,\s*1fr\)/);
  assert.match(cssSource, /@media \(max-width:\s*1180px\)/);
  assert.match(cssSource, /@media \(max-width:\s*720px\)/);
});
