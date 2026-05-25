import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRouteStandardLookup,
  classifyRouteTimingConfidence,
  lookupRouteStandardByCode,
  normalizeRouteCode,
  presentRouteTimingConfidence,
  type RouteStandardSummary,
} from './route-standards';

function makeStandard(overrides: Partial<RouteStandardSummary> = {}): RouteStandardSummary {
  return {
    id: 'rs-1',
    routeCode: 'AMM_PET',
    routeName: 'Amman to Petra',
    fromCity: 'Amman',
    toCity: 'Petra',
    destinationArea: null,
    standardDistanceKm: 235,
    standardDurationHours: 3.5,
    operationalBufferMinutes: 30,
    longDistanceFlag: false,
    overnightRisk: false,
    mountainRoadFlag: false,
    borderCrossingFlag: false,
    airportRouteFlag: false,
    notes: null,
    isActive: true,
    ...overrides,
  };
}

describe('route standards lookup (Phase 2A)', () => {
  it('normalizes spaces and dashes into UPPER_SNAKE', () => {
    assert.equal(normalizeRouteCode('amm pet'), 'AMM_PET');
    assert.equal(normalizeRouteCode('AMM-PET'), 'AMM_PET');
    assert.equal(normalizeRouteCode('  jor tr south-amman-petra-on  '), 'JOR_TR_SOUTH_AMMAN_PETRA_ON');
    assert.equal(normalizeRouteCode(null), '');
    assert.equal(normalizeRouteCode(undefined), '');
  });

  it('builds an active-only lookup keyed by normalized code', () => {
    const lookup = buildRouteStandardLookup([
      makeStandard({ routeCode: 'AMM_PET' }),
      makeStandard({ id: 'rs-2', routeCode: 'PET_WR' }),
      makeStandard({ id: 'rs-3', routeCode: 'OLD_CODE', isActive: false }),
    ]);
    assert.equal(lookup.size, 2);
    assert.ok(lookup.has('AMM_PET'));
    assert.ok(lookup.has('PET_WR'));
    assert.equal(lookup.has('OLD_CODE'), false);
  });

  it('handles null / undefined / empty array gracefully', () => {
    assert.equal(buildRouteStandardLookup(null).size, 0);
    assert.equal(buildRouteStandardLookup(undefined).size, 0);
    assert.equal(buildRouteStandardLookup([]).size, 0);
  });

  it('lookupRouteStandardByCode matches case/format-insensitively', () => {
    const lookup = buildRouteStandardLookup([makeStandard({ routeCode: 'AMM_PET' })]);
    assert.equal(lookupRouteStandardByCode(lookup, 'amm pet')?.routeCode, 'AMM_PET');
    assert.equal(lookupRouteStandardByCode(lookup, 'AMM-PET')?.routeCode, 'AMM_PET');
    assert.equal(lookupRouteStandardByCode(lookup, 'PET_WR'), null);
    assert.equal(lookupRouteStandardByCode(lookup, null), null);
  });

  it('classifyRouteTimingConfidence follows priority order border > mountain > long > airport > normal', () => {
    assert.equal(
      classifyRouteTimingConfidence({ borderCrossingFlag: true, mountainRoadFlag: true, longDistanceFlag: true, airportRouteFlag: true }),
      'Border Delay Risk',
    );
    assert.equal(classifyRouteTimingConfidence({ mountainRoadFlag: true, longDistanceFlag: true }), 'Mountain Road Delay Risk');
    assert.equal(classifyRouteTimingConfidence({ longDistanceFlag: true }), 'Long Distance Drive');
    assert.equal(classifyRouteTimingConfidence({ standardDurationHours: 6 }), 'Long Distance Drive');
    assert.equal(classifyRouteTimingConfidence({ airportRouteFlag: true }), 'Heavy Traffic Risk');
    assert.equal(classifyRouteTimingConfidence({}), 'Normal Traffic');
  });

  it('presentRouteTimingConfidence returns a color band + detail copy per label', () => {
    const border = presentRouteTimingConfidence({ borderCrossingFlag: true });
    assert.equal(border.label, 'Border Delay Risk');
    assert.ok(border.bg);
    assert.ok(border.text);
    assert.ok(border.detail.toLowerCase().includes('border'));

    const normal = presentRouteTimingConfidence({});
    assert.equal(normal.label, 'Normal Traffic');
  });
});
