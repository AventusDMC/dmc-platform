import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildProposalPricingViewModel } from './proposal-pricing';

// P1 (proposal QA, Issue 10) — the simple (fixed) pricing view model stated the occupancy
// basis twice: snapshotHelper "Based on N guests sharing." PLUS a redundant basisLine
// "Quotation prepared for N guests." In Spanish this rendered as a duplicated
// "Según N huéspedes…"-style note. The dedup drops the redundant basisLine; the single
// snapshotHelper basis remains and operator contextLines are preserved.

const formatMoney = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;

test('Issue 10: simple pricing states the occupancy basis once (snapshotHelper), no duplicate basisLine', () => {
  const vm = buildProposalPricingViewModel(
    { adults: 2, children: 0, pricingMode: 'FIXED', fixedPricePerPerson: 600 },
    'USD',
    formatMoney,
  );

  assert.equal(vm.mode, 'simple');
  assert.match(vm.snapshotHelper, /Based on 2 guests sharing/i, 'occupancy basis stated in snapshotHelper');
  for (const line of vm.basisLines) {
    assert.doesNotMatch(line, /Quotation prepared for/i, 'no redundant "Quotation prepared for N guests" basisLine');
  }
  // The guest count is not restated across snapshotHelper + basisLines.
  const occurrences = [vm.snapshotHelper, ...vm.basisLines].filter((l) => /\b2 guests?\b/i.test(l)).length;
  assert.equal(occurrences, 1, 'guest count appears exactly once');
});

test('Issue 10: operator-supplied contextLines are still preserved in basisLines', () => {
  const vm = buildProposalPricingViewModel(
    {
      adults: 2,
      children: 0,
      pricingMode: 'FIXED',
      fixedPricePerPerson: 600,
      priceComputation: {
        mode: 'simple',
        status: 'ok',
        warnings: [],
        display: { summaryLabel: 'Fixed price', contextLines: ['Includes all entrance fees.'] },
      },
    } as any,
    'USD',
    formatMoney,
  );
  assert.ok(vm.basisLines.includes('Includes all entrance fees.'), 'operator context line retained');
  assert.ok(!vm.basisLines.some((l) => /Quotation prepared for/i.test(l)), 'still no duplicate occupancy note');
});
