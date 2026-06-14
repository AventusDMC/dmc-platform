import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { localizeStructuralDayTitle } from './proposal-i18n';

// Phase P.3X-5E-1 — controlled STRUCTURAL day-title localization.
//
// Only safe structural shapes localize at render time (Arrival X / Departure /
// "X Visit / Y" / slash route titles); free-form titles and English are returned
// unchanged, and raw day notes are never touched. Place tokens reuse the P.3X-5D
// localizePlaceName dictionary (Dead Sea/Mount Nebo/Bethany).

function baseQuote(itineraries: any[], items: any[] = []) {
  return {
    id: 'q-p3x5e1',
    quoteCurrency: 'USD',
    quoteNumber: 'Q-P3X5E1',
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
    quoteItems: items,
  };
}

function titles(vm: any): Record<number, string> {
  const out: Record<number, string> = {};
  for (const d of vm.days || []) out[d.dayNumber] = d.title;
  return out;
}

// Day titles covering every structural shape + a free-form control.
const ITINS = [
  { id: 'd1', dayNumber: 1, title: 'Arrival Amman', description: null },
  { id: 'd2', dayNumber: 2, title: 'Petra Visit / Wadi Rum', description: null },
  { id: 'd3', dayNumber: 3, title: 'Dead Sea / Bethany / Dead Sea', description: null },
  { id: 'd4', dayNumber: 4, title: 'Madaba / Mount Nebo / Petra', description: null },
  { id: 'd5', dayNumber: 5, title: 'Farewell dinner & shopping downtown', description: null },
  { id: 'd6', dayNumber: 6, title: 'Departure', description: null },
];

test('P.3X-5E-1: English day titles are byte-identical (unchanged)', () => {
  const t = titles(mapQuoteToProposalV3(baseQuote(ITINS) as any, 'en'));
  assert.equal(t[1], 'Arrival Amman');
  assert.equal(t[2], 'Petra Visit / Wadi Rum');
  assert.equal(t[3], 'Dead Sea / Bethany / Dead Sea');
  assert.equal(t[4], 'Madaba / Mount Nebo / Petra');
  assert.equal(t[5], 'Farewell dinner & shopping downtown');
  assert.equal(t[6], 'Departure');
});

test('P.3X-5E-1: Spanish structural titles localize', () => {
  const t = titles(mapQuoteToProposalV3(baseQuote(ITINS) as any, 'es'));
  assert.equal(t[1], 'Llegada a Amman');
  assert.equal(t[2], 'Visita de Petra / Wadi Rum');
  // Round trip + linear: structure preserved, only controlled place names localize.
  assert.equal(t[3], 'Mar Muerto / Betania / Mar Muerto');
  assert.equal(t[4], 'Madaba / Monte Nebo / Petra');
  // Free-form title is left exactly as-is.
  assert.equal(t[5], 'Farewell dinner & shopping downtown');
  assert.equal(t[6], 'Salida');
});

test('P.3X-5E-1: Portuguese structural titles localize', () => {
  const t = titles(mapQuoteToProposalV3(baseQuote(ITINS) as any, 'pt'));
  assert.equal(t[1], 'Chegada a Amman');
  assert.equal(t[2], 'Visita a Petra / Wadi Rum');
  assert.equal(t[3], 'Mar Morto / Betânia / Mar Morto');
  assert.equal(t[4], 'Madaba / Monte Nebo / Petra');
  assert.equal(t[5], 'Farewell dinner & shopping downtown');
  assert.equal(t[6], 'Saída');
});

test('P.3X-5E-1: Arabic structural titles localize and stay RTL-safe', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote(ITINS) as any, 'ar');
  const t = titles(vm);
  assert.equal(vm.textDirection, 'rtl');
  assert.equal(t[1], 'الوصول إلى Amman');
  assert.equal(t[2], 'زيارة Petra / Wadi Rum');
  assert.equal(t[3], 'البحر الميت / المغطس / البحر الميت');
  assert.equal(t[4], 'Madaba / جبل نيبو / Petra');
  assert.equal(t[5], 'Farewell dinner & shopping downtown');
  assert.equal(t[6], 'المغادرة');
});

test('P.3X-5E-1: raw day notes are not translated when titles localize', () => {
  const RAW = 'Meet & assist at QAIA, transfer to Amman, overnight Amman.';
  const itins = [{ id: 'd1', dayNumber: 1, title: 'Arrival Amman', description: RAW }];
  const es: any = mapQuoteToProposalV3(baseQuote(itins) as any, 'es');
  const day1 = es.days.find((d: any) => d.dayNumber === 1);
  assert.equal(day1.title, 'Llegada a Amman'); // title localized
  assert.equal(day1.summary, RAW); // note untouched (English, verbatim)
});

test('P.3X-5E-1: POI-composed narrative still wins where POI assignments exist', () => {
  const quote: any = baseQuote([]);
  quote.quoteItineraryDays = [
    {
      id: 'pd1',
      dayNumber: 1,
      isActive: true,
      title: 'Petra Visit / Wadi Rum',
      notes: 'Raw English operator note that must not surface as the summary.',
      poiAssignments: [{ sortOrder: 0, fallbackTitle: 'Petra', fallbackCity: 'Petra', pointOfInterest: null }],
      dayItems: [],
    },
  ];
  const es: any = mapQuoteToProposalV3(quote, 'es');
  const day1 = es.days.find((d: any) => d.dayNumber === 1);
  // Title still localizes structurally...
  assert.equal(day1.title, 'Visita de Petra / Wadi Rum');
  // ...and the POI-composed (locale-aware) narrative wins over the raw English note.
  assert.match(day1.summary, /Visita a Petra/);
  assert.doesNotMatch(day1.summary, /Raw English operator note/);
});

test('P.3X-5E-1: localizeStructuralDayTitle unit — patterns, free-form, EN passthrough', () => {
  // EN byte-identical (short-circuit).
  assert.equal(localizeStructuralDayTitle('en', 'Arrival Amman'), 'Arrival Amman');
  assert.equal(localizeStructuralDayTitle('en', 'Petra Visit / Wadi Rum'), 'Petra Visit / Wadi Rum');

  // Arrival / Departure (bare + with place).
  assert.equal(localizeStructuralDayTitle('es', 'Arrival'), 'Llegada');
  assert.equal(localizeStructuralDayTitle('es', 'Arrival in Aqaba'), 'Llegada a Aqaba');
  assert.equal(localizeStructuralDayTitle('es', 'Departure'), 'Salida');
  assert.equal(localizeStructuralDayTitle('pt', 'Departure from Amman'), 'Saída de Amman');

  // "Visit X" (verb-first) also localizes inside a slash title.
  assert.equal(localizeStructuralDayTitle('es', 'Lunch / Visit Petra'), 'Lunch / Visita de Petra');

  // Free-form titles are returned unchanged, even if they start with a keyword.
  assert.equal(localizeStructuralDayTitle('es', 'Arrival & welcome dinner'), 'Arrival & welcome dinner');
  assert.equal(localizeStructuralDayTitle('es', 'Relaxation and spa morning'), 'Relaxation and spa morning');

  // No blanket substring translation: "Dead Sea" only changes as a whole controlled token.
  assert.equal(localizeStructuralDayTitle('es', 'Dead Sea Resort check-in'), 'Dead Sea Resort check-in');
});
