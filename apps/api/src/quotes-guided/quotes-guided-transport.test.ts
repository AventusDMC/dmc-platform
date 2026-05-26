import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QuotesGuidedService,
  recommendVehicleClassByPax,
  deriveLegTransportInsights,
  buildTransportRecommendation,
  assessJourneyTransportPacing,
  VEHICLE_CLASSES,
} from './quotes-guided.service';

// Guided Quote Builder v2C — Vehicle & Transport Intelligence tests.

function buildFakePrisma(opts: { routeStandards?: any[]; operationalAreas?: any[] }) {
  return {
    operationalArea: { findMany: async () => opts.operationalAreas || [] },
    routeStandard: { findMany: async () => opts.routeStandards || [] },
    touringRoute: { findMany: async () => [] },
    hotel: { findMany: async () => [] },
    activity: { findMany: async () => [] },
  };
}

// ---------------------------------------------------------------------------
// recommendVehicleClassByPax — exact spec pax bands
// ---------------------------------------------------------------------------
test('recommendVehicleClassByPax: 1-2 pax → SEDAN', () => {
  assert.equal(recommendVehicleClassByPax(1), 'SEDAN');
  assert.equal(recommendVehicleClassByPax(2), 'SEDAN');
});

test('recommendVehicleClassByPax: 3-6 pax → MINIVAN', () => {
  assert.equal(recommendVehicleClassByPax(3), 'MINIVAN');
  assert.equal(recommendVehicleClassByPax(5), 'MINIVAN');
  assert.equal(recommendVehicleClassByPax(6), 'MINIVAN');
});

test('recommendVehicleClassByPax: 7-15 pax → COASTER', () => {
  assert.equal(recommendVehicleClassByPax(7), 'COASTER');
  assert.equal(recommendVehicleClassByPax(12), 'COASTER');
  assert.equal(recommendVehicleClassByPax(15), 'COASTER');
});

test('recommendVehicleClassByPax: 16-45 pax → BUS', () => {
  assert.equal(recommendVehicleClassByPax(16), 'BUS');
  assert.equal(recommendVehicleClassByPax(30), 'BUS');
  assert.equal(recommendVehicleClassByPax(45), 'BUS');
});

test('recommendVehicleClassByPax: 0 or above bus capacity → null', () => {
  assert.equal(recommendVehicleClassByPax(0), null);
  assert.equal(recommendVehicleClassByPax(-1), null);
  assert.equal(recommendVehicleClassByPax(60), null);
});

test('VEHICLE_CLASSES table is internally consistent (each class has expected fields)', () => {
  for (const cls of ['SEDAN', 'MINIVAN', 'COASTER', 'BUS'] as const) {
    const meta = VEHICLE_CLASSES[cls];
    assert.ok(meta.label);
    assert.ok(meta.icon);
    assert.ok(meta.typicalExample);
    assert.ok(meta.luggageNote);
    assert.ok(meta.minPax >= 1);
    assert.ok(meta.maxPax >= meta.minPax);
  }
});

// ---------------------------------------------------------------------------
// deriveLegTransportInsights — route-aware overlays
// ---------------------------------------------------------------------------
const JORDAN_AREAS = [
  { code: 'AMM', name: 'Amman City', city: 'Amman', type: 'CITY' },
  { code: 'QAIA', name: 'Queen Alia International Airport', city: 'Amman', type: 'AIRPORT' },
  { code: 'PET', name: 'Petra Visitor Center', city: 'Petra', type: 'TOURISM_SITE' },
  { code: 'WR', name: 'Wadi Rum Camp Area', city: 'Wadi Rum', type: 'CAMP_AREA' },
  { code: 'AQJ', name: 'Aqaba City', city: 'Aqaba', type: 'CITY' },
  { code: 'ALLENBY', name: 'Allenby Bridge', city: 'Dead Sea', type: 'BORDER' },
];

test('deriveLegTransportInsights: Airport leg surfaces AIRPORT_TIMING overlay', () => {
  const standards = [
    {
      routeCode: 'QAIA_AMM',
      canonicalRouteCode: 'QAIA_AMM',
      fromCity: 'Amman',
      toCity: 'Amman',
      standardDistanceKm: 35,
      standardDurationHours: 0.75,
      airportRouteFlag: true,
      mountainRoadFlag: false,
      longDistanceFlag: false,
      borderCrossingFlag: false,
    },
  ];
  const insight = deriveLegTransportInsights(
    'Queen Alia International Airport',
    'Amman City',
    standards as any,
    JORDAN_AREAS as any,
  );
  assert.ok(insight);
  assert.ok(insight!.overlays.find((o) => o.key === 'AIRPORT_TIMING'));
});

test('deriveLegTransportInsights: Mountain road flag → MOUNTAIN_ROAD overlay', () => {
  const standards = [
    {
      routeCode: 'AMM_PET',
      canonicalRouteCode: 'AMM_PET',
      fromCity: 'Amman',
      toCity: 'Petra',
      standardDistanceKm: 235,
      standardDurationHours: 3.5,
      airportRouteFlag: false,
      mountainRoadFlag: true,
      longDistanceFlag: false,
      borderCrossingFlag: false,
    },
  ];
  const insight = deriveLegTransportInsights('Amman', 'Petra', standards as any, JORDAN_AREAS as any);
  assert.ok(insight!.overlays.find((o) => o.key === 'MOUNTAIN_ROAD'));
});

test('deriveLegTransportInsights: ≥5h duration triggers LONG_DISTANCE even without flag', () => {
  const standards = [
    {
      routeCode: 'AMM_AQJ',
      canonicalRouteCode: 'AMM_AQJ',
      fromCity: 'Amman',
      toCity: 'Aqaba',
      standardDistanceKm: 330,
      standardDurationHours: 5.5,
      airportRouteFlag: false,
      mountainRoadFlag: false,
      longDistanceFlag: false,
      borderCrossingFlag: false,
    },
  ];
  const insight = deriveLegTransportInsights('Amman', 'Aqaba', standards as any, JORDAN_AREAS as any);
  assert.ok(insight!.overlays.find((o) => o.key === 'LONG_DISTANCE'));
});

test('deriveLegTransportInsights: border crossing → BORDER_CROSSING overlay (red tone)', () => {
  const standards = [
    {
      routeCode: 'AMM_ALLENBY',
      canonicalRouteCode: 'AMM_ALLENBY',
      fromCity: 'Amman',
      toCity: 'Dead Sea',
      standardDistanceKm: 55,
      standardDurationHours: 1.25,
      airportRouteFlag: false,
      mountainRoadFlag: false,
      longDistanceFlag: false,
      borderCrossingFlag: true,
    },
  ];
  const insight = deriveLegTransportInsights('Amman', 'Allenby Bridge', standards as any, JORDAN_AREAS as any);
  const border = insight!.overlays.find((o) => o.key === 'BORDER_CROSSING');
  assert.ok(border);
  assert.equal(border!.tone, 'red');
});

test('deriveLegTransportInsights: Wadi Rum / Aqaba leg surfaces DESERT_LOGISTICS via terrain heuristic', () => {
  const standards = [
    {
      routeCode: 'WR_AQJ',
      canonicalRouteCode: 'WR_AQJ',
      fromCity: 'Wadi Rum',
      toCity: 'Aqaba',
      standardDistanceKm: 70,
      standardDurationHours: 1.25,
      airportRouteFlag: false,
      mountainRoadFlag: false,
      longDistanceFlag: false,
      borderCrossingFlag: false,
    },
  ];
  const insight = deriveLegTransportInsights('Wadi Rum', 'Aqaba', standards as any, JORDAN_AREAS as any);
  assert.ok(insight!.overlays.find((o) => o.key === 'DESERT_LOGISTICS'));
});

test('deriveLegTransportInsights: returns null-overlays leg when no standard matches', () => {
  const insight = deriveLegTransportInsights('Amman', 'Atlantis', [], JORDAN_AREAS as any);
  assert.ok(insight);
  assert.equal(insight!.overlays.length, 0);
  assert.equal(insight!.driveHours, null);
});

// ---------------------------------------------------------------------------
// buildTransportRecommendation — full recommendation card
// ---------------------------------------------------------------------------
test('buildTransportRecommendation: standard 4-pax Petra journey → MINIVAN, preferred operational choice', () => {
  const rec = buildTransportRecommendation({
    paxCount: 4,
    destinationCount: 3,
    longestLegHours: 3.5,
    totalDriveHours: 7,
    hasMountainLeg: true,
    hasDesertLeg: false,
    hasBorderLeg: false,
    hasAirportLeg: false,
  });
  assert.ok(rec);
  assert.equal(rec!.vehicleClass, 'MINIVAN');
  // 4 pax in a 3-6 range with no extreme legs → preferred
  assert.equal(rec!.preferredOperationalChoice, true);
  assert.equal(rec!.operationalConfidenceLabel, 'Moderate coordination'); // mountain leg
  assert.ok(rec!.comfortNotes.some((n) => /mountain-road/i.test(n)));
});

test('buildTransportRecommendation: tight luggage warning at upper pax bound (6 pax minivan)', () => {
  const rec = buildTransportRecommendation({
    paxCount: 6,
    destinationCount: 2,
    longestLegHours: 2,
    totalDriveHours: 4,
    hasMountainLeg: false,
    hasDesertLeg: false,
    hasBorderLeg: false,
    hasAirportLeg: false,
  });
  assert.ok(rec);
  assert.equal(rec!.vehicleClass, 'MINIVAN');
  assert.ok(rec!.comfortNotes.some((n) => /tight luggage/i.test(n)));
  // 6 pax is at the top of MINIVAN range — not in comfortable middle
  assert.equal(rec!.preferredOperationalChoice, false);
});

test('buildTransportRecommendation: long-leg journey downgrades operational confidence', () => {
  const rec = buildTransportRecommendation({
    paxCount: 10,
    destinationCount: 4,
    longestLegHours: 7,
    totalDriveHours: 12,
    hasMountainLeg: true,
    hasDesertLeg: true,
    hasBorderLeg: false,
    hasAirportLeg: true,
  });
  assert.ok(rec);
  assert.equal(rec!.vehicleClass, 'COASTER');
  assert.equal(rec!.operationalConfidenceLabel, 'High coordination required');
  assert.ok(rec!.comfortNotes.some((n) => /long-distance comfort/i.test(n)));
  assert.ok(rec!.comfortNotes.some((n) => /desert/i.test(n)));
  assert.ok(rec!.comfortNotes.some((n) => /mountain-road/i.test(n)));
  assert.ok(rec!.comfortNotes.some((n) => /airport leg/i.test(n)));
  // Border absent — no border note
  assert.ok(!rec!.comfortNotes.some((n) => /border/i.test(n)));
});

test('buildTransportRecommendation: pax above bus capacity returns null', () => {
  const rec = buildTransportRecommendation({
    paxCount: 60,
    destinationCount: 2,
    longestLegHours: 2,
    totalDriveHours: 3,
    hasMountainLeg: false,
    hasDesertLeg: false,
    hasBorderLeg: false,
    hasAirportLeg: false,
  });
  assert.equal(rec, null);
});

// ---------------------------------------------------------------------------
// assessJourneyTransportPacing — tone selection
// ---------------------------------------------------------------------------
test('assessJourneyTransportPacing: 6+ pax in minivan → tight luggage wins first', () => {
  const pacing = assessJourneyTransportPacing({
    legs: [],
    paxCount: 6,
    vehicleClass: 'MINIVAN',
    longestLegHours: 2,
    totalDriveHours: 4,
  });
  assert.equal(pacing.label, 'Tight luggage capacity');
  assert.equal(pacing.tone, 'intense');
});

test('assessJourneyTransportPacing: long leg → Long-distance touring day', () => {
  const pacing = assessJourneyTransportPacing({
    legs: [],
    paxCount: 4,
    vehicleClass: 'MINIVAN',
    longestLegHours: 7,
    totalDriveHours: 8,
  });
  assert.equal(pacing.label, 'Long-distance touring day');
  assert.equal(pacing.tone, 'intense');
});

test('assessJourneyTransportPacing: heavy total drive → High coordination transfer day', () => {
  const pacing = assessJourneyTransportPacing({
    legs: [
      { driveHours: 4, fromCity: 'A', toCity: 'B', canonicalCode: null, overlays: [], distanceKm: null },
      { driveHours: 5, fromCity: 'B', toCity: 'C', canonicalCode: null, overlays: [], distanceKm: null },
    ] as any,
    paxCount: 4,
    vehicleClass: 'MINIVAN',
    longestLegHours: 5,
    totalDriveHours: 11,
  });
  assert.equal(pacing.label, 'High coordination transfer day');
  assert.equal(pacing.tone, 'intense');
});

test('assessJourneyTransportPacing: light journey → Comfortable pacing', () => {
  const pacing = assessJourneyTransportPacing({
    legs: [
      { driveHours: 1, fromCity: 'A', toCity: 'B', canonicalCode: null, overlays: [], distanceKm: null },
      { driveHours: 2, fromCity: 'B', toCity: 'C', canonicalCode: null, overlays: [], distanceKm: null },
    ] as any,
    paxCount: 4,
    vehicleClass: 'MINIVAN',
    longestLegHours: 2,
    totalDriveHours: 3,
  });
  assert.equal(pacing.label, 'Comfortable pacing');
  assert.equal(pacing.tone, 'calm');
});

// ---------------------------------------------------------------------------
// Service integration
// ---------------------------------------------------------------------------
test('getTransportSuggestionsForJourney: pax=0 returns null recommendation + hint', async () => {
  const prisma = buildFakePrisma({});
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getTransportSuggestionsForJourney({
    destinations: ['Petra'],
    paxCount: 0,
  });
  assert.equal(result.recommendation, null);
  assert.equal(result.legs.length, 0);
  assert.ok(result.notes.some((n) => /pax count is 0/i.test(n)));
});

test('getTransportSuggestionsForJourney: 4 pax Amman → Petra → Wadi Rum produces full insight set', async () => {
  const prisma = buildFakePrisma({
    operationalAreas: JORDAN_AREAS,
    routeStandards: [
      {
        routeCode: 'AMM_PET',
        canonicalRouteCode: 'AMM_PET',
        fromCity: 'Amman',
        toCity: 'Petra',
        standardDistanceKm: 235,
        standardDurationHours: 3.5,
        airportRouteFlag: false,
        mountainRoadFlag: true,
        longDistanceFlag: false,
        borderCrossingFlag: false,
      },
      {
        routeCode: 'PET_WR',
        canonicalRouteCode: 'PET_WR',
        fromCity: 'Petra',
        toCity: 'Wadi Rum',
        standardDistanceKm: 110,
        standardDurationHours: 2,
        airportRouteFlag: false,
        mountainRoadFlag: false,
        longDistanceFlag: false,
        borderCrossingFlag: false,
      },
    ],
  });
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getTransportSuggestionsForJourney({
    arrivalCity: 'Amman',
    destinations: ['Amman', 'Petra', 'Wadi Rum'],
    paxCount: 4,
  });
  assert.equal(result.recommendation?.vehicleClass, 'MINIVAN');
  assert.equal(result.legs.length, 2);
  // First leg has mountain overlay
  assert.ok(result.legs[0].overlays.some((o) => o.key === 'MOUNTAIN_ROAD'));
  // Second leg (Petra → Wadi Rum) picks up Desert logistics via terrain heuristic
  assert.ok(result.legs[1].overlays.some((o) => o.key === 'DESERT_LOGISTICS'));
});

test('getTransportSuggestionsForJourney: 30 pax pilgrimage journey → BUS recommendation', async () => {
  const prisma = buildFakePrisma({});
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getTransportSuggestionsForJourney({
    destinations: ['Madaba', 'Mount Nebo', 'Petra'],
    paxCount: 30,
  });
  assert.equal(result.recommendation?.vehicleClass, 'BUS');
});

test('getTransportSuggestionsForJourney: empty destinations + pax > 0 still returns a vehicle (single transfer)', async () => {
  const prisma = buildFakePrisma({});
  const service = new QuotesGuidedService(prisma as any);
  const result = await service.getTransportSuggestionsForJourney({
    arrivalCity: 'Amman',
    destinations: [],
    paxCount: 2,
  });
  assert.equal(result.recommendation?.vehicleClass, 'SEDAN');
  assert.equal(result.legs.length, 0);
});

// ---------------------------------------------------------------------------
// Pricing-untouched structural guarantee
// ---------------------------------------------------------------------------
test('quotes-guided service NEVER references transport pricing / vehicle rate / dispatch modules', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, 'quotes-guided.service.ts'), 'utf8');
  const forbidden = [
    'vehicleRate',
    'VehicleRate',
    'transportPricing',
    'TransportPricing',
    'touringRoutePricing',
    'TouringRoutePricing',
    'dispatch.create',
    'dispatch.update',
    'sellPrice',
    'costPrice',
    'margin',
    'invoice',
    'quoteItem.create',
    'quoteItem.update',
  ];
  for (const banned of forbidden) {
    assert.ok(
      !source.toLowerCase().includes(banned.toLowerCase()),
      `quotes-guided.service.ts must not reference "${banned}" — transport suggestions are read-only.`,
    );
  }
});
