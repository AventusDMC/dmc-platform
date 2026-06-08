import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase Q — client-friendly guide descriptions composed from the guide TYPE
// (local / accompanying escort) + day location. No guide-language field exists
// in the data model, so language-based wording is not derived. Internal guide
// metadata ("Overnight: No", pipe descriptor, min/max pax, operator confirmation)
// must never reach the client.

function quoteWithGuide(opts: { dayTitle?: string; pricingDescription?: string; serviceName?: string } = {}) {
  return {
    id: 'q-1',
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
    itineraries: [{ id: 'day-1', dayNumber: 1, title: opts.dayTitle || 'Day 1: Petra', description: 'Touring day.' }],
    quoteItems: [
      {
        id: 'g-1',
        itineraryId: 'day-1',
        service: { name: opts.serviceName || 'Licensed Jordan Guide Service', category: 'Guiding', serviceType: { name: 'Guide', code: 'GUIDE' } },
        pricingDescription: opts.pricingDescription ?? 'Guide | Local | Full day | Overnight: No',
        totalCost: 80,
        totalSell: 96,
      },
    ],
  };
}

function guideCard(vm: any) {
  const items = (vm.days || []).flatMap((d: any) => (d.groups || []).flatMap((g: any) => g.items || []));
  return items.find((it: any) => /guide/i.test(it.title || '')) || null;
}

test('a local guide reads "Local guide for <day location>"', () => {
  const vm: any = mapQuoteToProposalV3(quoteWithGuide({ dayTitle: 'Day 1: Petra' }) as any);
  const guide = guideCard(vm);
  assert.ok(guide, 'guide line present');
  assert.equal(guide.description, 'Local guide for Petra');
});

test('a local guide with no resolvable location falls back to "Licensed local guide."', () => {
  const vm: any = mapQuoteToProposalV3(quoteWithGuide({ dayTitle: 'Day 1' }) as any);
  const guide = guideCard(vm);
  assert.ok(guide);
  assert.ok(/Licensed local guide\.|Local guide for/.test(guide.description || ''), `got: ${guide.description}`);
});

test('an accompanying escort guide reads "Escort guide as scheduled."', () => {
  const vm: any = mapQuoteToProposalV3(quoteWithGuide({ pricingDescription: 'Guide | Escort | Full day | Overnight: Yes' }) as any);
  const guide = guideCard(vm);
  assert.equal(guide.description, 'Escort guide as scheduled.');
});

// Phase Q.1 — a multi-stop route day title resolves to ONE clean destination.
test('Phase Q.1: round-trip day "Amman / Jerash / Amman" → "Local guide for Jerash"', () => {
  const vm: any = mapQuoteToProposalV3(quoteWithGuide({ dayTitle: 'Day 2: Amman / Jerash / Amman' }) as any);
  const guide = guideCard(vm);
  assert.equal(guide.description, 'Local guide for Jerash');
  // the guide DESCRIPTION carries one clean destination, not the route string
  // (the day title may still show the full route — that's the itinerary heading).
  assert.doesNotMatch(guide.description, /\//, 'no route string in the guide description');
});

test('Phase Q.1: one-way day "…/ Shoubak / Petra" → "Local guide for Petra"', () => {
  const vm: any = mapQuoteToProposalV3(quoteWithGuide({ dayTitle: 'Day 3: Amman / Madaba / Mount Nebo / Shoubak / Petra' }) as any);
  const guide = guideCard(vm);
  assert.equal(guide.description, 'Local guide for Petra');
  assert.doesNotMatch(guide.description, /\//, 'no route string in the guide description');
});

test('Phase Q.1: a single-city day is unchanged ("Local guide for Petra")', () => {
  const vm: any = mapQuoteToProposalV3(quoteWithGuide({ dayTitle: 'Day 1: Petra' }) as any);
  assert.equal(guideCard(vm).description, 'Local guide for Petra');
});

test('no internal guide metadata leaks anywhere in the view model', () => {
  const vm: any = mapQuoteToProposalV3(quoteWithGuide() as any);
  const text = JSON.stringify(vm);
  assert.doesNotMatch(text, /Overnight:\s*(No|Yes)/i, 'no Overnight: No/Yes');
  assert.doesNotMatch(text, /Guide \| Local|Full day \|/i, 'no pipe descriptor');
  assert.doesNotMatch(text, /requiresOperatorConfirmation|minPax|maxPax/i, 'no internal flags');
});

test('guide description is localized (PT/ES/AR) with no English leak', () => {
  const cases: Array<[string, string]> = [
    ['pt', 'Guia local para Petra'],
    ['es', 'Guía local para Petra'],
    ['ar', 'مرشد محلي في Petra'],
  ];
  for (const [lang, expected] of cases) {
    const vm: any = mapQuoteToProposalV3(quoteWithGuide({ dayTitle: 'Day 1: Petra' }) as any, lang);
    const guide = guideCard(vm);
    assert.equal(guide.description, expected, `${lang} guide description`);
    assert.doesNotMatch(guide.description, /Local guide for/i, `${lang} no English leak`);
  }
});
