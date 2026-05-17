import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const agentIndexSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const dashboardSource = readFileSync(new URL('./dashboard/page.tsx', import.meta.url), 'utf8');
const invoicesSource = readFileSync(new URL('./invoices/page.tsx', import.meta.url), 'utf8');
const departuresSource = readFileSync(new URL('./departures/page.tsx', import.meta.url), 'utf8');
const departureRequestFormSource = readFileSync(new URL('./departures/AgentDepartureRequestForm.tsx', import.meta.url), 'utf8');
const bookingRequestsProxySource = readFileSync(new URL('../api/agent/booking-requests/route.ts', import.meta.url), 'utf8');
const departureRequestProxySource = readFileSync(new URL('../api/agent/departures/[id]/booking-requests/route.ts', import.meta.url), 'utf8');

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
    assert.match(dashboardSource, /safeAgentFetch<AgentBookingRequest\[\]>\('booking requests', getBookingRequests, \[\]\)/);
    assert.match(dashboardSource, /Booking requests/);
    assert.match(dashboardSource, /Waitlisted/);
    assert.match(dashboardSource, /Low availability/);
    assert.match(dashboardSource, /departure\.availability\?\.stopSale/);
    assert.match(dashboardSource, /departure\.availability\?\.seatsRemaining/);
  });

  it('exposes request-only live departure booking actions', () => {
    assert.match(departuresSource, /Live regular tour availability with request-only booking workflow/);
    assert.match(departuresSource, /hotelCategoryAvailability/);
    assert.match(departuresSource, /branchAvailability/);
    assert.match(departuresSource, /<AgentDepartureRequestForm/);
    assert.match(departureRequestFormSource, /Request Seats/);
    assert.match(departureRequestFormSource, /Request waitlisted for admin review/);
    assert.match(departureRequestFormSource, /Request submitted for admin approval/);
    assert.match(bookingRequestsProxySource, /\/agent\/booking-requests/);
    assert.match(departureRequestProxySource, /\/agent\/departures\/\$\{id\}\/booking-requests/);
  });

  it('keeps /agent/invoices resilient without agent context or invoice data', () => {
    assert.match(invoicesSource, /export const dynamic = 'force-dynamic'/);
    assert.match(invoicesSource, /safeAgentFetch<AgentMe \| null>\('profile', getMe, null\)/);
    assert.match(invoicesSource, /safeAgentFetch<AgentInvoice\[\]>\('invoices', getInvoices, \[\]\)/);
    assert.match(invoicesSource, /Agent sign in required/);
    assert.match(invoicesSource, /href="\/login\?next=\/agent\/invoices"/);
    assert.match(invoicesSource, /No invoices are available for this agent account/);
    assert.match(invoicesSource, /invoice\.invoiceNumber \|\| 'Invoice pending'/);
    assert.match(invoicesSource, /invoice\.bookingRef \|\| invoice\.quote\?\.title \|\| 'Booking reference pending'/);
    assert.match(invoicesSource, /invoice\.quote\?\.clientCompany\?\.name \|\| 'Client pending'/);
    assert.match(invoicesSource, /formatDate\(invoice\.dueDate\)/);
    assert.match(invoicesSource, /formatMoney\(invoice\.balanceDue, invoice\.currency \|\| 'USD'\)/);
    assert.match(invoicesSource, /formatPaymentReferences\(invoice\)/);
    assert.match(invoicesSource, /invoice\.pdfUrl \?/);
  });
});
