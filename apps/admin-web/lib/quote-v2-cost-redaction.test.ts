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
    // meta.publicToken is a capability token handled on a SEPARATE track — the
    // redactor must NOT touch it (asserted in the CP-N1b block).
    meta: { publicToken: 'tok_capability_untouched', publicEnabled: true },
    pricing: {
      lines: [
        // Non-empty notes carry the engine pricingDescription (mixed internal text).
        { id: 'l1', label: 'Hotels', amount: 800, status: 'complete', note: 'Contracted | Supplier discount 25% applied' },
        { id: 'l2', label: 'Transport', amount: 200, status: 'complete', note: 'Point To Point | Amman -> Petra | Sedan' },
      ],
      netCost: 1000,
      markupPercent: 25,
      margin: 250,
      sellingPrice: 1250,
      pax: 2,
      perPerson: 625,
      currency: 'USD',
    },
    transport: [
      // Assigned real supplier → becomes "Assigned" for restricted roles.
      { id: 't1', amount: 200, supplier: 'Desert Compass Transport', supplierContract: 'on-request', route: 'Amman -> Petra' },
      // Genuinely unassigned → stays "Unassigned".
      { id: 't2', amount: 0, supplier: 'Unassigned', supplierContract: 'no-contract', route: 'Petra -> Wadi Rum' },
      // Blank → fail closed to "Unassigned" (no crash, no leak).
      { id: 't3', amount: 0, supplier: '  ', supplierContract: 'no-contract', route: 'blank' },
      // Case/whitespace variant of unassigned → normalized to "Unassigned".
      { id: 't4', amount: 0, supplier: '  UNASSIGNED  ', supplierContract: 'no-contract', route: 'case variant' },
      // Non-string (malformed runtime) → fail closed to "Unassigned".
      { id: 't5', amount: 0, supplier: null, supplierContract: 'no-contract', route: 'malformed' },
    ],
    experiences: [
      // Meal item: the supplier cost rides here as unitCost (the leak CP-Sb fixes).
      { id: 'e1', amount: 90, isMeal: true, unitCost: 30, quantity: 1, currency: 'USD' },
      // Non-meal item: the adapter already sets unitCost null — must stay null.
      { id: 'e2', amount: 120, unitCost: null },
      // unitCost field absent entirely — redaction must still yield null (no leak).
      { id: 'e3', amount: 50 },
    ],
    hotelCities: [
      {
        id: 'c1',
        options: [
          // Contracted option: reasons embed contract name + Classic rate text.
          {
            id: 'o1',
            diagnostics: {
              contractState: 'contracted',
              hasRate: true,
              source: 'option-set',
              reasons: [
                'Contracted — a supplier contract is linked in Classic ("Petra Moon Hotel").',
                'Rate on file (from Classic): 120 USD | Standard Room',
              ],
            },
          },
          // On-request option: a non-sensitive reason.
          {
            id: 'o2',
            diagnostics: {
              contractState: 'on-request',
              hasRate: false,
              source: 'itinerary',
              reasons: ['On request — no supplier contract is linked.'],
            },
          },
          // No diagnostics at all → must be handled safely (left as-is).
          { id: 'o3' },
        ],
      },
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

// ---------------------------------------------------------------------------
// CP-N1b — non-finance internal-metadata redaction:
//   A transport[].supplier  (identity → assignment-truthful sentinel)
//   B pricing.lines[].note   (pricingDescription → "")
//   C hotelCities[].options[].diagnostics.reasons (contract/rate text → [])
// meta.publicToken is a SEPARATE track and must stay untouched.
// ---------------------------------------------------------------------------

function transportOf(q: Quote) {
  return (q as unknown as {
    transport: { id: string; supplier: string; supplierContract: string; amount: number }[];
  }).transport;
}
function linesOf(q: Quote) {
  return q.pricing.lines as unknown as { id: string; label: string; amount: number; note: string }[];
}
function optionsOf(q: Quote) {
  return (q as unknown as {
    hotelCities: { options: { id: string; diagnostics?: { contractState: string; hasRate: boolean; source: string; reasons: string[] } }[] }[];
  }).hotelCities[0].options;
}
function metaOf(q: Quote) {
  return (q as unknown as { meta: { publicToken: string | null; publicEnabled?: boolean } }).meta;
}

describe('redactQuoteV2CostMargin — CP-N1b internal-metadata redaction', () => {
  // ---- Finance preservation (exact) ----
  for (const role of FINANCE_ROLES) {
    it(`finance role "${role}" retains supplier / note / reasons exactly (same reference)`, () => {
      const q = makeQuote();
      const out = redactQuoteV2CostMargin(q, canAccessFinance(role))!;
      assert.equal(out, q); // exact early-return identity
      assert.equal(transportOf(out)[0].supplier, 'Desert Compass Transport');
      assert.equal(linesOf(out)[0].note, 'Contracted | Supplier discount 25% applied');
      assert.deepEqual(optionsOf(out)[0].diagnostics!.reasons.length, 2);
      assert.equal(experiencesOf(out)[0].unitCost, 30);
    });
  }

  // ---- A. transport[].supplier ----
  it('A: restricted maps real supplier → "Assigned" and genuine/blank/malformed → "Unassigned"', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    const t = transportOf(out);
    assert.equal(t[0].supplier, 'Assigned');    // real name replaced
    assert.equal(t[1].supplier, 'Unassigned');  // genuine unassigned
    assert.equal(t[2].supplier, 'Unassigned');  // blank → fail closed
    assert.equal(t[3].supplier, 'Unassigned');  // case/whitespace variant
    assert.equal(t[4].supplier, 'Unassigned');  // non-string → fail closed
  });
  it('A: "Assigned" does not trigger the UI unassigned-state logic', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    // mirrors transport-step.tsx:46 — only literal (lowercased) "unassigned" is unassigned
    assert.equal(transportOf(out)[0].supplier.toLowerCase() === 'unassigned', false);
  });
  it('A: supplierContract and other transport fields are preserved', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.equal(transportOf(out)[0].supplierContract, 'on-request');
    assert.equal(transportOf(out)[0].amount, 200);
    assert.equal((transportOf(out)[0] as unknown as { route: string }).route, 'Amman -> Petra');
  });
  it('A: no original supplier name survives in the restricted payload', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.equal(JSON.stringify(transportOf(out)).includes('Desert Compass'), false);
  });
  it('A: supplier type stays a non-null string for every row', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    for (const t of transportOf(out)) assert.equal(typeof t.supplier, 'string');
  });

  // ---- B. pricing.lines[].note ----
  it('B: restricted blanks every note to "" while keeping label/selling', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.deepEqual(linesOf(out).map((l) => l.note), ['', '']);
    assert.deepEqual(linesOf(out).map((l) => l.label), ['Hotels', 'Transport']);
    assert.equal(out.pricing.sellingPrice, 1250);
  });
  it('B: no pricingDescription/discount text survives in any note alias', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    const blob = JSON.stringify(linesOf(out));
    assert.equal(blob.includes('discount'), false);
    assert.equal(blob.includes('Point To Point'), false);
  });

  // ---- C. hotel diagnostics.reasons ----
  it('C: restricted empties reasons[] but keeps structured contractState/hasRate/source', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    const opts = optionsOf(out);
    assert.deepEqual(opts[0].diagnostics!.reasons, []);
    assert.deepEqual(opts[1].diagnostics!.reasons, []);
    assert.equal(opts[0].diagnostics!.contractState, 'contracted');
    assert.equal(opts[0].diagnostics!.hasRate, true);
    assert.equal(opts[0].diagnostics!.source, 'option-set');
    assert.equal(opts[1].diagnostics!.contractState, 'on-request');
  });
  it('C: options without diagnostics are handled safely', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.equal(optionsOf(out)[2].diagnostics, undefined);
  });
  it('C: no contract name / rate / room-category text survives in hotelCities', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    const blob = JSON.stringify((out as unknown as { hotelCities: unknown }).hotelCities);
    assert.equal(blob.includes('Petra Moon'), false);
    assert.equal(blob.includes('Rate on file'), false);
    assert.equal(blob.includes('Standard Room'), false);
  });

  // ---- meta.publicToken untouched (separate track) ----
  it('meta.publicToken is NOT touched by the redactor (separate security track)', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.equal(metaOf(out).publicToken, 'tok_capability_untouched');
    assert.equal(metaOf(out).publicEnabled, true);
  });

  // ---- Fail-closed for unknown/undefined/null roles ----
  it('unknown / undefined / null roles fail closed for A/B/C', () => {
    for (const pred of [
      canAccessFinance('marketing' as unknown as SessionRole),
      canAccessFinance(undefined),
      canAccessFinance(null),
    ]) {
      const out = redactQuoteV2CostMargin(makeQuote(), pred)!;
      assert.equal(transportOf(out)[0].supplier, 'Assigned');
      assert.deepEqual(linesOf(out).map((l) => l.note), ['', '']);
      assert.deepEqual(optionsOf(out)[0].diagnostics!.reasons, []);
    }
  });

  // ---- Immutability ----
  it('does not mutate the input transport / notes / diagnostics', () => {
    const q = makeQuote();
    redactQuoteV2CostMargin(q, false);
    assert.equal(transportOf(q)[0].supplier, 'Desert Compass Transport');
    assert.equal(linesOf(q)[0].note, 'Contracted | Supplier discount 25% applied');
    assert.deepEqual(optionsOf(q)[0].diagnostics!.reasons.length, 2);
  });

  // ---- Regression: CP-Sb meal + pricing.* still correct under the enriched fixture ----
  it('regression: meal unitCost and pricing.* redaction remain correct', () => {
    const out = redactQuoteV2CostMargin(makeQuote(), false)!;
    assert.equal(experiencesOf(out)[0].unitCost, null);
    assert.equal(out.pricing.netCost, 0);
    assert.equal(out.pricing.margin, 0);
    assert.equal(out.pricing.markupPercent, 0);
    assert.deepEqual(out.pricing.lines.map((l) => l.amount), [0, 0]);
  });
});
