import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactQuoteV2CostMargin } from './quote-v2-cost-redaction';
import type { Quote } from './quote-types';

// The function only reads `quote.pricing`; a minimal fixture (cast) is enough and
// lets us assert that everything OUTSIDE pricing (per-item amounts, itinerary) is
// preserved by the shallow clone.
function makeQuote(): Quote {
  return {
    id: 'q1',
    pricing: {
      lines: [
        { id: 'l1', label: 'Hotels', amount: 800, status: 'complete', note: '' },
        { id: 'l2', label: 'Transport', amount: 200, status: 'complete', note: '' },
      ],
      netCost: 1000,
      markupPercent: 25,
      margin: 250,
      sellingPrice: 1250,
      pax: 2,
      perPerson: 625,
      currency: 'USD',
    },
    transport: [{ id: 't1', amount: 200 }],
    experiences: [{ id: 'e1', amount: 90 }],
  } as unknown as Quote;
}

describe('redactQuoteV2CostMargin (Slice 2A-2)', () => {
  it('privileged (canViewCostMargin=true) returns the quote unchanged (same reference)', () => {
    const q = makeQuote();
    const out = redactQuoteV2CostMargin(q, true);
    assert.equal(out, q);
    assert.equal(out!.pricing.netCost, 1000);
    assert.equal(out!.pricing.margin, 250);
    assert.equal(out!.pricing.markupPercent, 25);
  });

  it('restricted (false) zeroes net cost / markup / margin / per-line cost', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.equal(out.pricing.netCost, 0);
    assert.equal(out.pricing.markupPercent, 0);
    assert.equal(out.pricing.margin, 0);
    assert.deepEqual(out.pricing.lines.map((l) => l.amount), [0, 0]);
  });

  it('restricted keeps client-facing selling price / per person / pax / currency', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.equal(out.pricing.sellingPrice, 1250);
    assert.equal(out.pricing.perPerson, 625);
    assert.equal(out.pricing.pax, 2);
    assert.equal(out.pricing.currency, 'USD');
  });

  it('restricted is NOT over-redacted — line labels/status + per-item amounts survive', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.deepEqual(out.pricing.lines.map((l) => l.label), ['Hotels', 'Transport']);
    // per-item display amounts are itinerary/build data (shown to operations,
    // consumed by readiness helpers) — deliberately NOT redacted.
    assert.equal((out as unknown as { transport: { amount: number }[] }).transport[0].amount, 200);
    assert.equal((out as unknown as { experiences: { amount: number }[] }).experiences[0].amount, 90);
  });

  it('is pure — does not mutate the input', () => {
    const q = makeQuote();
    redactQuoteV2CostMargin(q, false);
    assert.equal(q.pricing.netCost, 1000);
    assert.equal(q.pricing.lines[0].amount, 800);
  });

  it('null passthrough for both role states', () => {
    assert.equal(redactQuoteV2CostMargin(null, false), null);
    assert.equal(redactQuoteV2CostMargin(null, true), null);
  });
});
