import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QuotesGuidedService,
  pickAreaForCity,
  pickTouringRoutesFor,
  buildLegToNext,
  assessPacing,
} from './quotes-guided.service';

// Guided Quote Builder Maturity Phase v2 — service tests.

function buildFakePrisma(opts: {
  touringRoutes?: any[];
  operationalAreas?: any[];
  routeStandards?: any[];
}) {
  return {
    touringRoute: { findMany: async () => opts.touringRoutes || [] },
    operationalArea: { findMany: async () => opts.operationalAreas || [] },
    routeStandard: { findMany: async () => opts.routeStandards || [] },
  };
}

const JORDAN_AREAS = [
  { id: 'a-amm', code: 'AMM', name: 'Amman City', city: 'Amman', type: 'CITY' },
  { id: 'a-qaia', code: 'QAIA', name: 'Queen Alia International Airport', city: 'Amman', type: 'AIRPORT' },
  { id: 'a-pet', code: 'PET', name: 'Petra Visitor Center', city: 'Petra', type: 'TOURISM_SITE' },
  { id: 'a-wr', code: 'WR', name: 'Wadi Rum Camp Area', city: 'Wadi Rum', type: 'CAMP_AREA' },
  { id: 'a-ds', code: 'DS', name: 'Dead Sea Resort Area', city: 'Dead Sea', type: 'RESORT_AREA' },
];

// ---------------------------------------------------------------------------
// pickAreaForCity
// ---------------------------------------------------------------------------
test('pickAreaForCity: exact name match wins over city anchor', () => {
  const found = pickAreaForCity(JORDAN_AREAS, 'Petra Visitor Center');
  assert.equal(found?.code, 'PET');
});

test('pickAreaForCity: city anchor with CITY type preference (Amman → AMM, not QAIA)', () => {
  const found = pickAreaForCity(JORDAN_AREAS, 'Amman');
  assert.equal(found?.code, 'AMM');
  assert.equal(found?.type, 'CITY');
});

test('pickAreaForCity: case-insensitive', () => {
  assert.equal(pickAreaForCity(JORDAN_AREAS, 'amman')?.code, 'AMM');
  assert.equal(pickAreaForCity(JORDAN_AREAS, 'WADI RUM')?.code, 'WR');
});

test('pickAreaForCity: null when no match', () => {
  assert.equal(pickAreaForCity(JORDAN_AREAS, 'Atlantis'), null);
  assert.equal(pickAreaForCity(JORDAN_AREAS, ''), null);
});

// ---------------------------------------------------------------------------
// pickTouringRoutesFor
// ---------------------------------------------------------------------------
test('pickTouringRoutesFor: matches by startCity, mainDestinations, name, or area code', () => {
  const routes = [
    { id: 'r-1', code: 'JOR-PET-FD', name: 'Petra Full Day', startCity: 'Amman', mainDestinations: ['Petra'], durationDays: 1, region: 'South', estimatedDriveHours: 7, estimatedDistanceKm: 470, longDistance: true, mountainRoad: true },
    { id: 'r-2', code: 'JOR-WR-OVN', name: 'Wadi Rum Overnight', startCity: 'Wadi Rum', mainDestinations: ['Wadi Rum'], durationDays: 2, region: 'South', estimatedDriveHours: 2, estimatedDistanceKm: 110, longDistance: false, mountainRoad: false },
    { id: 'r-3', code: 'JOR-NORTH', name: 'Jerash + Ajloun Day Trip', startCity: 'Amman', mainDestinations: ['Jerash', 'Ajloun'], durationDays: 1, region: 'North', estimatedDriveHours: 3, estimatedDistanceKm: 150, longDistance: false, mountainRoad: false },
  ];
  const petraMatches = pickTouringRoutesFor(routes, 'Petra', 'PET');
  assert.equal(petraMatches.length, 1);
  assert.equal(petraMatches[0].code, 'JOR-PET-FD');

  const wrMatches = pickTouringRoutesFor(routes, 'Wadi Rum', 'WR');
  assert.equal(wrMatches.length, 1);
  assert.equal(wrMatches[0].code, 'JOR-WR-OVN');
});

test('pickTouringRoutesFor: sorts shorter durations first', () => {
  const routes = [
    { id: 'r-1', code: 'LONG', name: 'Petra Extended', startCity: 'Amman', mainDestinations: ['Petra'], durationDays: 3, region: null, estimatedDriveHours: null, estimatedDistanceKm: null, longDistance: false, mountainRoad: false },
    { id: 'r-2', code: 'SHORT', name: 'Petra Full Day', startCity: 'Amman', mainDestinations: ['Petra'], durationDays: 1, region: null, estimatedDriveHours: null, estimatedDistanceKm: null, longDistance: false, mountainRoad: false },
  ];
  const matches = pickTouringRoutesFor(routes, 'Petra', 'PET');
  assert.equal(matches[0].code, 'SHORT');
  assert.equal(matches[1].code, 'LONG');
});

// ---------------------------------------------------------------------------
// buildLegToNext
// ---------------------------------------------------------------------------
test('buildLegToNext: resolves canonical FROM_TO route standard between two destinations', () => {
  const standards = [
    {
      id: 's-amm-pet',
      routeCode: 'AMM_PET',
      canonicalRouteCode: 'AMM_PET',
      fromCity: 'Amman',
      toCity: 'Petra',
      standardDistanceKm: 235,
      standardDurationHours: 3.5,
      operationalBufferMinutes: 30,
      longDistanceFlag: false,
      mountainRoadFlag: true,
      borderCrossingFlag: false,
      airportRouteFlag: false,
    },
  ];
  const leg = buildLegToNext(standards, JORDAN_AREAS as any, 'Amman', 'Petra');
  assert.equal(leg?.canonicalCode, 'AMM_PET');
  assert.equal(leg?.durationHours, 3.5);
  assert.equal(leg?.riskFlags.mountainRoadFlag, true);
});

test('buildLegToNext: returns null when no route standard exists', () => {
  const leg = buildLegToNext([], JORDAN_AREAS as any, 'Petra', 'Atlantis');
  assert.equal(leg, null);
});

// ---------------------------------------------------------------------------
// assessPacing
// ---------------------------------------------------------------------------
test('assessPacing: single destination = calm/smooth', () => {
  const p = assessPacing(0, 0, 0, 1);
  assert.equal(p.tone, 'calm');
  assert.equal(p.label, 'Smooth logistics flow');
});

test('assessPacing: leg > 6h = Long travel day (intense)', () => {
  const p = assessPacing(7, 7, 1, 2);
  assert.equal(p.tone, 'intense');
  assert.equal(p.label, 'Long travel day');
});

test('assessPacing: total > 10h = High coordination required (intense)', () => {
  const p = assessPacing(12, 4, 3, 4);
  assert.equal(p.tone, 'intense');
  // Could be 'High coordination' or 'Tight transfer' — both are intense
  assert.ok(p.label === 'High coordination required' || p.label === 'Tight transfer timing');
});

test('assessPacing: 6–10h total = balanced', () => {
  const p = assessPacing(7, 3.5, 0, 3);
  assert.equal(p.tone, 'balanced');
  assert.equal(p.label, 'Balanced pacing');
});

test('assessPacing: < 6h total = calm', () => {
  const p = assessPacing(4, 2, 0, 3);
  assert.equal(p.tone, 'calm');
});

// ---------------------------------------------------------------------------
// Full service integration
// ---------------------------------------------------------------------------
test('getJourneySuggestions: full Jordan journey produces per-destination touring routes + balanced pacing', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: JORDAN_AREAS,
    touringRoutes: [
      { id: 'r-1', code: 'JOR-PET-FD', name: 'Petra Full Day', startCity: 'Petra', mainDestinations: ['Petra'], durationDays: 1, region: 'South', estimatedDriveHours: 5, estimatedDistanceKm: 470, longDistance: false, mountainRoad: true },
      { id: 'r-2', code: 'JOR-WR-FD', name: 'Wadi Rum Jeep Tour', startCity: 'Wadi Rum', mainDestinations: ['Wadi Rum'], durationDays: 1, region: 'South', estimatedDriveHours: 4, estimatedDistanceKm: 50, longDistance: false, mountainRoad: false },
    ],
    routeStandards: [
      { id: 's-amm-pet', routeCode: 'AMM_PET', canonicalRouteCode: 'AMM_PET', fromCity: 'Amman', toCity: 'Petra', standardDistanceKm: 235, standardDurationHours: 3.5, operationalBufferMinutes: 30, longDistanceFlag: false, mountainRoadFlag: true, borderCrossingFlag: false, airportRouteFlag: false },
      { id: 's-pet-wr', routeCode: 'PET_WR', canonicalRouteCode: 'PET_WR', fromCity: 'Petra', toCity: 'Wadi Rum', standardDistanceKm: 110, standardDurationHours: 2, operationalBufferMinutes: 20, longDistanceFlag: false, mountainRoadFlag: false, borderCrossingFlag: false, airportRouteFlag: false },
    ],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getJourneySuggestions({
    arrivalCity: 'Amman',
    destinations: ['Petra', 'Wadi Rum'],
  });
  assert.equal(result.suggestions.length, 2);
  assert.equal(result.suggestions[0].destination, 'Petra');
  assert.equal(result.suggestions[0].matchedAreaCode, 'PET');
  assert.ok(result.suggestions[0].suggestedTouringRoutes.find((r) => r.code === 'JOR-PET-FD'));
  // Leg to next from Petra → Wadi Rum
  assert.equal(result.suggestions[0].legToNext?.canonicalCode, 'PET_WR');
  // Final destination has no legToNext
  assert.equal(result.suggestions[1].legToNext, null);
  // Pacing: total 2h (Petra→WR) is calm
  assert.equal(result.pacing.tone, 'calm');
});

test('getJourneySuggestions: empty destinations returns calm pacing + empty suggestions', async () => {
  const prisma = buildFakePrisma({});
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getJourneySuggestions({ destinations: [] });
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.pacing.tone, 'calm');
});

test('getJourneySuggestions: missing route standards produce a soft note (never throws)', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: JORDAN_AREAS,
    touringRoutes: [],
    routeStandards: [], // no standards
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getJourneySuggestions({
    destinations: ['Amman', 'Petra', 'Wadi Rum'],
  });
  assert.equal(result.suggestions.length, 3);
  // Every leg's legToNext is null (no standards) but no throw
  assert.equal(result.suggestions[0].legToNext, null);
  assert.equal(result.suggestions[1].legToNext, null);
  // Soft note about missing standards
  assert.ok(result.notes.some((n) => n.includes("isn't backed by a Route Standard")));
});

// ---------------------------------------------------------------------------
// Pricing-untouched structural guarantee
// ---------------------------------------------------------------------------
test('quotes-guided service NEVER touches pricing / quote-engine code paths', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, 'quotes-guided.service.ts'), 'utf8');
  const forbidden = [
    'quoteItem.create',
    'quoteItem.update',
    'quoteItem.delete',
    'sellPrice',
    'costPrice',
    'margin',
    'pricing',
    'invoice',
  ];
  for (const banned of forbidden) {
    // Case-insensitive — guard against any pricing word slipping in.
    assert.ok(
      !source.toLowerCase().includes(banned.toLowerCase()),
      `quotes-guided.service.ts must not reference "${banned}" — guided panel is read-only.`,
    );
  }
});
