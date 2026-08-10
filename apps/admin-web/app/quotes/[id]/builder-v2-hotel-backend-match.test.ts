import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildHotelDiagnostics } from '../../../lib/quote-hotel-diagnostics';

// Frontend H-A: the V2 adapter consumes the backend-computed H-A1 hotel-option match
// metadata (matchedPricedQuoteItemId / pricingMatchStatus / pricingMatchReason /
// matchedDiscriminators). Matched rows resolve pricedQuoteItemId directly; ambiguous/
// none keep it undefined; missing metadata falls back to the legacy FE heuristic. No
// pricing math, no backend/route/flag change, no cost/PII surfaced. The pure decision
// core is unit-tested in lib/quote-hotel-line-match.test.ts.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const hotelsSrc = read('../../../components/quote/v2/steps/hotels-step.tsx');
const matchSrc = read('../../../lib/quote-hotel-line-match.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

describe('Frontend H-A — adapter consumes backend hotel-option match metadata', () => {
  it('adapter prefers backend metadata via resolveBackendHotelOptionMatch, else the heuristic matcher', () => {
    contains(adapterSrc, [
      'resolveBackendHotelOptionMatch',
      'const backendMatch = resolveBackendHotelOptionMatch(ho)',
      'if (backendMatch.source === "backend")',
      // heuristic remains as the fallback branch (older payloads never regress)
      'const optMatch = matchHotelRow({ hotelId: ho.hotelId, roomCategoryId: ho.roomCategoryId, name: ho.hotelNameSnapshot })',
    ]);
  });

  it('adapter sets pricedQuoteItemId / pricingMatchAmbiguous from the resolved match', () => {
    contains(adapterSrc, [
      'pricedQuoteItemId: optPricedQuoteItemId',
      'pricingMatchAmbiguous: optAmbiguous',
    ]);
  });

  it('backend-matched diagnostics detail is sourced from the SAME option set\'s priced items', () => {
    // The top-level heuristic index excludes option-scoped items, so a backend match
    // must look up its detail in opt.quoteItems (added to the ApiQuoteOption type).
    contains(adapterSrc, [
      '(opt.quoteItems ?? []).find((it) => it.id === optPricedQuoteItemId && it.hotelId)',
      'quoteItems?: ApiQuoteItem[] | null',
    ]);
  });

  it('ApiHotelOption carries exactly the safe H-A1 metadata fields', () => {
    contains(adapterSrc, [
      'matchedPricedQuoteItemId?: string | null',
      'pricingMatchStatus?: "matched" | "ambiguous" | "none" | null',
      'pricingMatchReason?: string | null',
      'matchedDiscriminators?: {',
    ]);
  });

  it('the added metadata type exposes NO cost / margin / rate / raw contract or hotel object', () => {
    // Isolate the ApiHotelOption metadata block and assert only safe keys appear.
    const start = adapterSrc.indexOf('matchedPricedQuoteItemId?: string | null');
    const block = adapterSrc.slice(start, start + 500);
    excludes(block, ['cost', 'margin', 'sellPrice', 'baseCost', 'rate', 'supplier', 'password', 'passport', 'HotelRate', 'HotelContract']);
    // matchedDiscriminators keys are the safe, non-cost/non-PII set only.
    for (const k of ['roomCategoryId', 'mealPlan', 'mealPlanCode', 'occupancyType', 'seasonName', 'serviceDate', 'optionId']) {
      assert.ok(block.includes(k), `discriminator key ${k} expected`);
    }
  });

  it('the heuristic matcher is retained as a compatibility fallback (not removed)', () => {
    contains(matchSrc, ['export function matchPricedHotelLine']);
    contains(adapterSrc, ['matchPricedHotelLine, resolveBackendHotelOptionMatch']);
  });
});

describe('Frontend H-A — UI gating still keys on pricedQuoteItemId (unchanged)', () => {
  it('hotel preview/apply/View gate on pricedQuoteItemId + existing flags (unchanged)', () => {
    contains(hotelsSrc, [
      'const canPreview = Boolean(onPreviewItem && hotel.pricedQuoteItemId && hotelPreviewEnabled)',
      'const canApply = Boolean(canPreview && onApplyItemPricing && hotelApplyEnabled && hotel.pricedQuoteItemId)',
      'const canViewContract = Boolean(onViewHotelContract && hotel.pricedQuoteItemId)',
    ]);
  });

  it('ambiguous rows (no id + pricingMatchAmbiguous) still show the "resolve in Classic" note, no preview/apply', () => {
    contains(hotelsSrc, [
      'hotel.pricingMatchAmbiguous && !hotel.pricedQuoteItemId',
      'Multiple priced hotel lines match this hotel',
    ]);
  });
});

describe('Frontend H-A — backend-matched row reads as contract-on-file', () => {
  it('a matched, contracted priced line yields contractState "contracted" (no on-request conflict)', () => {
    // The adapter builds this line from the matched option-scoped item; a backend
    // "matched" always has a linked contract.
    const d = buildHotelDiagnostics({
      selected: true, editable: true, hasOptionSet: true, category: '4-Star', roomingSummary: 'DBL',
      contractStatus: 'on-request',
      matchedLine: { quoteItemId: 'it1', contractLinked: true, contractName: 'QA Hotel Contract 2026', roomCategory: 'Standard Room', hasRate: true, pricingSummary: 'Rate on file' },
    });
    assert.equal(d.contractState, 'contracted');
  });

  it('backend none / no-contract (matchedLine null) stays non-contracted → Classic fallback', () => {
    const d = buildHotelDiagnostics({
      selected: true, editable: true, hasOptionSet: true, category: '4-Star', roomingSummary: 'DBL',
      contractStatus: 'on-request', matchedLine: null,
    });
    assert.notEqual(d.contractState, 'contracted');
  });
});
