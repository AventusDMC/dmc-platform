import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { localizeServiceDescriptor } from './proposal-i18n';

// Phase P.3X-5F — client-facing service descriptor-suffix localization.
// Entrance/ticket items carry a machine-built pricingDescription ending in
// "… | Entrance fee" (→ cleanText → "…, Entrance fee."). That English suffix
// surfaced in ES/PT/AR proposal service cards (P.3X-QA1 B7). Only the exact
// descriptor comma-segment localizes; proper names are byte-preserved; EN is
// unchanged; no internal token can reappear.

function baseQuote(items: any[]) {
  return {
    id: 'q-p3x5f',
    quoteCurrency: 'USD',
    title: 'Jordan Explorer',
    createdAt: new Date('2026-04-27T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 1,
    adults: 2,
    children: 0,
    totalCost: 200,
    totalSell: 240,
    pricePerPax: 120,
    quoteOptions: [],
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Jerash', description: 'Visit the Roman city of Jerash today.' }],
    quoteItems: items,
  };
}

function cards(vm: any): Array<{ title: string; description: string | null }> {
  return (vm.days || [])
    .flatMap((d: any) => d.groups || [])
    .flatMap((g: any) => g.items || [])
    .map((it: any) => ({ title: it.title || '', description: it.description ?? null }));
}

// Mirrors the real entrance item: pricingDescription "<site> | Entrance fee".
const entranceItem = () => ({
  id: 'ent-1',
  itineraryId: 'day-1',
  service: { name: 'Jerash Archaeological Site & Museum', category: 'Ticket', serviceType: { name: 'Entrance', code: 'TICKET' } },
  pricingDescription: 'Jerash Archaeological Site & Museum | Entrance fee',
  totalCost: 50,
  totalSell: 60,
});

function entranceDesc(vm: any): string | null {
  const c = cards(vm).find((x) => /Jerash Archaeological Site & Museum/.test(x.title));
  return c ? c.description : null;
}

test('P.3X-5F: Spanish entrance suffix localizes (name preserved)', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([entranceItem()]) as any, 'es');
  const d = entranceDesc(vm);
  assert.ok(d, 'entrance card present');
  assert.doesNotMatch(d!, /Entrance fee/i);
  assert.match(d!, /Entrada/);
  assert.match(d!, /Jerash Archaeological Site & Museum/); // proper name unchanged
});

test('P.3X-5F: Portuguese entrance suffix localizes', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([entranceItem()]) as any, 'pt');
  const d = entranceDesc(vm);
  assert.ok(d);
  assert.doesNotMatch(d!, /Entrance fee/i);
  assert.match(d!, /Entrada/);
});

test('P.3X-5F: Arabic entrance suffix localizes (RTL-safe)', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([entranceItem()]) as any, 'ar');
  assert.equal(vm.textDirection, 'rtl');
  const d = entranceDesc(vm);
  assert.ok(d);
  assert.doesNotMatch(d!, /Entrance fee/i);
  assert.match(d!, /رسوم الدخول/);
});

test('P.3X-5F: English descriptor suffix is unchanged', () => {
  const vm: any = mapQuoteToProposalV3(baseQuote([entranceItem()]) as any, 'en');
  const d = entranceDesc(vm);
  assert.ok(d);
  assert.match(d!, /Entrance fee/);
  assert.match(d!, /Jerash Archaeological Site & Museum/);
});

test('P.3X-5F: raw day notes are not modified', () => {
  const NOTE = 'Visit the Roman city of Jerash today.';
  const es: any = mapQuoteToProposalV3(baseQuote([entranceItem()]) as any, 'es');
  const day1 = es.days.find((d: any) => d.dayNumber === 1);
  assert.equal(day1.summary, NOTE);
});

test('P.3X-5F: helper unit — descriptor tokens localize, names/free-form untouched, no internal leak', () => {
  // EN byte-identical.
  assert.equal(localizeServiceDescriptor('en', 'Jerash Site, Entrance fee.'), 'Jerash Site, Entrance fee.');
  // Each token (es).
  assert.equal(localizeServiceDescriptor('es', 'Jerash Site, Entrance fee.'), 'Jerash Site, Entrada.');
  assert.equal(localizeServiceDescriptor('pt', 'Jerash Site, Entrance fee.'), 'Jerash Site, Entrada.');
  assert.equal(localizeServiceDescriptor('ar', 'Jerash Site, Entrance fee.'), 'Jerash Site, رسوم الدخول.');
  assert.equal(localizeServiceDescriptor('es', 'X, Activity'), 'X, Actividad');
  assert.equal(localizeServiceDescriptor('pt', 'X, Experience'), 'X, Experiência');
  assert.equal(localizeServiceDescriptor('ar', 'X, Ticket'), 'X, تذكرة');
  // Proper-name segment that merely CONTAINS a token word is not touched (no substring).
  assert.equal(localizeServiceDescriptor('es', 'Activity Center Visit'), 'Activity Center Visit');
  assert.equal(localizeServiceDescriptor('es', 'Petra Entrance Ticket – 3 Days'), 'Petra Entrance Ticket – 3 Days');
  // Internal tokens are NOT in the map → never injected/altered.
  assert.equal(localizeServiceDescriptor('es', 'X, PER_GROUP, Required units 1'), 'X, PER_GROUP, Required units 1');
});
