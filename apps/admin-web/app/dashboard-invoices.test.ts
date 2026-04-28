import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadDashboardInvoices } from './lib/dashboard-invoices';

test('dashboard invoice loader returns an unavailable empty result when invoices fail', async () => {
  const logs: unknown[][] = [];

  const result = await loadDashboardInvoices(
    async () => {
      throw new Error('Dashboard invoices API failed: 500');
    },
    (...args) => logs.push(args),
  );

  assert.deepEqual(result.invoices, []);
  assert.equal(result.unavailable, true);
  assert.equal(logs.length, 1);
  assert.match(String(logs[0][0]), /Dashboard invoices unavailable/);
  assert.match(String(logs[0][1]), /Dashboard invoices API failed: 500/);
});

test('dashboard page uses fault-tolerant invoices and renders an unavailable state', () => {
  const source = readFileSync(new URL('./admin/dashboard/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /safeDashboardFetchJson/);
  assert.match(source, /\/api\/reports\/finance-summary/);
  assert.match(source, /Outstanding Receivables/);
  assert.match(source, /Overdue Receivables/);
});
