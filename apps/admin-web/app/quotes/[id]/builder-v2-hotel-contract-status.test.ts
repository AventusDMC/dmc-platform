import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildHotelDiagnostics } from '../../../lib/quote-hotel-diagnostics';
import { getBlockingItems, getComponentStatuses } from '../../../lib/quote-helpers';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const hotelsSrc = read('../../../components/quote/v2/steps/hotels-step.tsx');
const helpersSrc = read('../../../lib/quote-helpers.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

const CONTRACTED_LINE = { contractLinked: true, contractName: 'Contractual Agreement of 2026', roomCategory: 'Deluxe Room', hasRate: true, pricingSummary: 'Rate USD 45.00 x 2 nights' };
const NO_CONTRACT_LINE = { contractLinked: false, contractName: null, roomCategory: 'Standard', hasRate: true, pricingSummary: 'Rate USD 80' };
const fbBase = { selected: true, editable: false, hasOptionSet: false, category: 'Unknown' as const, roomingSummary: '—', contractStatus: 'on-request' as const };

// Minimal Quote for the pure readiness helpers (only the fields they read).
function quoteWith(hotelOptions: any[], steps: any[] = [{ id: 'hotels', status: 'complete' }]) {
  return {
    itinerary: [], transport: [], experiences: [],
    hotelCities: [{ city: 'Amman', nights: 2, options: hotelOptions }],
    steps,
  } as any;
}
const opt = (contractStatus: string, selected = true, name = 'Amman West Hotel') => ({ id: 'h1', name, selected, contractStatus });

describe('Quote Builder V2 — hotel fallback contract-status cleanup (PR #567)', () => {
  // ---- exact status rule (adapter wiring) ----
  it('adapter promotes a hotel row to "contracted" when the matched line has a linked contract (both paths)', () => {
    contains(adapterSrc, [
      'optDiagnostics.contractState === "contracted" ? "contracted" : optDefaultContract',
      'fbDiagnostics.contractState === "contracted" ? "contracted" : "on-request"',
    ]);
  });

  // ---- 1. fallback hotel + matched priced line with linked contract → contracted ----
  it('fallback hotel with a matched contracted line → contractState "contracted"', () => {
    const d = buildHotelDiagnostics({ ...fbBase, matchedLine: CONTRACTED_LINE });
    assert.equal(d.contractState, 'contracted');
  });

  // ---- 3. fallback hotel with NO matched item → stays on request ----
  it('fallback hotel with no matched line → not contracted (stays on request via default)', () => {
    const d = buildHotelDiagnostics({ ...fbBase, matchedLine: null });
    assert.notEqual(d.contractState, 'contracted');
  });

  // ---- 4. fallback hotel matched but no contract → stays on request ----
  it('fallback hotel with a matched line but no contract → "on-request"', () => {
    const d = buildHotelDiagnostics({ ...fbBase, matchedLine: NO_CONTRACT_LINE });
    assert.equal(d.contractState, 'on-request');
  });

  // ---- 5. diagnostics still show contract/rate detail ----
  it('contracted diagnostics still expose the contract name + rate detail', () => {
    const d = buildHotelDiagnostics({ ...fbBase, matchedLine: CONTRACTED_LINE });
    const joined = d.reasons.join(' || ');
    assert.ok(joined.includes('Contracted'));
    assert.ok(joined.includes('Contractual Agreement of 2026'));
    assert.ok(joined.includes('Rate USD 45.00 x 2 nights'));
  });

  // ---- 2. contracted hotel is NOT in "Items to review" ----
  it('a contracted hotel is excluded from the advisory blocking/review list', () => {
    const items = getBlockingItems(quoteWith([opt('contracted')]));
    assert.equal(items.filter((i) => i.step === 'hotels').length, 0);
  });

  // ---- 4 (review list). on-request hotel stays in the review list ----
  it('an on-request hotel remains in the advisory blocking/review list', () => {
    const items = getBlockingItems(quoteWith([opt('on-request')]));
    const hotelItems = items.filter((i) => i.step === 'hotels');
    assert.equal(hotelItems.length, 1);
    assert.ok(/on request/i.test(hotelItems[0].label), hotelItems[0].label);
  });

  // ---- 6. cost-component "Hotels" status is unchanged (from the workflow step) ----
  it('Hotels cost-component status comes from the step, regardless of contract status', () => {
    // Even with an on-request hotel, the cost component stays "complete" (step-driven).
    const statuses = getComponentStatuses(quoteWith([opt('on-request')], [{ id: 'hotels', status: 'complete' }]));
    const hotels = statuses.find((s) => s.step === 'hotels');
    assert.equal(hotels?.status, 'complete');
    // getComponentStatuses logic itself is unchanged (step-derived, not contract-derived).
    contains(helpersSrc, ['quote.steps.find((s) => s.id === step)?.status']);
  });

  // ---- 7. no hotel edit/apply controls introduced ----
  it('hotels step still introduces no apply/edit controls and no fetch', () => {
    excludes(hotelsSrc, ['onApply', 'apply-preview', 'Apply', "method: 'POST'", 'fetch(']);
    contains(hotelsSrc, ['onSetPrimary', 'Contract on file']);
  });

  // ---- 8. change is gated only on the linked contract, not on any env/default flag ----
  it('promotion depends only on the linked contract (no env/flag dependency)', () => {
    excludes(adapterSrc, ['QUOTE_BUILDER_V2_DEFAULT']);
  });
});
