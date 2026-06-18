import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { ProposalV3Service } from './proposal-v3.service';
import { localizePlaceName, localizePricingLine, formatGuestCount } from './proposal-i18n';

// ===========================================================================
// Phase AR2 — Arabic proposal/PDF QA, CODE/i18n ONLY (no DB/quote/catalog
// mutation). Covers: Arabic destination localization, language-aware notes
// fallback (generic across locales), Arabic money "<amount> دولار أمريكي",
// Arabic dual/singular guest grammar, footer/contact integrity, and the
// guarantee that official catalog/service names are NOT translated.
// ===========================================================================

const SPANISH_NOTES =
  'Tras el desayuno, disfrute de una visita guiada por la ciudad rosada de Petra.';

function plannerQuote(extra: Record<string, unknown> = {}) {
  return {
    id: 'q-ar',
    quoteCurrency: 'USD',
    title: 'Jordania Clásica',
    adults: 2,
    children: 0,
    nightCount: 2,
    quoteOptions: [],
    totalSell: 2761.01,
    pricePerPax: 1380.5,
    brandCompany: { name: 'Axis DMC', branding: { website: 'www.axisdmc.com', email: 'contact@axisdmc.com' } },
    itineraries: [
      { id: 'd1', dayNumber: 1, title: 'Amman' },
      { id: 'd2', dayNumber: 2, title: 'Petra' },
    ],
    quoteItems: [],
    quoteItineraryDays: [
      { id: 'p1', dayNumber: 1, title: 'Amman', isActive: true, notes: null, notesLanguage: null, dayItems: [] },
      { id: 'p2', dayNumber: 2, title: 'Petra', isActive: true, notes: SPANISH_NOTES, notesLanguage: 'es', dayItems: [] },
    ],
    ...extra,
  };
}

function arabicGlyphs(value: string): boolean {
  return /[؀-ۿ]/.test(value);
}

// ---- 1. Arabic destination localization ------------------------------------
test('AR2: the Jordan destinations carry Arabic display names; EN/ES/PT keep the proper noun', () => {
  const cases: Array<[string, string]> = [
    ['Amman', 'عمّان'],
    ['Petra', 'البتراء'],
    ['Petra / Wadi Musa', 'البتراء / وادي موسى'],
    ['Wadi Musa', 'وادي موسى'],
    ['Wadi Rum', 'وادي رم'],
    ['Madaba', 'مادبا'],
    ['Jerash', 'جرش'],
    ['Dead Sea', 'البحر الميت'],
  ];
  for (const [en, ar] of cases) {
    assert.equal(localizePlaceName('ar', en), ar, `${en} → ${ar} in Arabic`);
    // EN/ES/PT preserve the proper noun exactly (Dead Sea is the one with es/pt names).
    assert.equal(localizePlaceName('en', en), en, `${en} unchanged in English`);
    if (en !== 'Dead Sea') {
      assert.equal(localizePlaceName('es', en), en, `${en} unchanged in Spanish`);
      assert.equal(localizePlaceName('pt', en), en, `${en} unchanged in Portuguese`);
    }
  }
});

test('AR2: an Arabic render surfaces an Arabic destination name (not a bare Latin one)', () => {
  const vm: any = mapQuoteToProposalV3(plannerQuote() as any, 'ar');
  assert.ok(arabicGlyphs(vm.destinationLine), 'destination line contains Arabic place glyphs');
});

// ---- 2/3. Language-aware notes fallback (generic across locales) ------------
test('AR2: an Arabic export suppresses Spanish stored notes and uses the generated Arabic narrative', () => {
  const vm: any = mapQuoteToProposalV3(plannerQuote() as any, 'ar');
  const day = vm.days.find((d: any) => d.dayNumber === 2);
  assert.ok(day, 'day 2 exists');
  assert.doesNotMatch(day.summary || '', /Tras el desayuno|disfrute/i, 'no Spanish notes on the Arabic export');
  assert.ok(day.summary && arabicGlyphs(day.summary), 'a generated Arabic narrative replaces the suppressed notes');
});

test('AR2: an English export suppresses Spanish stored notes and uses the generated English narrative', () => {
  const vm: any = mapQuoteToProposalV3(plannerQuote() as any, 'en');
  const day = vm.days.find((d: any) => d.dayNumber === 2);
  assert.doesNotMatch(day.summary || '', /Tras el desayuno|disfrute/i, 'no Spanish notes on the English export');
  assert.ok(day.summary && !arabicGlyphs(day.summary), 'a generated (non-Arabic) English narrative replaces the notes');
});

test('AR2: a Spanish export still renders the stored Spanish notes (matching language is kept)', () => {
  const vm: any = mapQuoteToProposalV3(plannerQuote() as any, 'es');
  const day = vm.days.find((d: any) => d.dayNumber === 2);
  assert.match(day.summary || '', /Tras el desayuno/, 'Spanish notes kept when notesLanguage === render locale');
});

test('AR2: a null notesLanguage preserves current behavior — untagged notes are not suppressed', () => {
  const quote = plannerQuote({
    quoteItineraryDays: [
      { id: 'p1', dayNumber: 1, title: 'Amman', isActive: true, notes: 'Untagged day note kept verbatim.', notesLanguage: null, dayItems: [] },
    ],
  });
  const vm: any = mapQuoteToProposalV3(quote as any, 'ar');
  const day = vm.days.find((d: any) => d.dayNumber === 1);
  assert.match(day.summary || '', /Untagged day note kept verbatim\./, 'untagged notes are never suppressed (no language guessing)');
});

test('AR2: the notes fallback does not mutate the quote — stored notes/notesLanguage are untouched', () => {
  const quote: any = plannerQuote();
  const before = quote.quoteItineraryDays.map((d: any) => ({ notes: d.notes, notesLanguage: d.notesLanguage }));
  mapQuoteToProposalV3(quote, 'ar');
  const after = quote.quoteItineraryDays.map((d: any) => ({ notes: d.notes, notesLanguage: d.notesLanguage }));
  assert.deepEqual(after, before, 'mapper is pure — stored day notes are not rewritten');
});

// ---- 4/5/6. Money formatting ------------------------------------------------
test('AR2: Arabic money renders "<amount> دولار أمريكي" with western digits, not "US$"/"$"', () => {
  const vm: any = mapQuoteToProposalV3(plannerQuote() as any, 'ar');
  assert.equal(vm.pricingHighlightTotal, '2,761.01 دولار أمريكي');
  assert.equal(vm.pricingHighlightPerPax, '1,380.50 دولار أمريكي');
  assert.doesNotMatch(vm.pricingHighlightTotal, /US\$|\$|€/, 'no Latin currency symbol on the Arabic amount');
});

test('AR2: Spanish money is unchanged (Intl es-ES, comma decimal)', () => {
  const vm: any = mapQuoteToProposalV3(plannerQuote() as any, 'es');
  const expected = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(2761.01);
  assert.equal(vm.pricingHighlightTotal, expected);
});

test('AR2: English + Portuguese money are unchanged (Intl en-US / pt-PT)', () => {
  const en: any = mapQuoteToProposalV3(plannerQuote() as any, 'en');
  const enExpected = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(2761.01);
  assert.equal(en.pricingHighlightTotal, enExpected);
  const pt: any = mapQuoteToProposalV3(plannerQuote() as any, 'pt');
  const ptExpected = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(2761.01);
  assert.equal(pt.pricingHighlightTotal, ptExpected);
});

// ---- 4 (cont). Arabic dual/singular guest grammar --------------------------
test('AR2: Arabic two-guest wording is natural (dual, not "2 ضيوف")', () => {
  // Standalone (nominative) → ضيفان; after a preposition (oblique) → ضيفين.
  assert.equal(formatGuestCount('ar', 2, 'nominative'), 'ضيفان');
  assert.equal(formatGuestCount('ar', 2, 'oblique'), 'ضيفين');
  assert.equal(formatGuestCount('ar', 1), 'ضيف واحد');
  assert.equal(formatGuestCount('ar', 3), '3 ضيوف');
  // Non-Arabic locales keep the "N <unit>" shape.
  assert.equal(formatGuestCount('en', 2), '2 guests');
  assert.equal(formatGuestCount('es', 2), '2 huéspedes');
});

test('AR2: the Arabic traveler-count label uses the dual ضيفان (no "2 ضيوف")', () => {
  const vm: any = mapQuoteToProposalV3(plannerQuote() as any, 'ar');
  assert.equal(vm.travelerCountLabel, 'ضيفان');
});

test('AR2: the Arabic occupancy basis note uses the oblique dual ضيفين', () => {
  assert.equal(
    localizePricingLine('ar', 'Based on 2 guests sharing.'),
    'بناءً على ضيفين في غرفة مشتركة.',
  );
  // Spanish/Portuguese occupancy wording is unchanged.
  assert.equal(localizePricingLine('es', 'Based on 2 guests sharing.'), 'Según 2 huéspedes en habitación compartida.');
  assert.equal(localizePricingLine('pt', 'Based on 2 guests sharing.'), 'Com base em 2 hóspedes em quarto partilhado.');
});

// ---- Occupancy appears once (no duplication regression) ---------------------
test('AR2: the Arabic occupancy basis note is not duplicated', () => {
  const quote = plannerQuote({
    priceComputation: { mode: 'simple', status: 'ok', warnings: [], display: { summaryLabel: 'Fixed price', contextLines: ['Based on 2 guests sharing.'] } },
  });
  const vm: any = mapQuoteToProposalV3(quote as any, 'ar');
  const all = [vm.investment?.snapshotHelper, ...(vm.investment?.basisLines || []), ...(vm.investment?.noteLines || [])].filter(Boolean);
  const occurrences = all.filter((l: string) => /في غرفة مشتركة/.test(l)).length;
  assert.ok(occurrences <= 1, `occupancy basis appears at most once (saw ${occurrences})`);
});

// ---- 9. Footer / contact integrity -----------------------------------------
test('AR2: the Arabic export renders the footer contact once with contact@axisdmc.com', async () => {
  const vm: any = mapQuoteToProposalV3(plannerQuote() as any, 'ar');
  assert.equal(vm.contactLine, 'www.axisdmc.com | contact@axisdmc.com');
  const html: string = await (new ProposalV3Service({} as any) as any).renderHtml(vm);
  assert.equal((html.match(/contact@axisdmc\.com/g) || []).length, 1, 'contact email appears exactly once');
  assert.equal((html.match(/class="proposal-footer"/g) || []).length, 1, 'a single footer element');
  assert.match(html, /dir="rtl"/, 'the Arabic export is RTL');
});

// ---- 10. Catalog/service names are NOT translated --------------------------
test('AR2: official catalog/service names are never translated (exact-key localization only)', () => {
  // localizePlaceName matches the WHOLE trimmed string, so a service/catalog name
  // that merely contains a place word ("Amman Hotel", "Petra Entrance Ticket")
  // is returned verbatim — no substring rewriting.
  assert.equal(localizePlaceName('ar', 'Amman Hotel'), 'Amman Hotel');
  assert.equal(localizePlaceName('ar', 'Petra Entrance Ticket'), 'Petra Entrance Ticket');
  assert.equal(localizePlaceName('ar', 'Movenpick Resort Dead Sea'), 'Movenpick Resort Dead Sea');
});
