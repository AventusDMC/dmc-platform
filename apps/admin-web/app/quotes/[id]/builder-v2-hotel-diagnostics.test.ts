import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildHotelDiagnostics } from '../../../lib/quote-hotel-diagnostics';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const hotelsSrc = read('../../../components/quote/v2/steps/hotels-step.tsx');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const typesSrc = read('../../../lib/quote-types.ts');
const sidebarSrc = read('../../../components/quote/v2/quote-summary-sidebar.tsx');
const helpersSrc = read('../../../lib/quote-helpers.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

const base = {
  selected: true,
  editable: false,
  hasOptionSet: false,
  category: 'Unknown' as const,
  roomingSummary: '—',
  contractStatus: 'on-request' as const,
  matchedLine: null as any,
};
const joined = (r: string[]) => r.join(' || ');

describe('Quote Builder V2 — hotel diagnostics (PR #566, read-only)', () => {
  // ---- 1. on-request hotel renders a diagnostic ----
  it('on-request: selected hotel with a priced line but NO contract', () => {
    const d = buildHotelDiagnostics({
      ...base, selected: true,
      matchedLine: { contractLinked: false, contractName: null, roomCategory: 'Deluxe Room', hasRate: true, pricingSummary: 'Rate USD 99 x 1 night' },
    });
    assert.equal(d.contractState, 'on-request');
    assert.ok(/on request/i.test(joined(d.reasons)), joined(d.reasons));
  });

  // ---- 2. contracted hotel shows correct status ----
  it('contracted: priced line has a linked contract → contractState contracted + contract name', () => {
    const d = buildHotelDiagnostics({
      ...base, selected: true,
      matchedLine: { contractLinked: true, contractName: 'Contractual Agreement for Petra Moon Hotel 2026', roomCategory: 'Standard Room', hasRate: true, pricingSummary: 'Rate USD 110 x 1 night' },
    });
    assert.equal(d.contractState, 'contracted');
    assert.ok(joined(d.reasons).includes('Contracted'));
    assert.ok(joined(d.reasons).includes('Contractual Agreement for Petra Moon Hotel 2026'));
    assert.equal(d.hasRate, true);
  });

  // ---- 3. missing-rate / fallback hotel shows a clear read-only explanation ----
  it('missing rate: contracted line with no cost → "No rate found" explanation', () => {
    const d = buildHotelDiagnostics({
      ...base, matchedLine: { contractLinked: true, contractName: 'C', roomCategory: 'Std', hasRate: false, pricingSummary: null },
    });
    assert.equal(d.hasRate, false);
    assert.ok(/no rate found/i.test(joined(d.reasons)), joined(d.reasons));
  });

  it('itinerary-fallback (no option-set) is flagged as imported', () => {
    const d = buildHotelDiagnostics({ ...base, editable: false, hasOptionSet: false, matchedLine: null });
    assert.equal(d.source, 'itinerary');
    assert.ok(/imported from the itinerary/i.test(joined(d.reasons)), joined(d.reasons));
    assert.equal(d.contractState, 'unknown');
    assert.ok(/no priced hotel line matched/i.test(joined(d.reasons)));
  });

  it('option-set alternative (not selected, with options) is flagged as alternative, not imported', () => {
    const d = buildHotelDiagnostics({ ...base, selected: false, editable: true, hasOptionSet: true, matchedLine: null });
    assert.equal(d.source, 'option-set');
    assert.ok(/alternative option/i.test(joined(d.reasons)));
    excludes(joined(d.reasons), ['Imported from the itinerary']);
  });

  it('missing room category produces a clear note', () => {
    const d = buildHotelDiagnostics({
      ...base, matchedLine: { contractLinked: true, contractName: 'C', roomCategory: null, hasRate: true, pricingSummary: 'x' },
    });
    assert.ok(/room category not set/i.test(joined(d.reasons)), joined(d.reasons));
  });

  // ---- adapter wiring ----
  it('adapter builds diagnostics from the priced hotel line in both hotel paths', () => {
    contains(adapterSrc, [
      'buildHotelDiagnostics({',
      'const hotelLineByName = new Map<string, MatchedHotelLine>()',
      'contractLinked: Boolean(it.contract)',
      // matched line is extracted (also reused for the hotel-preview target id)
      'const optMatched = matchHotelLine(ho.hotelNameSnapshot ?? "")',
      'const fbMatched = matchHotelLine(h.name)',
      'matchedLine: optMatched',
      'matchedLine: fbMatched',
    ]);
    contains(typesSrc, ['diagnostics?: import("./quote-hotel-diagnostics").HotelDiagnostics']);
  });

  // ---- UI: read-only, Why? expandable, clarification banner ----
  it('hotels step shows a read-only "Why?" expandable + the complete-vs-review clarification', () => {
    contains(hotelsSrc, [
      'Why?',
      'diagnostics?.reasons',
      'setShowWhy',
      'Hotels &ldquo;complete&rdquo;',
      'Items to review',
      'edit in Classic Builder',
    ]);
  });

  // ---- 6. mutations stay delegated — the step performs no direct fetch/POST ----
  it('hotels step performs no direct fetch/POST (apply delegated to onApplyItemPricing, PR #578)', () => {
    excludes(hotelsSrc, ['apply-preview', "method: 'POST'", 'fetch(']);
    // Set-as-primary (PATCH isPrimary) and hotel apply both delegate to handlers.
    contains(hotelsSrc, ['onSetPrimary']);
  });

  // ---- 4 + 5. cost-component "Complete" + readiness "Items to review" wording unchanged ----
  it('cost-component status + advisory "Items to review" wording are unchanged (no readiness logic change)', () => {
    // getComponentStatuses still derives hotel status from the workflow step (unchanged).
    contains(helpersSrc, ["{ step: \"hotels\", label: \"Hotels\" }", 'quote.steps.find((s) => s.id === step)?.status']);
    // readiness card still advisory (from PR #563), untouched here.
    contains(sidebarSrc, ['Items to review (', "affect the checklist above or block sending"]);
  });
});
