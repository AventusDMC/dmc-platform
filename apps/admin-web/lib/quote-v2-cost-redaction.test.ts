import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { redactQuoteV2CostMargin } from './quote-v2-cost-redaction';
import type { Quote } from './quote-types';
import { canAccessFinance, type SessionRole } from '../app/lib/auth-session';

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
    experiences: [
      // Meal item: the supplier cost rides here as unitCost (the leak CP-Sb fixes).
      { id: 'e1', amount: 90, isMeal: true, unitCost: 30, quantity: 1, currency: 'USD' },
      // Non-meal item: the adapter already sets unitCost null — must stay null.
      { id: 'e2', amount: 120, unitCost: null },
      // unitCost field absent entirely — redaction must still yield null (no leak).
      { id: 'e3', amount: 50 },
    ],
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

// ---------------------------------------------------------------------------
// CP-Sb — per-item meal supplier cost (experiences[].unitCost) redaction.
// The redactor takes the boolean canViewCostMargin, which the page derives from
// canAccessFinance(role). These tests drive each role through that SAME predicate
// so the full policy chain — including its fail-closed default — is covered.
// ---------------------------------------------------------------------------

const FINANCE_ROLES: SessionRole[] = ['admin', 'super_admin', 'finance'];
const NON_FINANCE_ROLES: SessionRole[] = ['operations', 'agent_admin', 'agent', 'viewer'];

function experiencesOf(q: Quote) {
  return (q as unknown as {
    experiences: { id: string; unitCost?: number | null; amount?: number }[];
  }).experiences;
}

describe('redactQuoteV2CostMargin — meal unitCost redaction (CP-Sb)', () => {
  for (const role of FINANCE_ROLES) {
    it(`finance role "${role}" retains the exact numeric meal unitCost (30)`, () => {
      const out = redactQuoteV2CostMargin(makeQuote(), canAccessFinance(role))!;
      assert.equal(experiencesOf(out)[0].unitCost, 30);
    });
  }

  for (const role of NON_FINANCE_ROLES) {
    it(`non-finance role "${role}" receives experiences[].unitCost: null`, () => {
      const out = redactQuoteV2CostMargin(makeQuote(), canAccessFinance(role))!;
      assert.equal(experiencesOf(out)[0].unitCost, null);
    });
  }

  it('unknown / unrecognized role fails closed → unitCost null', () => {
    const unknownRole = 'marketing' as unknown as SessionRole;
    assert.equal(canAccessFinance(unknownRole), false);
    assert.equal(experiencesOf(redactQuoteV2CostMargin(makeQuote(), canAccessFinance(unknownRole))!)[0].unitCost, null);
    // undefined / null actor role also fail closed
    assert.equal(experiencesOf(redactQuoteV2CostMargin(makeQuote(), canAccessFinance(undefined))!)[0].unitCost, null);
    assert.equal(experiencesOf(redactQuoteV2CostMargin(makeQuote(), canAccessFinance(null))!)[0].unitCost, null);
  });

  it('already-null and field-absent unitCosts stay null for restricted roles', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.equal(experiencesOf(out)[1].unitCost, null); // was explicitly null
    assert.equal(experiencesOf(out)[2].unitCost, null); // was absent
  });

  it('restricted redaction preserves unrelated Experience fields and the selling amount', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    const e0 = experiencesOf(out)[0] as unknown as {
      amount: number; currency: string; quantity: number; isMeal: boolean;
    };
    assert.equal(e0.amount, 90);       // client-facing selling amount unchanged
    assert.equal(e0.currency, 'USD');
    assert.equal(e0.quantity, 1);
    assert.equal(e0.isMeal, true);
  });

  it('introduces NO new per-item cost alias — only unitCost changes (same key set)', () => {
    const inputKeys = Object.keys(experiencesOf(makeQuote())[0]).sort();
    const outKeys = Object.keys(experiencesOf(redactQuoteV2CostMargin(makeQuote(), false)!)[0]).sort();
    assert.deepEqual(outKeys, inputKeys); // no added alias / raw-cost field
  });

  it('restricted still zeroes the existing pricing.* cost/margin figures (unchanged)', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.equal(out.pricing.netCost, 0);
    assert.equal(out.pricing.markupPercent, 0);
    assert.equal(out.pricing.margin, 0);
    assert.deepEqual(out.pricing.lines.map((l) => l.amount), [0, 0]);
    assert.equal(out.pricing.sellingPrice, 1250); // selling total untouched
  });

  it('finance payload is otherwise unchanged (same reference; full cost intact)', () => {
    const q = makeQuote();
    const out = redactQuoteV2CostMargin(q, canAccessFinance('finance'));
    assert.equal(out, q); // privileged path returns the same reference (no clone)
    assert.equal(experiencesOf(out!)[0].unitCost, 30);
    assert.equal(out!.pricing.netCost, 1000);
  });

  it('does not mutate the input experiences (source meal cost preserved)', () => {
    const q = makeQuote();
    redactQuoteV2CostMargin(q, false);
    assert.equal(experiencesOf(q)[0].unitCost, 30);
    assert.equal(experiencesOf(q)[1].unitCost, null);
  });
});
