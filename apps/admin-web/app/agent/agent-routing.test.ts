import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const agentIndexSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('agent portal routing', () => {
  it('exposes a default /agent route that lands on the dashboard', () => {
    assert.ok(existsSync(new URL('./page.tsx', import.meta.url)));
    assert.match(agentIndexSource, /redirect\('\/agent\/dashboard'\)/);
  });

  it('keeps expected agent nested pages available', () => {
    for (const route of ['./dashboard/page.tsx', './quotes/page.tsx', './bookings/page.tsx', './invoices/page.tsx', './departures/page.tsx']) {
      assert.ok(existsSync(new URL(route, import.meta.url)), `Expected ${route} to exist`);
    }
  });
});
