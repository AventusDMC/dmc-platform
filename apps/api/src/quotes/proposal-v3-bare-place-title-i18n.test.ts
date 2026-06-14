import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { localizeStructuralDayTitle } from './proposal-i18n';

// Phase P.3X-5E-1.1 — a BARE single controlled place-name day title (exact whole
// title) localizes (Dead Sea → Mar Muerto, etc.), so it matches the other
// controlled display points. Non-controlled names and free-form titles (incl.
// ones that merely contain a controlled word) stay unchanged; English is
// byte-identical; raw notes are untouched.

function baseQuote(itineraries: any[]) {
  return {
    id: 'q-p3x5e11',
    quoteCurrency: 'USD',
    quoteNumber: 'Q-P3X5E11',
    title: 'Jordan Private Journey',
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 3,
    adults: 2,
    children: 0,
    totalCost: 300,
    totalSell: 360,
    pricePerPax: 180,
    quoteOptions: [],
    itineraries,
    quoteItems: [],
  };
}

function titles(vm: any): Record<number, string> {
  const out: Record<number, string> = {};
  for (const d of vm.days || []) out[d.dayNumber] = d.title;
  return out;
}

const RAW = 'Free day at the Dead Sea with time to float and relax.';
const ITINS = [
  { id: 'd1', dayNumber: 1, title: 'Dead Sea', description: RAW },
  { id: 'd2', dayNumber: 2, title: 'Mount Nebo', description: null },
  { id: 'd3', dayNumber: 3, title: 'Bethany', description: null },
  // Controlled-but-unchanged + free-form controls.
  { id: 'd4', dayNumber: 4, title: 'Petra', description: null },
  { id: 'd5', dayNumber: 5, title: 'Dead Sea leisure day', description: null },
  { id: 'd6', dayNumber: 6, title: 'Farewell dinner & shopping downtown', description: null },
];

const CASES = {
  es: ['Mar Muerto', 'Monte Nebo', 'Betania'],
  pt: ['Mar Morto', 'Monte Nebo', 'Betânia'],
  ar: ['البحر الميت', 'جبل نيبو', 'المغطس'],
} as const;

for (const [locale, [deadSea, nebo, bethany]] of Object.entries(CASES)) {
  test(`P.3X-5E-1.1: ${locale} bare controlled place titles localize`, () => {
    const t = titles(mapQuoteToProposalV3(baseQuote(ITINS) as any, locale));
    assert.equal(t[1], deadSea);
    assert.equal(t[2], nebo);
    assert.equal(t[3], bethany);
    // Kept-unchanged controlled-list name.
    assert.equal(t[4], 'Petra');
    // Free-form titles containing a controlled word are NOT changed.
    assert.equal(t[5], 'Dead Sea leisure day');
    assert.equal(t[6], 'Farewell dinner & shopping downtown');
  });
}

test('P.3X-5E-1.1: English bare titles are unchanged', () => {
  const t = titles(mapQuoteToProposalV3(baseQuote(ITINS) as any, 'en'));
  assert.equal(t[1], 'Dead Sea');
  assert.equal(t[2], 'Mount Nebo');
  assert.equal(t[3], 'Bethany');
  assert.equal(t[5], 'Dead Sea leisure day');
});

test('P.3X-5E-1.1: raw day notes are not translated when the bare title localizes', () => {
  const es: any = mapQuoteToProposalV3(baseQuote(ITINS) as any, 'es');
  const day1 = es.days.find((d: any) => d.dayNumber === 1);
  assert.equal(day1.title, 'Mar Muerto'); // title localized
  assert.equal(day1.summary, RAW); // note verbatim (English, "Dead Sea" kept)
  assert.match(day1.summary, /Dead Sea/);
});

test('P.3X-5E-1.1: helper unit — exact controlled match only, no substring/free-form', () => {
  assert.equal(localizeStructuralDayTitle('es', 'Dead Sea'), 'Mar Muerto');
  assert.equal(localizeStructuralDayTitle('pt', 'Mount Nebo'), 'Monte Nebo');
  assert.equal(localizeStructuralDayTitle('ar', 'Bethany'), 'المغطس');
  // EN byte-identical.
  assert.equal(localizeStructuralDayTitle('en', 'Dead Sea'), 'Dead Sea');
  // Kept-unchanged controlled-list names.
  for (const keep of ['Amman', 'Jerash', 'Madaba', 'Petra', 'Wadi Rum', 'Wadi Musa', 'QAIA']) {
    assert.equal(localizeStructuralDayTitle('es', keep), keep);
  }
  // No substring / free-form translation.
  assert.equal(localizeStructuralDayTitle('es', 'Dead Sea leisure day'), 'Dead Sea leisure day');
  assert.equal(localizeStructuralDayTitle('es', 'Dead Sea Resort'), 'Dead Sea Resort');
  // Structural localization (P.3X-5E-1) still works alongside the bare-title check.
  assert.equal(localizeStructuralDayTitle('es', 'Arrival Amman'), 'Llegada a Amman');
  assert.equal(localizeStructuralDayTitle('es', 'Wadi Rum / Dead Sea'), 'Wadi Rum / Mar Muerto');
});
