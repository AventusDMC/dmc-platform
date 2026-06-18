import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { localizeProgramTitle, localizeStructuralDayTitle, localizePlaceName } from './proposal-i18n';

// ===========================================================================
// Phase MT2 — render-time multilingual title + day-title localization.
//   • curated program-title map (Quote.title is a single shared field)
//   • alias-aware place-token localization for stored day titles
// Stored data is never mutated; Spanish (the source language) stays identical.
// ===========================================================================

function quote(extra: Record<string, unknown> = {}) {
  return {
    id: 'q-mt2', quoteCurrency: 'USD', title: 'Jordania Clásica', adults: 2, children: 0, nightCount: 2, quoteOptions: [],
    totalSell: 2761.01, pricePerPax: 1380.51,
    itineraries: [{ id: 'd1', dayNumber: 1, title: 'Arrival Amman' }],
    quoteItems: [],
    quoteItineraryDays: [
      { id: 'p1', dayNumber: 1, title: 'Amman / Jerash / Amman', isActive: true, notes: null, notesLanguage: null, dayItems: [] },
      { id: 'p7', dayNumber: 7, title: 'Mar Muerto / Betania / Mar Muerto', isActive: true, notes: null, notesLanguage: null, dayItems: [] },
    ],
    ...extra,
  };
}

const dayTitle = (vm: any, n: number) => vm.days.find((d: any) => d.dayNumber === n)?.title;

// ---- 1. Program title -------------------------------------------------------
test('MT2: the program title localizes per locale (Q-2026-0079 "Jordania Clásica")', () => {
  assert.equal(mapQuoteToProposalV3(quote() as any, 'es').documentTitle, 'Jordania Clásica');
  assert.equal(mapQuoteToProposalV3(quote() as any, 'en').documentTitle, 'Classic Jordan');
  assert.equal(mapQuoteToProposalV3(quote() as any, 'pt').documentTitle, 'Jordânia Clássica');
  assert.equal(mapQuoteToProposalV3(quote() as any, 'ar').documentTitle, 'الأردن الكلاسيكي');
});

test('MT2: localizeProgramTitle is a no-op for unknown strong titles (all locales verbatim)', () => {
  for (const loc of ['es', 'en', 'pt', 'ar'] as const) {
    assert.equal(localizeProgramTitle(loc, 'Petra & Wadi Rum Explorer'), 'Petra & Wadi Rum Explorer');
  }
  // ...and the mapper leaves an unknown strong title unchanged in every locale.
  for (const loc of ['es', 'en', 'pt', 'ar'] as const) {
    const vm: any = mapQuoteToProposalV3(quote({ title: 'Petra & Wadi Rum Explorer' }) as any, loc);
    assert.equal(vm.documentTitle, 'Petra & Wadi Rum Explorer');
  }
});

// ---- 2. Day 07 (Spanish-authored slash title) ------------------------------
test('MT2: Day 07 "Mar Muerto / Betania / Mar Muerto" localizes per locale', () => {
  assert.equal(dayTitle(mapQuoteToProposalV3(quote() as any, 'es'), 7), 'Mar Muerto / Betania / Mar Muerto');
  assert.equal(dayTitle(mapQuoteToProposalV3(quote() as any, 'en'), 7), 'Dead Sea / Bethany / Dead Sea');
  assert.equal(dayTitle(mapQuoteToProposalV3(quote() as any, 'pt'), 7), 'Mar Morto / Betânia / Mar Morto');
  assert.equal(dayTitle(mapQuoteToProposalV3(quote() as any, 'ar'), 7), 'البحر الميت / المغطس / البحر الميت');
});

// ---- 3. Other day titles ----------------------------------------------------
test('MT2: "Amman / Jerash / Amman" — EN byte-identical, AR localized, ES/PT pass through', () => {
  assert.equal(dayTitle(mapQuoteToProposalV3(quote() as any, 'en'), 1), 'Amman / Jerash / Amman');
  assert.equal(dayTitle(mapQuoteToProposalV3(quote() as any, 'ar'), 1), 'عمّان / جرش / عمّان');
  assert.equal(dayTitle(mapQuoteToProposalV3(quote() as any, 'es'), 1), 'Amman / Jerash / Amman');
  assert.equal(dayTitle(mapQuoteToProposalV3(quote() as any, 'pt'), 1), 'Amman / Jerash / Amman');
});

// ---- alias-aware localizers (unit) -----------------------------------------
test('MT2: localizePlaceName resolves non-English aliases, incl. English→canonical', () => {
  assert.equal(localizePlaceName('en', 'Mar Muerto'), 'Dead Sea');
  assert.equal(localizePlaceName('en', 'Betania'), 'Bethany');
  assert.equal(localizePlaceName('pt', 'Mar Muerto'), 'Mar Morto');
  assert.equal(localizePlaceName('ar', 'Betania'), 'المغطس');
  assert.equal(localizePlaceName('es', 'Mar Muerto'), 'Mar Muerto');
  // Canonical English + unknown tokens are byte-identical in English.
  assert.equal(localizePlaceName('en', 'Dead Sea'), 'Dead Sea');
  assert.equal(localizePlaceName('en', 'Amman'), 'Amman');
  assert.equal(localizePlaceName('en', 'Aqaba'), 'Aqaba');
});

test('MT2: English structural day titles stay byte-identical except alias tokens', () => {
  // Alias title → localized.
  assert.equal(localizeStructuralDayTitle('en', 'Mar Muerto / Betania / Mar Muerto'), 'Dead Sea / Bethany / Dead Sea');
  // Ordinary English titles unchanged (no article drop, no slash reformat).
  assert.equal(localizeStructuralDayTitle('en', 'Arrival in Aqaba'), 'Arrival in Aqaba');
  assert.equal(localizeStructuralDayTitle('en', 'Arrival Amman'), 'Arrival Amman');
  assert.equal(localizeStructuralDayTitle('en', 'Departure'), 'Departure');
  assert.equal(localizeStructuralDayTitle('en', 'Amman / Jerash / Amman'), 'Amman / Jerash / Amman');
  assert.equal(localizeStructuralDayTitle('en', 'Petra Visit / Wadi Rum'), 'Petra Visit / Wadi Rum');
  assert.equal(localizeStructuralDayTitle('en', 'Free day at the Dead Sea'), 'Free day at the Dead Sea');
});

// ---- 4. Regression ----------------------------------------------------------
test('MT2: the mapper does not mutate stored quote.title or day.title', () => {
  const q: any = quote();
  const beforeTitle = q.title;
  const beforeDayTitles = q.quoteItineraryDays.map((d: any) => d.title);
  for (const loc of ['es', 'en', 'pt', 'ar'] as const) mapQuoteToProposalV3(q, loc);
  assert.equal(q.title, beforeTitle, 'quote.title untouched');
  assert.deepEqual(q.quoteItineraryDays.map((d: any) => d.title), beforeDayTitles, 'day.title untouched');
});

test('MT2: AR2/AR2B regressions hold — Arabic money + occupancy once + notes fallback', () => {
  const q = quote({
    priceComputation: { mode: 'simple', status: 'ok', warnings: [], display: { summaryLabel: 'Fixed price', contextLines: ['Based on 2 guests sharing', 'Accommodation in double/twin sharing room'] } },
    quoteItineraryDays: [
      { id: 'pn', dayNumber: 1, title: 'Petra', isActive: true, notes: 'Disfrute de la ciudad rosada.', notesLanguage: 'es', dayItems: [] },
    ],
  });
  const ar: any = mapQuoteToProposalV3(q as any, 'ar');
  // Arabic money unchanged (AR2).
  assert.equal(ar.pricingHighlightTotal, '2,761.01 دولار أمريكي');
  // Occupancy once (AR2B) across locales.
  for (const loc of ['ar', 'es', 'en', 'pt'] as const) {
    const vm: any = mapQuoteToProposalV3(q as any, loc);
    const all = [vm.investment?.snapshotHelper, ...(vm.investment?.basisLines || []), ...(vm.investment?.noteLines || [])].filter(Boolean);
    const occ = all.filter((l: string) => /غرفة مشتركة|habitación compartida|quarto partilhado|guests sharing/i.test(l));
    assert.equal(occ.length, 1, `${loc} occupancy once`);
  }
  // Notes-language fallback (AR2): es notes suppressed on the Arabic export.
  const day = ar.days.find((d: any) => d.dayNumber === 1);
  assert.doesNotMatch(day.summary || '', /Disfrute|ciudad rosada/i, 'Spanish notes suppressed in Arabic');
});
