import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QuotesGuidedService,
  deriveCommercialTier,
  recommendMealPlanForDestination,
  deriveOperationalConfidence,
  deriveQuickNotes,
  enrichHotelForSuggestion,
} from './quotes-guided.service';

// Guided Quote Builder v2A — Intelligent Hotel Suggestions tests.

function buildFakePrisma(opts: { hotels?: any[]; operationalAreas?: any[] }) {
  return {
    hotel: { findMany: async () => opts.hotels || [] },
    operationalArea: { findMany: async () => opts.operationalAreas || [] },
    touringRoute: { findMany: async () => [] },
    routeStandard: { findMany: async () => [] },
  };
}

// ---------------------------------------------------------------------------
// deriveCommercialTier
// ---------------------------------------------------------------------------
test('deriveCommercialTier: 5-star formats → Luxury', () => {
  assert.equal(deriveCommercialTier('5*'), 'Luxury');
  assert.equal(deriveCommercialTier('5 Star'), 'Luxury');
  assert.equal(deriveCommercialTier('Five Star'), 'Luxury');
  assert.equal(deriveCommercialTier('Luxury'), 'Luxury');
  assert.equal(deriveCommercialTier('Deluxe'), 'Luxury');
});

test('deriveCommercialTier: 4-star formats → Standard', () => {
  assert.equal(deriveCommercialTier('4*'), 'Standard');
  assert.equal(deriveCommercialTier('4 Star'), 'Standard');
  assert.equal(deriveCommercialTier('Boutique'), 'Standard');
  assert.equal(deriveCommercialTier('Superior'), 'Standard');
});

test('deriveCommercialTier: 3-star / budget → Budget', () => {
  assert.equal(deriveCommercialTier('3*'), 'Budget');
  assert.equal(deriveCommercialTier('Three Star'), 'Budget');
  assert.equal(deriveCommercialTier('Budget'), 'Budget');
  assert.equal(deriveCommercialTier('Economy'), 'Budget');
});

test('deriveCommercialTier: camps / resorts default to Standard', () => {
  assert.equal(deriveCommercialTier('Camp'), 'Standard');
  assert.equal(deriveCommercialTier('Desert Camp'), 'Standard');
  assert.equal(deriveCommercialTier('Resort'), 'Standard');
});

test('deriveCommercialTier: unknown defaults to Standard (safe middle ground)', () => {
  assert.equal(deriveCommercialTier(''), 'Standard');
  assert.equal(deriveCommercialTier('Whatever'), 'Standard');
});

// ---------------------------------------------------------------------------
// recommendMealPlanForDestination
// ---------------------------------------------------------------------------
test('recommendMealPlanForDestination: Petra → HB (limited evening dining near visitor center)', () => {
  const r = recommendMealPlanForDestination('Petra');
  assert.equal(r.code, 'HB');
  assert.match(r.reason, /Petra/);
});

test('recommendMealPlanForDestination: Wadi Rum → FB (remote camp, bundled meals)', () => {
  const r = recommendMealPlanForDestination('Wadi Rum');
  assert.equal(r.code, 'FB');
  assert.match(r.reason, /remote/i);
});

test('recommendMealPlanForDestination: Dead Sea → BB default with HB upgrade note', () => {
  const r = recommendMealPlanForDestination('Dead Sea');
  assert.equal(r.code, 'BB');
  assert.match(r.reason, /HB upgrade/);
});

test('recommendMealPlanForDestination: Amman / Aqaba / unknown → BB default', () => {
  assert.equal(recommendMealPlanForDestination('Amman').code, 'BB');
  assert.equal(recommendMealPlanForDestination('Aqaba').code, 'BB');
  assert.equal(recommendMealPlanForDestination('Madaba').code, 'BB');
});

// ---------------------------------------------------------------------------
// deriveOperationalConfidence
// ---------------------------------------------------------------------------
test('deriveOperationalConfidence: remote camp keywords win → Remote logistics', () => {
  assert.equal(
    deriveOperationalConfidence({ name: 'Sun City Camp', hasActiveContract: true }),
    'Remote logistics',
  );
  assert.equal(
    deriveOperationalConfidence({ name: 'Memories Aicha Luxury Camp', hasActiveContract: false }),
    'Remote logistics',
  );
});

test('deriveOperationalConfidence: no active contract → Seasonal pressure', () => {
  assert.equal(
    deriveOperationalConfidence({ name: 'Movenpick Petra', hasActiveContract: false }),
    'Seasonal pressure',
  );
});

test('deriveOperationalConfidence: with active contract + non-remote → Operationally smooth', () => {
  assert.equal(
    deriveOperationalConfidence({ name: 'Hilton Dead Sea', hasActiveContract: true }),
    'Operationally smooth',
  );
});

// ---------------------------------------------------------------------------
// deriveQuickNotes — name-based heuristics
// ---------------------------------------------------------------------------
test('deriveQuickNotes: chain hotels flag "Popular with groups"', () => {
  const notes = deriveQuickNotes({ name: 'Movenpick Petra', city: 'Petra', category: '5*' });
  assert.ok(notes.includes('Popular with groups'));
});

test('deriveQuickNotes: Wadi Rum hotels flag desert camp + jeep transfer', () => {
  const notes = deriveQuickNotes({ name: 'Sun City Camp', city: 'Wadi Rum', category: 'Camp' });
  assert.ok(notes.some((n) => /jeep/.test(n)));
});

test('deriveQuickNotes: Dead Sea resort chains flag beach access', () => {
  const notes = deriveQuickNotes({ name: 'Movenpick Dead Sea Resort', city: 'Dead Sea', category: '5*' });
  assert.ok(notes.some((n) => /beach/.test(n)));
});

// ---------------------------------------------------------------------------
// enrichHotelForSuggestion — composes all helpers
// ---------------------------------------------------------------------------
test('enrichHotelForSuggestion: full Petra hotel example', () => {
  const enriched = enrichHotelForSuggestion(
    {
      id: 'h-1',
      name: 'Movenpick Petra',
      city: 'Petra',
      category: '5*',
      contracts: [{ id: 'c-1' }],
    },
    'Petra',
  );
  assert.equal(enriched.tier, 'Luxury');
  assert.equal(enriched.recommendedMealPlan.code, 'HB');
  assert.equal(enriched.operationalConfidence, 'Operationally smooth');
  assert.equal(enriched.hasActiveContract, true);
  assert.ok(enriched.notes.includes('Popular with groups'));
});

test('enrichHotelForSuggestion: Wadi Rum camp without active contract', () => {
  const enriched = enrichHotelForSuggestion(
    { id: 'h-2', name: 'Memories Aicha Camp', city: 'Wadi Rum', category: 'Camp', contracts: [] },
    'Wadi Rum',
  );
  assert.equal(enriched.tier, 'Standard');
  assert.equal(enriched.recommendedMealPlan.code, 'FB');
  // Remote logistics WINS over Seasonal pressure when both would apply.
  assert.equal(enriched.operationalConfidence, 'Remote logistics');
  assert.equal(enriched.hasActiveContract, false);
});

// ---------------------------------------------------------------------------
// Service integration
// ---------------------------------------------------------------------------
test('getHotelSuggestionsForJourney: full Jordan journey produces tiered suggestions per destination', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [
      { id: 'a-pet', code: 'PET', name: 'Petra Visitor Center', city: 'Petra', type: 'TOURISM_SITE' },
      { id: 'a-wr', code: 'WR', name: 'Wadi Rum Camp Area', city: 'Wadi Rum', type: 'CAMP_AREA' },
      { id: 'a-ds', code: 'DS', name: 'Dead Sea Resort Area', city: 'Dead Sea', type: 'RESORT_AREA' },
    ],
    hotels: [
      { id: 'h-1', name: 'Movenpick Petra', city: 'Petra', category: '5*', contracts: [{ id: 'c-1' }] },
      { id: 'h-2', name: 'Petra Moon Hotel', city: 'Petra', category: '4*', contracts: [{ id: 'c-2' }] },
      { id: 'h-3', name: 'Sun City Camp', city: 'Wadi Rum', category: 'Camp', contracts: [{ id: 'c-3' }] },
      { id: 'h-4', name: 'Movenpick Dead Sea Resort', city: 'Dead Sea', category: '5*', contracts: [{ id: 'c-4' }] },
      { id: 'h-5', name: 'Holiday Inn Dead Sea', city: 'Dead Sea', category: '4*', contracts: [] },
    ],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getHotelSuggestionsForJourney({
    destinations: ['Petra', 'Wadi Rum', 'Dead Sea'],
  });
  assert.equal(result.suggestions.length, 3);

  const petra = result.suggestions.find((s) => s.destination === 'Petra')!;
  assert.equal(petra.matchedAreaCode, 'PET');
  assert.equal(petra.tiers.Luxury.length, 1);
  assert.equal(petra.tiers.Luxury[0].name, 'Movenpick Petra');
  assert.equal(petra.tiers.Standard.length, 1); // Petra Moon = 4* = Standard
  assert.equal(petra.tiers.Budget.length, 0);

  const wr = result.suggestions.find((s) => s.destination === 'Wadi Rum')!;
  assert.equal(wr.matchedAreaCode, 'WR');
  // Sun City Camp → Standard (camp default)
  assert.equal(wr.tiers.Standard.length, 1);
  // Wadi Rum hotels get FB recommendation
  assert.equal(wr.tiers.Standard[0].recommendedMealPlan.code, 'FB');

  const ds = result.suggestions.find((s) => s.destination === 'Dead Sea')!;
  assert.equal(ds.tiers.Luxury.length, 1); // Movenpick
  assert.equal(ds.tiers.Standard.length, 1); // Holiday Inn
  // Holiday Inn has no contract → Seasonal pressure
  assert.equal(ds.tiers.Standard[0].operationalConfidence, 'Seasonal pressure');
});

test('getHotelSuggestionsForJourney: returns fallback hint when destination has zero hotels', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [],
    hotels: [{ id: 'h-1', name: 'Movenpick Petra', city: 'Petra', category: '5*', contracts: [] }],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getHotelSuggestionsForJourney({
    destinations: ['Petra', 'Atlantis'],
  });
  const atlantis = result.suggestions.find((s) => s.destination === 'Atlantis')!;
  assert.equal(atlantis.totalHotelCount, 0);
  assert.equal(atlantis.hasAnySuggestions, false);
  assert.ok(atlantis.fallbackHint);
  assert.match(atlantis.fallbackHint!, /standard hotel selector/);
});

test('getHotelSuggestionsForJourney: empty destinations returns empty response (never throws)', async () => {
  const prisma = buildFakePrisma({});
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getHotelSuggestionsForJourney({ destinations: [] });
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.notes.length, 0);
});

test('getHotelSuggestionsForJourney: sorts hotels-with-contracts before contract-less in each tier', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [],
    hotels: [
      { id: 'h-1', name: 'Apple Hotel', city: 'Petra', category: '4*', contracts: [] },
      { id: 'h-2', name: 'Banana Hotel', city: 'Petra', category: '4*', contracts: [{ id: 'c-1' }] },
      { id: 'h-3', name: 'Cherry Hotel', city: 'Petra', category: '4*', contracts: [{ id: 'c-2' }] },
    ],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getHotelSuggestionsForJourney({ destinations: ['Petra'] });
  const petra = result.suggestions[0];
  const order = petra.tiers.Standard.map((h) => h.name);
  // Banana + Cherry (with contracts) before Apple (without)
  assert.equal(order[0], 'Banana Hotel');
  assert.equal(order[1], 'Cherry Hotel');
  assert.equal(order[2], 'Apple Hotel');
});

test('getHotelSuggestionsForJourney: caps each tier at 4 entries (keeps UI scannable)', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [],
    hotels: Array.from({ length: 8 }, (_, i) => ({
      id: `h-${i}`,
      name: `Petra Hotel ${i}`,
      city: 'Petra',
      category: '4*',
      contracts: [],
    })),
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getHotelSuggestionsForJourney({ destinations: ['Petra'] });
  assert.equal(result.suggestions[0].tiers.Standard.length, 4);
});

// ---------------------------------------------------------------------------
// Pricing-untouched structural guarantee
// ---------------------------------------------------------------------------
test('quotes-guided service NEVER references hotel pricing modules / rates / contracts pricing', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, 'quotes-guided.service.ts'), 'utf8');
  const forbidden = [
    'hotelRate',
    'HotelRate',
    'hotelContract.create',
    'hotelContract.update',
    'hotelContract.delete',
    'sellPrice',
    'costPrice',
    'margin',
    'invoice',
    'roomCategory.create',
    'roomCategory.update',
    'pricing',
  ];
  for (const banned of forbidden) {
    assert.ok(
      !source.toLowerCase().includes(banned.toLowerCase()),
      `quotes-guided.service.ts must not reference "${banned}" — hotel suggestions are read-only.`,
    );
  }
});
