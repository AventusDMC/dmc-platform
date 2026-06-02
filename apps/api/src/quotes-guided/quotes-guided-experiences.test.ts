import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QuotesGuidedService,
  inferActivityMood,
  deriveExperienceConfidence,
  deriveExperienceNotes,
  enrichActivityForSuggestion,
} from './quotes-guided.service';

// Guided Quote Builder v2B — Experiences & Activity Intelligence tests.

function buildFakePrisma(opts: { activities?: any[]; operationalAreas?: any[] }) {
  return {
    activity: { findMany: async () => opts.activities || [] },
    operationalArea: { findMany: async () => opts.operationalAreas || [] },
    touringRoute: { findMany: async () => [] },
    routeStandard: { findMany: async () => [] },
    hotel: { findMany: async () => [] },
  };
}

// ---------------------------------------------------------------------------
// inferActivityMood — keyword-based mood derivation
// ---------------------------------------------------------------------------
test('inferActivityMood: religious keywords win first', () => {
  assert.equal(inferActivityMood({ name: 'Baptism Site Visit', category: null }), 'RELIGIOUS');
  assert.equal(inferActivityMood({ name: 'Mount Nebo Pilgrimage', category: null }), 'RELIGIOUS');
});

test('inferActivityMood: wellness keywords', () => {
  assert.equal(inferActivityMood({ name: 'Dead Sea Spa Day', category: null }), 'WELLNESS');
  assert.equal(inferActivityMood({ name: 'Hammam & Turkish Bath', category: null }), 'WELLNESS');
});

test('inferActivityMood: food keywords', () => {
  assert.equal(inferActivityMood({ name: 'Petra Kitchen Cooking Class', category: null }), 'FOOD_LOCAL');
  assert.equal(inferActivityMood({ name: 'Amman Food Walk', category: null }), 'FOOD_LOCAL');
  assert.equal(inferActivityMood({ name: 'Bedouin Dinner Experience', category: null }), 'FOOD_LOCAL');
});

test('inferActivityMood: adventure keywords', () => {
  assert.equal(inferActivityMood({ name: 'Wadi Rum Jeep Safari', category: null }), 'ADVENTURE');
  assert.equal(inferActivityMood({ name: 'Mujib Canyon Hike', category: null }), 'ADVENTURE');
  assert.equal(inferActivityMood({ name: 'Stargazing in the Desert', category: null }), 'ADVENTURE');
});

test('inferActivityMood: culture default for Jordan heritage activities', () => {
  assert.equal(inferActivityMood({ name: 'Petra Guided Experience', category: null }), 'CULTURE');
  assert.equal(inferActivityMood({ name: 'Jerash Roman Tour', category: null }), 'CULTURE');
  assert.equal(inferActivityMood({ name: 'Amman Citadel Visit', category: null }), 'CULTURE');
});

test('inferActivityMood: family keyword', () => {
  assert.equal(inferActivityMood({ name: 'Family Friendly Tour', category: null }), 'FAMILY');
});

test('inferActivityMood: unknown defaults to CULTURE (safe Jordan-leaning default)', () => {
  assert.equal(inferActivityMood({ name: 'Unspecified Activity', category: null }), 'CULTURE');
});

// ---------------------------------------------------------------------------
// deriveExperienceConfidence
// ---------------------------------------------------------------------------
test('deriveExperienceConfidence: SIC-possible → Operationally confident', () => {
  assert.equal(deriveExperienceConfidence({ sicPossible: true }), 'Operationally confident');
});

test('deriveExperienceConfidence: requires guide → Specialist coordination', () => {
  assert.equal(deriveExperienceConfidence({ guideRequired: true }), 'Specialist coordination');
});

test('deriveExperienceConfidence: hard difficulty → Specialist coordination', () => {
  assert.equal(deriveExperienceConfidence({ difficulty: 'Hard' }), 'Specialist coordination');
  assert.equal(deriveExperienceConfidence({ difficulty: 'Expert' }), 'Specialist coordination');
});

test('deriveExperienceConfidence: default → Standard coordination', () => {
  assert.equal(deriveExperienceConfidence({}), 'Standard coordination');
});

// ---------------------------------------------------------------------------
// deriveExperienceNotes
// ---------------------------------------------------------------------------
test('deriveExperienceNotes: SIC-possible → Popular with groups', () => {
  const notes = deriveExperienceNotes({ name: 'Petra Tour', sicPossible: true });
  assert.ok(notes.includes('Popular with groups'));
});

test('deriveExperienceNotes: 6+ hours → Long active day', () => {
  const notes = deriveExperienceNotes({ name: 'Petra Full Day', durationHours: 7 });
  assert.ok(notes.includes('Long active day'));
});

test('deriveExperienceNotes: <=1.5h → Relaxed pace', () => {
  const notes = deriveExperienceNotes({ name: 'Short Walk', durationHours: 1 });
  assert.ok(notes.includes('Relaxed pace'));
});

test('deriveExperienceNotes: evening / sunset name → Evening departure', () => {
  const notes = deriveExperienceNotes({ name: 'Petra by Night' });
  assert.ok(notes.includes('Evening departure'));
});

test('deriveExperienceNotes: early / sunrise name → Early departure required', () => {
  const notes = deriveExperienceNotes({ name: 'Sunrise Hot Air Balloon' });
  assert.ok(notes.includes('Early departure required'));
});

// ---------------------------------------------------------------------------
// enrichActivityForSuggestion
// ---------------------------------------------------------------------------
test('enrichActivityForSuggestion: prefers explicit moodCategory over inference', () => {
  const enriched = enrichActivityForSuggestion({
    id: 'a-1',
    name: 'Petra Sunrise Hike',
    description: 'Trek up to the monastery for dawn',
    moodCategory: 'WELLNESS',
    sicPossible: false,
  });
  // Operator-set moodCategory wins, even when keywords suggest a different mood
  assert.equal(enriched.effectiveMood, 'WELLNESS');
});

test('enrichActivityForSuggestion: falls back to inference when moodCategory is null', () => {
  const enriched = enrichActivityForSuggestion({
    id: 'a-2',
    name: 'Wadi Rum Jeep Safari',
    description: 'Half-day desert exploration',
    moodCategory: null,
    sicPossible: true,
  });
  assert.equal(enriched.effectiveMood, 'ADVENTURE');
});

test('enrichActivityForSuggestion: full premium cultural activity card', () => {
  const enriched = enrichActivityForSuggestion({
    id: 'a-3',
    name: 'Petra Guided Experience',
    description: 'Award-winning archaeological walk through the Siq.',
    city: 'Petra',
    category: 'Culture',
    moodCategory: 'CULTURE',
    operationalIntensity: 'MODERATE',
    durationHours: 4,
    durationMinutes: 240,
    familyFriendly: true,
    religiousSignificance: false,
    premiumExperienceFlag: true,
    sicPossible: true,
    guideRequired: true,
    difficulty: 'Easy',
  });
  assert.equal(enriched.effectiveMood, 'CULTURE');
  // sicPossible takes priority over guideRequired in confidence label
  assert.equal(enriched.operationalConfidenceLabel, 'Operationally confident');
  assert.equal(enriched.popularWithGroups, true);
  assert.equal(enriched.premiumExperienceFlag, true);
  assert.equal(enriched.familyFriendly, true);
});

test('recommendation score: premium + curated + group-ready experience scores higher than a plain one, with reasons', () => {
  const premium = enrichActivityForSuggestion({
    id: 'a1',
    name: 'Petra by Night',
    description: 'Signature evening experience',
    moodCategory: 'CULTURE',
    premiumExperienceFlag: true,
    sicPossible: true,
  });
  const plain = enrichActivityForSuggestion({
    id: 'a2',
    name: 'Neighbourhood stroll',
    description: null,
    moodCategory: null,
    premiumExperienceFlag: false,
    sicPossible: false,
  });

  assert.ok(premium.recommendationScore > plain.recommendationScore);
  // premium(30) + operationally-confident via sicPossible(15) + group-scale(10) + curated mood(5) = 60
  assert.equal(premium.recommendationScore, 60);
  assert.ok(premium.recommendationReasons.includes('Premium / signature experience'));
  assert.ok(premium.recommendationReasons.includes('Operationally confident'));
  assert.ok(premium.recommendationReasons.includes('Scales for groups'));
  assert.ok(premium.recommendationReasons.includes('Curated experience metadata'));
  assert.equal(plain.recommendationScore, 0);
});

// ---------------------------------------------------------------------------
// Service integration
// ---------------------------------------------------------------------------
test('getExperienceSuggestionsForJourney: filters strictly by destination city (Wadi Rum activities NOT under Amman)', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [
      { id: 'a-amm', code: 'AMM', name: 'Amman City', city: 'Amman', type: 'CITY' },
      { id: 'a-wr', code: 'WR', name: 'Wadi Rum Camp Area', city: 'Wadi Rum', type: 'CAMP_AREA' },
    ],
    activities: [
      { id: 'act-1', name: 'Amman Citadel Tour', city: 'Amman', moodCategory: 'CULTURE' },
      { id: 'act-2', name: 'Wadi Rum Jeep Safari', city: 'Wadi Rum', moodCategory: 'ADVENTURE' },
      { id: 'act-3', name: 'Wadi Rum Stargazing', city: 'Wadi Rum', moodCategory: 'ADVENTURE' },
    ],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getExperienceSuggestionsForJourney({
    destinations: ['Amman', 'Wadi Rum'],
  });
  const amman = result.suggestions.find((s) => s.destination === 'Amman')!;
  const wr = result.suggestions.find((s) => s.destination === 'Wadi Rum')!;
  // Amman has only the Citadel tour
  assert.equal(amman.totalExperienceCount, 1);
  assert.equal(amman.byMood.CULTURE?.length, 1);
  assert.equal(amman.byMood.ADVENTURE, undefined);
  // Wadi Rum has the two adventure activities
  assert.equal(wr.totalExperienceCount, 2);
  assert.equal(wr.byMood.ADVENTURE?.length, 2);
  assert.equal(wr.byMood.CULTURE, undefined);
});

test('getExperienceSuggestionsForJourney: groups by all 7 spec mood categories when present', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [],
    activities: [
      { id: 'a-1', name: 'Petra Guided Experience', city: 'Petra', moodCategory: 'CULTURE' },
      { id: 'a-2', name: 'Petra by Night', city: 'Petra', moodCategory: 'CULTURE' },
      { id: 'a-3', name: 'Mujib Canyon Hike', city: 'Petra', moodCategory: 'ADVENTURE' },
      { id: 'a-4', name: 'Monastery Visit', city: 'Petra', moodCategory: 'RELIGIOUS' },
      { id: 'a-5', name: 'Petra Spa', city: 'Petra', moodCategory: 'WELLNESS' },
      { id: 'a-6', name: 'Petra Kitchen', city: 'Petra', moodCategory: 'FOOD_LOCAL' },
      { id: 'a-7', name: 'Family Cave Tour', city: 'Petra', moodCategory: 'FAMILY' },
      { id: 'a-8', name: 'Sunset Viewpoint', city: 'Petra', moodCategory: 'RELAXATION' },
    ],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getExperienceSuggestionsForJourney({ destinations: ['Petra'] });
  const petra = result.suggestions[0];
  assert.equal(petra.totalExperienceCount, 8);
  assert.equal(petra.byMood.CULTURE?.length, 2);
  assert.equal(petra.byMood.ADVENTURE?.length, 1);
  assert.equal(petra.byMood.RELIGIOUS?.length, 1);
  assert.equal(petra.byMood.RELAXATION?.length, 1);
  assert.equal(petra.byMood.FAMILY?.length, 1);
  assert.equal(petra.byMood.WELLNESS?.length, 1);
  assert.equal(petra.byMood.FOOD_LOCAL?.length, 1);
});

test('getExperienceSuggestionsForJourney: caps each mood at 6 (UI scannability)', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [],
    activities: Array.from({ length: 12 }, (_, i) => ({
      id: `a-${i}`,
      name: `Petra Activity ${i}`,
      city: 'Petra',
      moodCategory: 'CULTURE',
    })),
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getExperienceSuggestionsForJourney({ destinations: ['Petra'] });
  assert.equal(result.suggestions[0].byMood.CULTURE!.length, 6);
});

test('getExperienceSuggestionsForJourney: sorts premium first within each mood', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [],
    activities: [
      { id: 'a-1', name: 'Apple Tour', city: 'Petra', moodCategory: 'CULTURE', premiumExperienceFlag: false, sicPossible: false },
      { id: 'a-2', name: 'Banana Tour', city: 'Petra', moodCategory: 'CULTURE', premiumExperienceFlag: true, sicPossible: false },
      { id: 'a-3', name: 'Cherry Tour', city: 'Petra', moodCategory: 'CULTURE', premiumExperienceFlag: true, sicPossible: true },
    ],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getExperienceSuggestionsForJourney({ destinations: ['Petra'] });
  const order = result.suggestions[0].byMood.CULTURE!.map((e) => e.name);
  // Both premium come first; Apple (non-premium) last
  assert.ok(order[0] === 'Banana Tour' || order[0] === 'Cherry Tour');
  assert.ok(order[1] === 'Banana Tour' || order[1] === 'Cherry Tour');
  assert.equal(order[2], 'Apple Tour');
});

test('getExperienceSuggestionsForJourney: highlights strip picks premium + confident, capped at 5', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [],
    activities: [
      { id: 'a-1', name: 'Petra Premium', city: 'Petra', moodCategory: 'CULTURE', premiumExperienceFlag: true, sicPossible: true },
      { id: 'a-2', name: 'Wadi Rum Premium', city: 'Wadi Rum', moodCategory: 'ADVENTURE', premiumExperienceFlag: true, sicPossible: true },
      { id: 'a-3', name: 'Dead Sea Spa', city: 'Dead Sea', moodCategory: 'WELLNESS', premiumExperienceFlag: false, sicPossible: true },
      { id: 'a-4', name: 'Regular Activity', city: 'Petra', moodCategory: 'CULTURE', premiumExperienceFlag: false, sicPossible: false },
    ],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getExperienceSuggestionsForJourney({
    destinations: ['Petra', 'Wadi Rum', 'Dead Sea'],
  });
  // Premium picks first, then operationally-confident non-premium
  assert.ok(result.highlights.length >= 3);
  assert.ok(result.highlights.length <= 5);
  assert.equal(result.highlights[0].premiumExperienceFlag, true);
  // Regular Activity (not premium, not SIC) shouldn't be in highlights
  assert.equal(result.highlights.find((h) => h.id === 'a-4'), undefined);
});

test('getExperienceSuggestionsForJourney: fallback hint when destination has zero matches', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: [],
    activities: [{ id: 'a-1', name: 'Petra Tour', city: 'Petra', moodCategory: 'CULTURE' }],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getExperienceSuggestionsForJourney({
    destinations: ['Petra', 'Atlantis'],
  });
  const atlantis = result.suggestions.find((s) => s.destination === 'Atlantis')!;
  assert.equal(atlantis.totalExperienceCount, 0);
  assert.equal(atlantis.hasAnyExperiences, false);
  assert.ok(atlantis.fallbackHint);
  assert.match(atlantis.fallbackHint!, /standard activity selector/);
});

test('getExperienceSuggestionsForJourney: empty destinations returns empty response (never throws)', async () => {
  const prisma = buildFakePrisma({});
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getExperienceSuggestionsForJourney({ destinations: [] });
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.highlights.length, 0);
});

// ---------------------------------------------------------------------------
// Pricing-untouched structural guarantee
// ---------------------------------------------------------------------------
test('quotes-guided service NEVER references activity pricing / rate variants', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, 'quotes-guided.service.ts'), 'utf8');
  const forbidden = [
    'activityRateVariant',
    'ActivityRateVariant',
    'activity.update',
    'activity.create',
    'activity.delete',
    'sellPrice',
    'costPrice',
    'margin',
    'invoice',
    'quoteItem.create',
    'quoteItem.update',
    'quoteItem.delete',
  ];
  for (const banned of forbidden) {
    assert.ok(
      !source.toLowerCase().includes(banned.toLowerCase()),
      `quotes-guided.service.ts must not reference "${banned}" — experience suggestions are read-only.`,
    );
  }
});
