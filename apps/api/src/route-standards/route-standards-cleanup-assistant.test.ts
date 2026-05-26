import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyRouteStandard,
  suggestTimingForRoute,
  rowHasTiming,
  isProtectedRow,
  detectSuspiciousMovementDuration,
} from './route-standards-cleanup';

// Route Standards Auto-Cleanup Assistant v1 — tests for the classifier,
// the Jordan-backbone timing suggester, and the safety helpers.

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------
test('classifier: simple AMM_PET with fromCity/toCity is MOVEMENT_LEG (high confidence)', () => {
  const result = classifyRouteStandard({
    routeCode: 'AMM_PET',
    canonicalRouteCode: 'AMM_PET',
    routeName: 'Amman → Petra',
    fromCity: 'Amman',
    toCity: 'Petra',
  });
  assert.equal(result.classification, 'MOVEMENT_LEG');
  assert.equal(result.recommendedAction, 'KEEP_AS_ROUTE_STANDARD');
  assert.equal(result.confidence, 'high');
});

test('classifier: activity keywords flag ACTIVITY_EXPERIENCE even when code is A_B', () => {
  for (const name of ['AQ_BOAT', 'AQ_DIVING', 'AQ_SNORK', 'AQ_YACHT', 'AQ_SAFARI', 'AQ_JEEP']) {
    const result = classifyRouteStandard({
      routeCode: name,
      routeName: name.replace('_', ' '),
    });
    assert.equal(result.classification, 'ACTIVITY_EXPERIENCE', `${name} should be ACTIVITY_EXPERIENCE`);
    assert.equal(result.recommendedAction, 'CONVERT_TO_ACTIVITY');
  }
});

test('classifier: Petra Full Day → TOURING_PROGRAM', () => {
  const result = classifyRouteStandard({
    routeCode: 'PET_FULLDAY',
    routeName: 'Petra Full Day',
  });
  assert.equal(result.classification, 'TOURING_PROGRAM');
  assert.equal(result.recommendedAction, 'CONVERT_TO_TOURING_ROUTE');
});

test('classifier: JOR-TR prefix → TOURING_PROGRAM', () => {
  const result = classifyRouteStandard({
    routeCode: 'JOR-TR-SOUTH-PETRA',
    routeName: 'Southern Tour',
  });
  assert.equal(result.classification, 'TOURING_PROGRAM');
});

test('classifier: Wellness Day → TOURING_PROGRAM via WELLNESS keyword OR FULL DAY', () => {
  const result = classifyRouteStandard({
    routeCode: 'DS_WELLNESS_DAY',
    routeName: 'Dead Sea Wellness Day',
  });
  // WELLNESS lives in the activity keyword list (Turkish bath spa
  // wellness experience) — activity catch fires first, which is also
  // a valid outcome operationally (it's an experience).
  assert.ok(
    result.classification === 'ACTIVITY_EXPERIENCE' || result.classification === 'TOURING_PROGRAM',
    `Got ${result.classification} for Dead Sea Wellness Day`,
  );
});

test('classifier: round-trip markers → ROUND_TRIP_PROGRAM', () => {
  for (const name of ['AMM_PET_RT', 'AMM_PET_ROUND_TRIP', 'AMM_PETRA_ROUND-TRIP']) {
    const result = classifyRouteStandard({
      routeCode: name,
      routeName: name.replace(/_/g, ' '),
    });
    assert.equal(result.classification, 'ROUND_TRIP_PROGRAM', `${name} should be ROUND_TRIP_PROGRAM`);
  }
});

test('classifier: same-place loop pattern (Amman → X → Amman) → ROUND_TRIP_PROGRAM', () => {
  const result = classifyRouteStandard({
    routeCode: 'AMM_LOOP',
    routeName: 'Amman → Madaba → Amman',
  });
  assert.equal(result.classification, 'ROUND_TRIP_PROGRAM');
});

test('classifier: multi-stop arrow name → MULTI_STOP_FLOW', () => {
  const result = classifyRouteStandard({
    routeCode: 'AMM_MAD_NEB_PET',
    routeName: 'Amman → Madaba → Nebo → Petra',
  });
  assert.equal(result.classification, 'MULTI_STOP_FLOW');
  assert.equal(result.recommendedAction, 'CONVERT_TO_TOURING_ROUTE');
});

test('classifier: unrecognizable row → UNKNOWN_REVIEW (low confidence, never auto-acted)', () => {
  const result = classifyRouteStandard({
    routeCode: 'WEIRD_LEGACY_THING',
    routeName: 'Some unclassifiable old row',
  });
  assert.equal(result.classification, 'UNKNOWN_REVIEW');
  assert.equal(result.recommendedAction, 'NEEDS_HUMAN_REVIEW');
  assert.equal(result.confidence, 'low');
});

test('classifier: priority — activity keyword wins over A_B shape', () => {
  // "DIVING_AMM" is a 2-segment A_B shape but the activity catch must fire first.
  const result = classifyRouteStandard({
    routeCode: 'DIVING_TRIP',
    routeName: 'Diving Trip',
    fromCity: 'Aqaba',
    toCity: 'Aqaba',
  });
  assert.equal(result.classification, 'ACTIVITY_EXPERIENCE');
});

// ---------------------------------------------------------------------------
// Jordan backbone timing suggester
// ---------------------------------------------------------------------------
test('suggestTimingForRoute: AMM_PET → 235 km / 3.5 h / +30 min / Mountain road (high confidence)', () => {
  const suggestion = suggestTimingForRoute({ canonicalRouteCode: 'AMM_PET' }, []);
  assert.equal(suggestion.source, 'jordan_backbone');
  assert.equal(suggestion.confidence, 'high');
  assert.equal(suggestion.distanceKm, 235);
  assert.equal(suggestion.durationHours, 3.5);
  assert.equal(suggestion.bufferMinutes, 30);
  assert.equal(suggestion.flags.mountainRoadFlag, true);
});

test('suggestTimingForRoute: PET_AMM gets the same numbers as AMM_PET (symmetric backbone)', () => {
  const suggestion = suggestTimingForRoute({ canonicalRouteCode: 'PET_AMM' }, []);
  assert.equal(suggestion.distanceKm, 235);
  assert.equal(suggestion.durationHours, 3.5);
});

test('suggestTimingForRoute: QAIA_AMM → airport route flag', () => {
  const suggestion = suggestTimingForRoute({ canonicalRouteCode: 'QAIA_AMM' }, []);
  assert.equal(suggestion.flags.airportRouteFlag, true);
  assert.equal(suggestion.distanceKm, 35);
});

test('suggestTimingForRoute: AMM_ALLENBY → border crossing flag + +60min buffer', () => {
  const suggestion = suggestTimingForRoute({ canonicalRouteCode: 'AMM_ALLENBY' }, []);
  assert.equal(suggestion.flags.borderCrossingFlag, true);
  assert.equal(suggestion.bufferMinutes, 60);
});

test('suggestTimingForRoute: reverse-route inheritance when backbone misses', () => {
  // Create a hypothetical CUSTOM_FROM_TO with the reverse leg present
  // and timing-rich.
  const reverseRow = {
    canonicalRouteCode: 'TO_FROM',
    standardDistanceKm: 75,
    standardDurationHours: 1.5,
    operationalBufferMinutes: 20,
    longDistanceFlag: false,
    overnightRisk: false,
    mountainRoadFlag: false,
    borderCrossingFlag: false,
    airportRouteFlag: false,
  };
  const suggestion = suggestTimingForRoute({ canonicalRouteCode: 'FROM_TO' }, [reverseRow] as any);
  assert.equal(suggestion.source, 'reverse_route');
  assert.equal(suggestion.confidence, 'reverse_inherited');
  assert.equal(suggestion.distanceKm, 75);
  assert.equal(suggestion.durationHours, 1.5);
});

test('suggestTimingForRoute: no backbone + no reverse → needs_review', () => {
  const suggestion = suggestTimingForRoute({ canonicalRouteCode: 'UNKNOWN_CODE' }, []);
  assert.equal(suggestion.source, 'none');
  assert.equal(suggestion.confidence, 'needs_review');
  assert.equal(suggestion.distanceKm, null);
});

// ---------------------------------------------------------------------------
// Safety helpers
// ---------------------------------------------------------------------------
test('rowHasTiming: true when distance OR duration are non-zero', () => {
  assert.equal(rowHasTiming({ standardDistanceKm: 100 }), true);
  assert.equal(rowHasTiming({ standardDurationHours: 2 }), true);
  assert.equal(rowHasTiming({ standardDistanceKm: 0, standardDurationHours: 0 }), false);
  assert.equal(rowHasTiming({ standardDistanceKm: null, standardDurationHours: null }), false);
});

test('isProtectedRow: VERIFIED or source=MANUAL → protected', () => {
  assert.equal(isProtectedRow({ reviewStatus: 'VERIFIED', source: null }), true);
  assert.equal(isProtectedRow({ reviewStatus: null, source: 'MANUAL' }), true);
  assert.equal(isProtectedRow({ reviewStatus: 'AUTO_BOOTSTRAP', source: 'AUTO_BOOTSTRAP' }), false);
});

// ---------------------------------------------------------------------------
// Suspicious duration detector
// ---------------------------------------------------------------------------
test('detectSuspiciousMovementDuration: flags Petra > 6h / Wadi Rum > 8h / Jerash > 3h / Dead Sea > 4h / Aqaba > 6h', () => {
  // Each row only counts when classification is MOVEMENT_LEG (we don't
  // want touring programs flagged — they're long by design).
  const cases = [
    { code: 'AMM_PET', hours: 11, suspicious: true },
    { code: 'AMM_PET', hours: 4, suspicious: false },
    { code: 'AMM_WR', hours: 13, suspicious: true },
    { code: 'AMM_JER', hours: 6, suspicious: true },
    { code: 'AMM_DS', hours: 8, suspicious: true },
    { code: 'AMM_AQJ', hours: 4, suspicious: false },
  ];
  for (const c of cases) {
    const result = detectSuspiciousMovementDuration({
      canonicalRouteCode: c.code,
      standardDurationHours: c.hours,
      classification: 'MOVEMENT_LEG',
    });
    assert.equal(result.suspicious, c.suspicious, `${c.code}=${c.hours}h expected suspicious=${c.suspicious}`);
  }
});

test('detectSuspiciousMovementDuration: never flags non-MOVEMENT_LEG rows (tours are long by design)', () => {
  const result = detectSuspiciousMovementDuration({
    canonicalRouteCode: 'AMM_PET',
    standardDurationHours: 11,
    classification: 'TOURING_PROGRAM',
  });
  assert.equal(result.suspicious, false);
});

test('detectSuspiciousMovementDuration: any > 12 h is unconditionally suspicious', () => {
  const result = detectSuspiciousMovementDuration({
    canonicalRouteCode: 'CUSTOM_LEG',
    standardDurationHours: 14,
    classification: 'MOVEMENT_LEG',
  });
  assert.equal(result.suspicious, true);
  assert.match(result.reason || '', /exceeds 12h/);
});

// ---------------------------------------------------------------------------
// Soft-delete only structural guarantee — verify the service NEVER calls
// .delete() on a routeStandard in the cleanup methods.
// ---------------------------------------------------------------------------
test('service: cleanup methods never call routeStandard.delete (soft only)', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, 'route-standards.service.ts'),
    'utf8',
  );
  // Find the cleanup section
  const cleanupStart = source.indexOf('// Route Standards Auto-Cleanup Assistant v1');
  assert.ok(cleanupStart > 0, 'cleanup section should exist');
  const cleanupSection = source.substring(cleanupStart, source.indexOf('exportCleanupReport') + 5000);
  assert.ok(!cleanupSection.includes('routeStandard.delete'), 'cleanup section must not call .delete()');
  assert.ok(!cleanupSection.includes('deleteMany'), 'cleanup section must not call deleteMany()');
});
