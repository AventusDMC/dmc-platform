import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const loadingSource = readFileSync(new URL('./loading.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../globals.css', import.meta.url), 'utf8');

test('reports page renders KPI cards for booking summary metrics', () => {
  assert.match(pageSource, /Total Revenue/);
  assert.match(pageSource, /Total Cost/);
  assert.match(pageSource, /Total Profit/);
  assert.match(pageSource, /Avg Margin/);
  assert.match(pageSource, /Total Bookings/);
  assert.match(pageSource, /Cancelled Bookings/);
  assert.match(pageSource, /summary\.cancelledBookings/);
});

test('reports page renders finance dashboard KPIs and tables', () => {
  assert.match(pageSource, /getFinanceSummary/);
  assert.match(pageSource, /\/api\/reports\/finance-summary/);
  assert.match(pageSource, /Total Invoiced/);
  assert.match(pageSource, /Total Paid/);
  assert.match(pageSource, /Outstanding Receivables/);
  assert.match(pageSource, /Overdue Receivables/);
  assert.match(pageSource, /Supplier Payables/);
  assert.match(pageSource, /Outstanding Supplier Payables/);
  assert.match(pageSource, /Net Cash Position/);
  assert.match(pageSource, /Overdue Invoices/);
  assert.match(pageSource, /Unpaid Supplier Payables/);
  assert.match(pageSource, /No overdue invoices/);
  assert.match(pageSource, /No unpaid supplier payables/);
});

test('reports page renders accounting export CSV buttons', () => {
  const invoicesRoute = readFileSync(new URL('../../api/exports/invoices.csv/route.ts', import.meta.url), 'utf8');
  const paymentsRoute = readFileSync(new URL('../../api/exports/payments.csv/route.ts', import.meta.url), 'utf8');
  const payablesRoute = readFileSync(new URL('../../api/exports/supplier-payables.csv/route.ts', import.meta.url), 'utf8');

  assert.match(pageSource, /Accounting Export/);
  assert.match(pageSource, /Export Invoices CSV/);
  assert.match(pageSource, /Export Payments CSV/);
  assert.match(pageSource, /Export Supplier Payables CSV/);
  assert.match(pageSource, /buildExportHref\('\/api\/exports\/invoices\.csv'/);
  assert.match(pageSource, /buildExportHref\('\/api\/exports\/payments\.csv'/);
  assert.match(pageSource, /buildExportHref\('\/api\/exports\/supplier-payables\.csv'/);
  assert.match(pageSource, /startDate/);
  assert.match(pageSource, /endDate/);
  assert.match(invoicesRoute, /\/exports\/invoices\.csv/);
  assert.match(paymentsRoute, /\/exports\/payments\.csv/);
  assert.match(payablesRoute, /\/exports\/supplier-payables\.csv/);
  assert.match(invoicesRoute, /forwardProxyContentResponse/);
});

test('reports page wires bulk overdue reminder action', () => {
  const buttonSource = readFileSync(new URL('./OverdueReminderButton.tsx', import.meta.url), 'utf8');
  const routeSource = readFileSync(new URL('../../api/reports/send-overdue-reminders/route.ts', import.meta.url), 'utf8');

  assert.match(pageSource, /OverdueReminderButton/);
  assert.match(buttonSource, /Send All Overdue Reminders/);
  assert.match(buttonSource, /\/api\/reports\/send-overdue-reminders/);
  assert.match(buttonSource, /reminders sent/);
  assert.match(routeSource, /\/reports\/send-overdue-reminders/);
  assert.match(routeSource, /proxyRequest/);
});

test('reports page renders alert groups and empty state', () => {
  assert.match(pageSource, /getAlerts/);
  assert.match(pageSource, /\/api\/reports\/alerts/);
  assert.match(pageSource, /Overdue Receivables/);
  assert.match(pageSource, /Low Margin Bookings/);
  assert.match(pageSource, /High Cost Services/);
  assert.match(pageSource, /Unpaid Supplier Payables/);
  assert.match(pageSource, /No alerts right now/);
  assert.match(pageSource, /reports-alert-card/);
  assert.match(pageSource, /Internal\/Admin only/);
  assert.match(cssSource, /\.reports-alert-card/);
  assert.match(cssSource, /\.reports-alert-row/);
});

test('alerts API proxy route exists', () => {
  const routeSource = readFileSync(new URL('../../api/reports/alerts/route.ts', import.meta.url), 'utf8');

  assert.match(routeSource, /\/reports\/alerts/);
  assert.match(routeSource, /proxyRequest/);
});

test('finance navigation includes summary link under Finance', () => {
  const navSource = readFileSync(new URL('../../admin-nav.ts', import.meta.url), 'utf8');

  assert.match(navSource, /label: 'Finance Summary'/);
  assert.match(navSource, /href: '\/admin\/reports'/);
});

test('finance summary API proxy route exists', () => {
  const routeSource = readFileSync(new URL('../../api/reports/finance-summary/route.ts', import.meta.url), 'utf8');

  assert.match(routeSource, /\/reports\/finance-summary/);
  assert.match(routeSource, /proxyRequest/);
});

test('reports page renders monthly trends visual section', () => {
  assert.match(pageSource, /getMonthlyTrends/);
  assert.match(pageSource, /\/api\/reports\/monthly-trends/);
  assert.match(pageSource, /Monthly trends/);
  assert.match(pageSource, /reports-mini-bar/);
  assert.match(pageSource, /getBarWidth\(month\.totalSell, maxMonthlyRevenue\)/);
  assert.match(cssSource, /\.reports-mini-bar/);
});

test('reports page renders supplier performance with sorting controls', () => {
  assert.match(pageSource, /getSupplierPerformance/);
  assert.match(pageSource, /\/api\/reports\/supplier-performance/);
  assert.match(pageSource, /Supplier Performance/);
  assert.match(pageSource, /Supplier cost and margin/);
  assert.match(pageSource, /SortLink label="Cost"/);
  assert.match(pageSource, /SortLink label="Revenue"/);
  assert.match(pageSource, /SortLink label="Profit"/);
  assert.match(pageSource, /SortLink label="Margin"/);
  assert.match(pageSource, /sortSuppliers\(supplierPerformance\.suppliers, supplierSort\)/);
});

test('reports date filters apply to all report requests', () => {
  assert.match(pageSource, /name="startDate"/);
  assert.match(pageSource, /name="endDate"/);
  assert.match(pageSource, /form className="reports-filter-bar" action="\/admin\/reports"/);
  assert.match(pageSource, /getBookingSummary\(resolvedSearchParams\.startDate, resolvedSearchParams\.endDate\)/);
  assert.match(pageSource, /getMonthlyTrends\(resolvedSearchParams\.startDate, resolvedSearchParams\.endDate\)/);
  assert.match(pageSource, /getSupplierPerformance\(resolvedSearchParams\.startDate, resolvedSearchParams\.endDate\)/);
});

test('reports page renders top warning sections and empty states', () => {
  assert.match(pageSource, /Top Profit Bookings/);
  assert.match(pageSource, /Low Margin Bookings/);
  assert.match(pageSource, /Top Suppliers by Cost/);
  assert.match(pageSource, /Lowest Margin Suppliers/);
  assert.match(pageSource, /No data yet/);
  assert.match(pageSource, /No monthly booking trends in this range/);
  assert.match(pageSource, /No supplier-assigned services in this range/);
  assert.match(pageSource, /No supplier cost data in this range/);
});

test('reports page renders with failed APIs using safe defaults', () => {
  assert.match(pageSource, /safeFetch/);
  assert.match(pageSource, /catch \(error\)/);
  assert.match(pageSource, /\[reports\].*unavailable/);
  assert.doesNotMatch(pageSource, /Promise\.all/);
  assert.match(pageSource, /EMPTY_BOOKING_SUMMARY/);
  assert.match(pageSource, /EMPTY_MONTHLY_TRENDS/);
  assert.match(pageSource, /EMPTY_SUPPLIER_PERFORMANCE/);
  assert.match(pageSource, /EMPTY_FINANCE_SUMMARY/);
  assert.match(pageSource, /EMPTY_ALERTS/);
});

test('reports page renders with empty data defaults', () => {
  assert.match(pageSource, /totalBookings: 0/);
  assert.match(pageSource, /totalSell: 0/);
  assert.match(pageSource, /totalCost: 0/);
  assert.match(pageSource, /totalProfit: 0/);
  assert.match(pageSource, /avgMargin: 0/);
  assert.match(pageSource, /topBookings: \[\]/);
  assert.match(pageSource, /lowMarginBookings: \[\]/);
  assert.match(pageSource, /months: \[\]/);
  assert.match(pageSource, /suppliers: \[\]/);
  assert.match(pageSource, /overdueInvoices: \[\]/);
  assert.match(pageSource, /unpaidSupplierPayables: \[\]/);
});

test('reports page renders with partial data by normalizing missing arrays and fields', () => {
  assert.match(pageSource, /function normalizeBookingSummary/);
  assert.match(pageSource, /function normalizeMonthlyTrends/);
  assert.match(pageSource, /function normalizeSupplierPerformance/);
  assert.match(pageSource, /function normalizeFinanceSummary/);
  assert.match(pageSource, /function normalizeAlerts/);
  assert.match(pageSource, /topBookings: asArray\(row\.topBookings\)/);
  assert.match(pageSource, /months: asArray\(row\.months\)/);
  assert.match(pageSource, /suppliers: asArray\(row\.suppliers\)/);
  assert.match(pageSource, /overdueReceivables: asArray\(row\.overdueReceivables\)/);
});

test('reports page has loading and internal admin safety labeling', () => {
  assert.match(loadingSource, /Loading report metrics/);
  assert.match(loadingSource, /Fetching report data/);
  assert.match(pageSource, /Internal\/admin only/);
  assert.match(pageSource, /Internal\/Admin only/);
  assert.doesNotMatch(pageSource, /proposal-v3|mobile operations|public\/proposals/);
});
