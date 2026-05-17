import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const agentIndexSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('./dashboard/page.tsx', import.meta.url), 'utf8');

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

  it('keeps /agent/dashboard resilient without agent context or portal data', () => {
    assert.match(dashboardSource, /safeAgentFetch/);
    assert.match(dashboardSource, /export const dynamic = 'force-dynamic'/);
    assert.doesNotMatch(dashboardSource, /const \[me, quotes, bookings, invoices, proposals, departures\] = await Promise\.all\(\[\s*getMe\(\)/);
    assert.match(dashboardSource, /safeAgentFetch<AgentMe \| null>\('profile', getMe, null\)/);
    assert.match(dashboardSource, /Agent sign in required/);
    assert.match(dashboardSource, /Sign in with an active agent account/);
    assert.match(dashboardSource, /href="\/login\?next=\/agent\/dashboard"/);
    assert.match(dashboardSource, /safeAgentFetch<AgentQuote\[\]>\('quotes', getQuotes, \[\]\)/);
    assert.match(dashboardSource, /safeAgentFetch<AgentBooking\[\]>\('bookings', getBookings, \[\]\)/);
    assert.match(dashboardSource, /safeAgentFetch<AgentInvoice\[\]>\('invoices', getInvoices, \[\]\)/);
    assert.match(dashboardSource, /safeAgentFetch<AgentProposal\[\]>\('proposals', getProposals, \[\]\)/);
    assert.match(dashboardSource, /safeAgentFetch<AgentDeparture\[\]>\('departures', getDepartures, \[\]\)/);
    assert.match(dashboardSource, /departure\.availability\?\.stopSale/);
    assert.match(dashboardSource, /departure\.availability\?\.seatsRemaining/);
  });
});
