import assert = require('node:assert/strict');
import test = require('node:test');
import { ForbiddenException } from '@nestjs/common';
import { QuoteItineraryController } from './quote-itinerary.controller';

// CP-N3b2c1 — Secondary Raw-Route Gates (quote-itinerary.controller).
//
// Fail-closed allowlist gate on the RAW day-by-day itinerary read, asserted BEFORE
// the service call. Synthetic actors only — no real data.
//
//   GET /quotes/:id/itinerary → admin, super_admin, finance (QUOTE_COST_VISIBLE_ROLES)
//
// The operational itinerary companion is intentionally left untouched and is
// re-verified here as a regression (still open to every internal-read role).

const ALLOWED = ['admin', 'super_admin', 'finance'] as const;
const DENIED = ['operations', 'viewer', 'agent', 'agent_admin', 'some-unknown-future-role'] as const;
const INTERNAL_READ = ['admin', 'super_admin', 'finance', 'operations', 'viewer'] as const;

// Sentinel itinerary: rich enough to prove verbatim raw pass-through, and shaped so
// the operational mapper still projects it without error.
const RAW_ITINERARY = {
  quoteId: 'quote-1',
  days: [
    { dayNumber: 1, title: 'Arrival', pricingDescription: 'SENTINEL_PRICING_NOTE', overrideReason: 'SENTINEL_REASON', items: [] as any[] },
  ],
};

function makeActor(role: string | undefined, companyId = 'dmc-company') {
  // role === undefined models the "missing role" fail-closed case.
  return (role === undefined ? { id: 'user-1', companyId } : { id: 'user-1', companyId, role }) as any;
}

function createController() {
  const calls = { findByQuoteId: 0, lastCompanyActor: null as any };
  const quoteItineraryService: any = {
    findByQuoteId: async (_quoteId: string, companyActor: any) => {
      calls.findByQuoteId += 1;
      calls.lastCompanyActor = companyActor;
      return RAW_ITINERARY;
    },
  };
  const controller = new QuoteItineraryController(quoteItineraryService);
  return { controller, calls };
}

// ---------------------------------------------------------------------------
// RAW itinerary gate
// ---------------------------------------------------------------------------
for (const role of ALLOWED) {
  test(`raw itinerary: allowed role "${role}" reaches the service with unchanged pass-through`, async () => {
    const { controller, calls } = createController();
    const res: any = await controller.findByQuoteId('quote-1', makeActor(role));
    assert.equal(calls.findByQuoteId, 1);
    // Verbatim pass-through — the gate does not project or strip cost/provenance.
    assert.deepEqual(res, RAW_ITINERARY);
    // Existing company-actor mapping preserved; no tenant `where` predicate added.
    assert.deepEqual(calls.lastCompanyActor, { companyId: 'dmc-company' });
  });
}

for (const role of DENIED) {
  test(`raw itinerary: denied role "${role}" gets 403 before the service call`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(() => controller.findByQuoteId('quote-1', makeActor(role)), ForbiddenException);
    assert.equal(calls.findByQuoteId, 0);
  });
}

test('raw itinerary: missing role fails closed before the service call', async () => {
  const { controller, calls } = createController();
  await assert.rejects(() => controller.findByQuoteId('quote-1', makeActor(undefined)), ForbiddenException);
  assert.equal(calls.findByQuoteId, 0);
});

// ---------------------------------------------------------------------------
// Regression: operational itinerary companion remains open to every internal-read
// role, including operations/viewer now DENIED on the raw counterpart.
// ---------------------------------------------------------------------------
for (const role of INTERNAL_READ) {
  test(`operational itinerary companion still reached by internal role "${role}"`, async () => {
    const { controller, calls } = createController();
    const res: any = await controller.findOperationalByQuoteId('quote-1', makeActor(role));
    assert.equal(calls.findByQuoteId, 1);
    assert.equal(res.quoteId, 'quote-1');
    // The internal pricing note / override reason never survive the projection.
    const json = JSON.stringify(res);
    assert.equal(json.includes('SENTINEL_PRICING_NOTE'), false);
    assert.equal(json.includes('SENTINEL_REASON'), false);
  });
}
