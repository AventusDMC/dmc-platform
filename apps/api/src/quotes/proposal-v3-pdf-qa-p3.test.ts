import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { localizePricingLine } from './proposal-i18n';
import { ProposalV3Service } from './proposal-v3.service';

// P3 — remaining Spanish-PDF template/code fixes from Q-2026-0079:
//   Issue 1 logo fallback hardening · Issue 2 localized title fallback ·
//   Issue 7 occupancy-note de-dup · Issue 8 Spanish money decimal separator.

function fixedQuote(extra: Record<string, unknown> = {}) {
  return {
    id: 'q-p3', quoteCurrency: 'USD', title: 'test101', adults: 2, children: 0, nightCount: 0, quoteOptions: [],
    itineraries: [{ id: 'd1', dayNumber: 1, title: 'Day 1: Amman' }],
    quoteItems: [
      { id: 'h1', itineraryId: 'd1', service: { name: 'Amman Hotel', category: 'Hotel', serviceType: { name: 'Hotel', code: 'HOTEL' } }, hotel: { name: 'Amman Hotel', city: 'Amman' }, roomCategory: { name: 'Std' }, mealPlan: 'BB', totalCost: 100, totalSell: 120 },
    ],
    pricingMode: 'FIXED', fixedPricePerPerson: 600, pricePerPax: 600,
    currentPricing: { label: 'Fixed price', value: 600 },
    ...extra,
  };
}

// ---- Issue 2 — localized cover-title fallback (no English leak) -------------------------------
test('Issue 2: a weak title in Spanish falls back to "Propuesta de viaje: <dest>" (no "Travel Proposal")', () => {
  const vm: any = mapQuoteToProposalV3(fixedQuote() as any, 'es');
  assert.doesNotMatch(vm.documentTitle, /Travel Proposal/i, 'no English "Travel Proposal" on a Spanish cover');
  assert.match(vm.documentTitle, /^Propuesta de viaje:/, 'localized Spanish fallback');
});

test('Issue 2: English cover title is unchanged ("<dest> Travel Proposal")', () => {
  const en: any = mapQuoteToProposalV3(fixedQuote() as any, 'en');
  assert.match(en.documentTitle, /Travel Proposal$/, 'EN byte-identical fallback');
});

// ---- Issue 8 — Spanish money uses a comma decimal separator -----------------------------------
test('Issue 8: an unmatched pricing line money amount is comma-formatted in Spanish', () => {
  assert.equal(localizePricingLine('es', 'Internal reference 2794.85 US$'), 'Internal reference 2794,85 US$');
  assert.equal(localizePricingLine('pt', 'Internal reference 2794.85 US$'), 'Internal reference 2794,85 US$');
});

test('Issue 8: a matched pricing line keeps its translation AND comma-formats the amount', () => {
  assert.equal(localizePricingLine('es', 'Total Package Price: 2794.85 US$'), 'Precio total del paquete: 2794,85 US$');
});

test('Issue 8: English is unchanged and already-localized amounts are NOT mangled', () => {
  assert.equal(localizePricingLine('en', 'Total Package Price: 2794.85 US$'), 'Total Package Price: 2794.85 US$');
  // already es-formatted ("." = thousands, "," = decimal) must pass through untouched
  assert.equal(localizePricingLine('es', 'Total Package Price: 2.794,85 US$'), 'Precio total del paquete: 2.794,85 US$');
  // a bare percentage is not money → not touched
  assert.equal(localizePricingLine('es', 'Applicable taxes are included at 5.00%.'), 'Los impuestos aplicables están incluidos al 5.00%.');
});

// ---- Issue 7 — occupancy basis note appears only once -----------------------------------------
test('Issue 7: the occupancy basis note is not duplicated across snapshotHelper + basis/note lines', () => {
  const quote = fixedQuote({
    priceComputation: { mode: 'simple', status: 'ok', warnings: [], display: { summaryLabel: 'Fixed price', contextLines: ['Based on 2 guests sharing.'] } },
  });
  const vm: any = mapQuoteToProposalV3(quote as any, 'es');
  const helper = vm.investment.snapshotHelper;
  assert.match(helper, /Según 2 huéspedes en habitación compartida/, 'occupancy basis stated in snapshotHelper');
  const all = [...(vm.investment.basisLines || []), ...(vm.investment.noteLines || [])];
  assert.ok(!all.includes(helper), 'the basis/note lines do not repeat the snapshotHelper');
  const occurrences = [helper, ...all].filter((l) => /huéspedes en habitación compartida/.test(l)).length;
  assert.equal(occurrences, 1, 'occupancy basis appears exactly once');
});

// ---- Issue 1 — logo fallback hardening (no broken remote src in the network-less PDF) ---------
test('Issue 1: an unreachable remote logo falls back to the embedded AXIS data URI', async () => {
  const service: any = new ProposalV3Service({} as any);
  const resolved = await service.resolveLogoForRender('https://nonexistent.invalid/logo.png');
  assert.match(resolved, /^data:image\/png;base64,/, 'remote-fetch failure → embedded data URI');
});

test('Issue 1: data URIs + empty pass through unchanged; relative paths now fall back to embedded (P4)', async () => {
  const service: any = new ProposalV3Service({} as any);
  assert.equal(await service.resolveLogoForRender('data:image/png;base64,QUJD'), 'data:image/png;base64,QUJD');
  assert.equal(await service.resolveLogoForRender(''), '');
  // P4 — a relative "/uploads/…"-style path is unreachable in the network-less PDF, so it now
  // falls back to the embedded AXIS data URI instead of passing through as a broken src.
  assert.match(await service.resolveLogoForRender('/brand/logo.png'), /^data:image\/png;base64,/);
});
