import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase P.3X-6A — cover "Key moments / Momentos clave" highlights polish.
// The box must not show raw service names ("Licensed Jordan Guide Service"),
// English descriptor suffixes ("… Entrance fee"), or dangling/truncated day-title
// route fragments ("… Visita de Petra /."). It prefers a clean localized route
// line + generic, localized service highlights, and keeps genuine client-safe
// activity descriptions.

function qItem(over: any) {
  return {
    id: over.id,
    itineraryId: over.itineraryId ?? null,
    service: over.service ?? null,
    activity: over.activity ?? null,
    pricingDescription: over.pricingDescription ?? null,
    externalClientDescription: over.externalClientDescription ?? null,
    totalCost: 0,
    totalSell: 0,
    paxCount: 2,
    nightCount: null,
    dayCount: null,
    ...over,
  };
}

// Items whose ONLY client-facing text is a raw internal/service name — these used
// to leak into the highlights and must now be omitted.
const GUIDE = qItem({
  id: 'g1',
  service: { name: 'Licensed Jordan Guide Service', serviceType: { code: 'GUIDE', name: 'Guide' } },
  pricingDescription: 'Guide | Local | Full day | Overnight: No',
});
const ENTRANCE = qItem({
  id: 'e1',
  service: { name: 'Bethany / Baptism Site Entrance Fee', serviceType: { code: 'ENTRANCE_TICKET', name: 'Entrance' } },
  // Mirrors real Q-2026-0073 data: a structured "Name | Entrance fee" pricing
  // descriptor (NOT marketing copy). It must be omitted, not reformatted into a
  // "Bethany / Baptism Site, Entrance fee." highlight.
  pricingDescription: 'Bethany / Baptism Site | Entrance fee',
});
const TRANSPORT = qItem({
  id: 't1',
  service: { name: 'Private touring transport', serviceType: { code: 'TRANSFER', name: 'Transfer' } },
});
const HOTEL = qItem({
  id: 'h1',
  service: { name: 'Amman West Hotel', serviceType: { code: 'HOTEL', name: 'Hotel' } },
  nightCount: 1,
});
// A genuine, client-safe marketing description — this SHOULD still surface.
const REAL_ACTIVITY = qItem({
  id: 'a1',
  service: { name: 'Petra by Night', serviceType: { code: 'ACTIVITY', name: 'Activity' } },
  activity: { id: 'act1', name: 'Petra by Night', description: 'Walk through the candlelit Siq before the treasury reveal.' },
});

function quoteWith(items: any[]) {
  return {
    id: 'q-p3x6a',
    quoteCurrency: 'USD',
    quoteNumber: 'Q-P3X6A',
    title: 'Jordan Private Journey',
    createdAt: new Date('2026-06-01T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 7,
    adults: 2,
    children: 0,
    totalCost: 1000,
    totalSell: 1200,
    pricePerPax: 600,
    quoteOptions: [],
    quoteItems: items,
    // Day titles that previously produced the dangling "/." route fragment.
    itineraries: [
      { id: 'd1', dayNumber: 1, title: 'Arrival Amman', description: null },
      { id: 'd2', dayNumber: 2, title: 'Amman / Jerash / Amman', description: null },
      { id: 'd3', dayNumber: 3, title: 'Amman / Madaba / Mount Nebo / Petra', description: null },
      { id: 'd4', dayNumber: 4, title: 'Petra Visit / Wadi Rum', description: null },
    ],
  };
}

function highlightsFor(items: any[], language: string): string[] {
  const vm: any = mapQuoteToProposalV3(quoteWith(items) as any, language);
  return Array.isArray(vm.highlights) ? vm.highlights : [];
}

test('1. Spanish highlights drop raw service names, English suffixes, and dangling route fragments', () => {
  const h = highlightsFor([GUIDE, ENTRANCE, TRANSPORT, HOTEL], 'es');
  const joined = h.join(' || ');
  assert.ok(!joined.includes('Licensed Jordan Guide Service'), 'no raw guide service name');
  assert.ok(!/Entrance fee/i.test(joined), 'no English "Entrance fee" descriptor');
  assert.ok(!joined.includes('Visita de Petra /'), 'no truncated day-title route fragment');
  assert.ok(!h.some((line) => /\/\s*\.?\s*$/.test(line)), 'no highlight ends with a dangling slash');
  assert.ok(!h.some((line) => /Bethany \/ Baptism Site/.test(line)), 'no raw entrance name');
});

test('2. Spanish highlights are clean localized summary lines (route + generic service mix)', () => {
  const h = highlightsFor([GUIDE, ENTRANCE, TRANSPORT, HOTEL], 'es');
  const joined = h.join(' || ');
  assert.ok(h.length > 0, 'at least one highlight');
  assert.ok(/Ruta planificada por/.test(joined), 'localized route line present');
  // Generic, localized service highlights replace the raw names.
  assert.ok(/Transporte privado según el itinerario\./.test(joined), 'generic transport line');
  assert.ok(/Servicios de guía incluidos donde se indique\./.test(joined), 'generic guide line');
});

test('3. Genuine client-safe activity descriptions still surface in highlights (es)', () => {
  const h = highlightsFor([REAL_ACTIVITY, TRANSPORT, HOTEL], 'es');
  assert.ok(h.includes('Walk through the candlelit Siq before the treasury reveal.'), 'real description kept');
});

test('4. English highlights remain client-safe — no raw internal/service names', () => {
  const h = highlightsFor([GUIDE, ENTRANCE, TRANSPORT, HOTEL], 'en');
  const joined = h.join(' || ');
  assert.ok(!joined.includes('Licensed Jordan Guide Service'), 'no raw guide name (en)');
  assert.ok(!joined.includes('Bethany / Baptism Site'), 'no raw entrance name (en)');
  assert.ok(/Route planned through/.test(joined), 'localized EN route line present');
  assert.ok(/Private transport throughout the itinerary\./.test(joined), 'generic EN transport line');
  assert.ok(!h.some((line) => /\/\s*\.?\s*$/.test(line)), 'no dangling slash (en)');
});

test('5. Portuguese + Arabic highlights are localized and free of raw names', () => {
  const pt = highlightsFor([GUIDE, TRANSPORT, HOTEL], 'pt').join(' || ');
  assert.ok(!pt.includes('Licensed Jordan Guide Service'), 'no raw guide name (pt)');
  assert.ok(/Transporte privado ao longo do itinerário\./.test(pt), 'generic PT transport line');
  const ar = highlightsFor([GUIDE, TRANSPORT, HOTEL], 'ar').join(' || ');
  assert.ok(!ar.includes('Licensed Jordan Guide Service'), 'no raw guide name (ar)');
  assert.ok(/نقل خاص طوال البرنامج\./.test(ar), 'generic AR transport line');
});

test('6. highlights are capped at four clean lines', () => {
  const h = highlightsFor([REAL_ACTIVITY, GUIDE, ENTRANCE, TRANSPORT, HOTEL], 'es');
  assert.ok(h.length <= 4, 'at most four highlights');
});
