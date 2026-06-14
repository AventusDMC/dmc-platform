import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase P.3X-5E-3B — deterministic fallback narrative for EMPTY/placeholder day
// notes ONLY. Precedence: POI-composed narrative > existing day.notes > R.7B
// fallback (empty days) > none. Existing meaningful notes are NEVER overridden.

function baseQuote(itineraries: any[], items: any[] = [], extra: Record<string, unknown> = {}) {
  return {
    id: 'q-p3x5e3b',
    quoteCurrency: 'USD',
    quoteNumber: 'Q-P3X5E3B',
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
    ...extra,
  };
}

function summaryOf(vm: any, dayNumber: number): string | null {
  const d = (vm.days || []).find((x: any) => x.dayNumber === dayNumber);
  return d ? d.summary : null;
}

// --- 1 & 2: existing content always wins (no fallback) ---

test('P.3X-5E-3B: a day with POI-composed narrative still uses POI narrative (no fallback)', () => {
  const quote: any = baseQuote([]);
  quote.quoteItineraryDays = [
    {
      id: 'pd1', dayNumber: 1, isActive: true, title: 'Petra Visit / Wadi Rum', notes: null,
      poiAssignments: [{ sortOrder: 0, fallbackTitle: 'Petra', fallbackCity: 'Petra', pointOfInterest: null }],
      dayItems: [],
    },
  ];
  const es: any = mapQuoteToProposalV3(quote, 'es');
  assert.match(summaryOf(es, 1) || '', /Visita a Petra/); // POI composer output, not R.7B
});

test('P.3X-5E-3B: a day with meaningful notes keeps the notes (no fallback, any locale)', () => {
  const RAW = 'A relaxed morning exploring the old town before lunch.';
  const itins = [{ id: 'd1', dayNumber: 1, title: 'Arrival Amman', description: RAW }];
  for (const lang of ['en', 'es', 'pt', 'ar']) {
    const vm: any = mapQuoteToProposalV3(baseQuote(itins) as any, lang);
    assert.equal(summaryOf(vm, 1), RAW, `notes preserved verbatim (${lang})`);
  }
});

// --- 3–6: empty-note days get a localized fallback ---

const EMPTY_ITINS = [{ id: 'd1', dayNumber: 1, title: 'Arrival Amman', description: null }];

test('P.3X-5E-3B: empty-note EN proposal generates an English fallback', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote(EMPTY_ITINS) as any, 'en');
  const s = summaryOf(vm, 1);
  assert.ok(s, 'fallback present');
  assert.match(s!, /On arrival, meet and assist at the airport/);
});

test('P.3X-5E-3B: empty-note ES proposal generates a Spanish fallback', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote(EMPTY_ITINS) as any, 'es');
  const s = summaryOf(vm, 1);
  assert.ok(s, 'fallback present');
  assert.match(s!, /A su llegada/);
  assert.doesNotMatch(s!, /On arrival, meet and assist/);
});

test('P.3X-5E-3B: empty-note PT proposal generates a Portuguese fallback', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote(EMPTY_ITINS) as any, 'pt');
  const s = summaryOf(vm, 1);
  assert.ok(s, 'fallback present');
  assert.match(s!, /À chegada/);
});

test('P.3X-5E-3B: empty-note AR proposal generates an Arabic fallback (RTL-safe)', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote(EMPTY_ITINS) as any, 'ar');
  assert.equal(vm.textDirection, 'rtl');
  const s = summaryOf(vm, 1);
  assert.ok(s, 'fallback present');
  assert.match(s!, /[؀-ۿ]/); // contains Arabic script
  assert.doesNotMatch(s!, /On arrival|A su llegada/);
});

// --- 7: placeholder notes treated as empty ---

test('P.3X-5E-3B: placeholder notes are treated as empty (fallback generated)', () => {
  // "Details to be confirmed" is matched by the existing isPlaceholderText logic.
  const itins = [{ id: 'd1', dayNumber: 1, title: 'Arrival Amman', description: 'Details to be confirmed' }];
  const vm: any = mapQuoteToProposalV3(baseQuote(itins) as any, 'es');
  const s = summaryOf(vm, 1);
  assert.ok(s, 'fallback present for placeholder note');
  assert.match(s!, /A su llegada/);
  assert.doesNotMatch(s!, /to be confirmed/i);
});

// --- 8: leak-free ---

test('P.3X-5E-3B: fallback for a touring day carries no internal/operational leakage', () => {
  const itins = [{ id: 'd1', dayNumber: 1, title: 'Amman / Madaba / Mount Nebo / Petra', description: null }];
  for (const lang of ['en', 'es', 'pt', 'ar']) {
    const vm: any = mapQuoteToProposalV3(baseQuote(itins) as any, lang);
    const s = summaryOf(vm, 1) || '';
    assert.ok(s, `fallback present (${lang})`);
    for (const bad of [/supplier/i, /contract/i, /\bcost\b/i, /markup/i, /sedan/i, /coaster/i, /PER_(GROUP|PERSON|VEHICLE)/, /Overnight:\s*No/i]) {
      assert.doesNotMatch(s, bad, `${lang} fallback free of ${bad}`);
    }
  }
});

// --- 9: a populated-note day is identical with or without the feature path ---

test('P.3X-5E-3B: EN day with notes is byte-identical (feature only affects empty days)', () => {
  const RAW = 'Visit Madaba and Mount Nebo, continue to Petra, overnight Petra.';
  const itins = [{ id: 'd1', dayNumber: 1, title: 'Amman / Madaba / Mount Nebo / Petra', description: RAW }];
  const vm: any = mapQuoteToProposalV3(baseQuote(itins) as any, 'en');
  assert.equal(summaryOf(vm, 1), RAW);
});
