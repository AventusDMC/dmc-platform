import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildProposalPricingViewModel } from './proposal-pricing';
import { localizeSnapshotLabel, proposalLabel } from './proposal-i18n';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// P2-2 (proposal QA, Issue 2) — the simple/fixed per-person snapshot showed the engine's
// generic "Fixed price" label, which localized to the ambiguous "Precio fijo" in Spanish.
// It now surfaces a clear per-person label ("Precio por persona"). The pricing amounts and
// the standalone localizeSnapshotLabel('Fixed price') mapping are unchanged.

const fmt = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`;

test('Issue 2: simple/fixed snapshot relabels "Fixed price" → per-person source label', () => {
  const vm = buildProposalPricingViewModel(
    { adults: 2, children: 0, pricingMode: 'FIXED', fixedPricePerPerson: 600, currentPricing: { label: 'Fixed price', value: 600 } },
    'USD',
    fmt,
  );
  assert.equal(vm.mode, 'simple');
  assert.equal(vm.snapshotLabel, 'Price per person', 'ambiguous "Fixed price" is relabeled');
});

test('Issue 2: an operator-authored custom label is preserved (only "Fixed price" is relabeled)', () => {
  const vm = buildProposalPricingViewModel(
    { adults: 2, children: 0, pricingMode: 'FIXED', fixedPricePerPerson: 600, currentPricing: { label: 'Honeymoon special', value: 600 } },
    'USD',
    fmt,
  );
  assert.equal(vm.snapshotLabel, 'Honeymoon special');
});

test('Issue 2: "Price per person" localizes to Spanish "Precio por persona"', () => {
  assert.equal(localizeSnapshotLabel('es', 'Price per person'), 'Precio por persona');
  assert.equal(localizeSnapshotLabel('en', 'Price per person'), 'Price per Person');
  assert.equal(localizeSnapshotLabel('pt', 'Price per person'), 'Preço por pessoa');
});

test('Issue 2: localizeSnapshotLabel("Fixed price") mapping is unchanged (no regression)', () => {
  assert.equal(localizeSnapshotLabel('es', 'Fixed price'), 'Precio fijo');
  assert.equal(localizeSnapshotLabel('en', 'Fixed price'), 'Fixed price');
});

test('Issue 2: end-to-end — a FIXED quote renders "Precio por persona" (not "Precio fijo") in es', () => {
  const quote: any = {
    id: 'q-fixed',
    quoteCurrency: 'USD',
    title: 'Jordan Discovery',
    adults: 2,
    children: 0,
    nightCount: 0,
    quoteOptions: [],
    itineraries: [{ id: 'd1', dayNumber: 1, title: 'Day 1: Amman' }],
    quoteItems: [],
    pricingMode: 'FIXED',
    fixedPricePerPerson: 600,
    pricePerPax: 600,
    currentPricing: { label: 'Fixed price', value: 600 },
  };
  const vm: any = mapQuoteToProposalV3(quote, 'es');
  assert.equal(vm.investment.snapshotLabel, 'Precio por persona');
  assert.notEqual(vm.investment.snapshotLabel, 'Precio fijo');
});

test('Issue 2: "Precio total del paquete" remains the cover total-price label', () => {
  assert.equal(proposalLabel('es', 'totalPackagePrice'), 'Precio total del paquete');
});
