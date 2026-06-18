import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// ===========================================================================
// Phase AR2B — occupancy/basis note de-dup on the pricing page.
//
// The price card's snapshotHelper ends in a sentence period ("Based on 2 guests
// sharing.") while the pricing engine's equivalent context line is dotless
// ("Based on 2 guests sharing", see quote-pricing.service.ts). The proposal
// dedup used an exact-string match, so the dotted card line and the dotless
// bullet did NOT collapse and the occupancy basis rendered twice on page 10 —
// in every locale (the original P3 test masked it with a dotted fixture).
// AR2B normalizes trailing punctuation in the dedup key. These tests use the
// PRODUCTION (dotless) context line so they actually exercise the bug.
// ===========================================================================

const OCCUPANCY_RE = /غرفة مشتركة|habitación compartida|quarto partilhado|guests sharing/i;

// Mirrors the pricing engine's simple-FIXED display: a dotless occupancy basis,
// the distinct double/twin-room note, and a percentage line — plus a money total
// that lands in noteLines.
function quote(extra: Record<string, unknown> = {}) {
  return {
    id: 'q-ar2b', quoteCurrency: 'USD', title: 'Jordan Trip', adults: 2, children: 0, nightCount: 2, quoteOptions: [],
    totalSell: 2761.01, pricePerPax: 1380.51, pricingMode: 'FIXED', fixedPricePerPerson: 1380.51,
    currentPricing: { label: 'Package sell price per person', value: 1380.51 },
    itineraries: [{ id: 'd1', dayNumber: 1, title: 'Amman' }], quoteItems: [],
    priceComputation: {
      mode: 'simple', status: 'ok', warnings: [],
      display: {
        summaryLabel: 'Fixed price',
        contextLines: [
          'Based on 2 guests sharing', // dotless — as the pricing engine emits it
          'Accommodation in double/twin sharing room',
          'Applicable taxes are included at 5.00%.',
        ],
      },
    },
    ...extra,
  } as any;
}

function occupancyLines(vm: any): string[] {
  return [vm.investment?.snapshotHelper, ...(vm.investment?.basisLines || []), ...(vm.investment?.noteLines || [])]
    .filter(Boolean)
    .filter((l: string) => OCCUPANCY_RE.test(l));
}

// ---- 1. Arabic occupancy basis renders exactly once ------------------------
test('AR2B: the Arabic occupancy/basis note renders exactly once (dotless engine line de-duped)', () => {
  const vm: any = mapQuoteToProposalV3(quote(), 'ar');
  assert.equal(occupancyLines(vm).length, 1, 'shared-room basis appears once on the Arabic pricing page');
});

// ---- 2. Arabic price card still shows the intended basis/context line -------
test('AR2B: the Arabic price card still states the shared-room basis (snapshotHelper kept, with period)', () => {
  const vm: any = mapQuoteToProposalV3(quote(), 'ar');
  assert.equal(vm.investment.snapshotHelper, 'بناءً على ضيفين في غرفة مشتركة.', 'card context line preserved verbatim, period intact');
});

// ---- 3. Duplicate Arabic bullet is removed ---------------------------------
test('AR2B: the duplicate Arabic occupancy bullet is dropped, but distinct notes are kept', () => {
  const vm: any = mapQuoteToProposalV3(quote(), 'ar');
  const all = [...(vm.investment.basisLines || []), ...(vm.investment.noteLines || [])];
  assert.ok(!all.some((l: string) => OCCUPANCY_RE.test(l)), 'no basis/note line repeats the card occupancy basis');
  // The distinct double/twin-room note is NOT collateral damage.
  assert.ok(all.some((l: string) => /مزدوجة\/توأم|مشتركة/.test(l) && !/بناءً على/.test(l)), 'double/twin room note preserved');
});

// ---- 4. Spanish de-dup still works -----------------------------------------
test('AR2B: Spanish occupancy basis renders exactly once', () => {
  const vm: any = mapQuoteToProposalV3(quote(), 'es');
  assert.equal(occupancyLines(vm).length, 1, 'Spanish shared-room basis appears once');
  assert.equal(vm.investment.snapshotHelper, 'Según 2 huéspedes en habitación compartida.', 'Spanish card line unchanged');
});

// ---- 5. English / Portuguese render once, card lines unchanged -------------
test('AR2B: English and Portuguese occupancy basis render exactly once (card text unchanged)', () => {
  const en: any = mapQuoteToProposalV3(quote(), 'en');
  assert.equal(occupancyLines(en).length, 1, 'English shared-room basis appears once');
  assert.equal(en.investment.snapshotHelper, 'Based on 2 guests sharing.', 'English card line unchanged');
  const pt: any = mapQuoteToProposalV3(quote(), 'pt');
  assert.equal(occupancyLines(pt).length, 1, 'Portuguese shared-room basis appears once');
  assert.equal(pt.investment.snapshotHelper, 'Com base em 2 hóspedes em quarto partilhado.', 'Portuguese card line unchanged');
});

// ---- 6. Money + percentage lines are not accidentally removed --------------
test('AR2B: money totals and percentage notes survive the de-dup', () => {
  for (const loc of ['ar', 'es', 'en', 'pt'] as const) {
    const vm: any = mapQuoteToProposalV3(quote(), loc);
    const joined = [...(vm.investment.basisLines || []), ...(vm.investment.noteLines || [])].join(' || ');
    assert.match(joined, /دولار أمريكي|US\$|\$|2[.,]761/, `${loc}: money total still present`);
    assert.match(joined, /%|٪/, `${loc}: percentage note still present`);
  }
});
