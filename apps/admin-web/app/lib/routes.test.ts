import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTouringRouteOptionLabel,
  formatTouringRouteSecondaryMeta,
  touringRouteMatchesSearch,
} from './routes';

// Phase 3D.1G — touring-route picker label/search helpers. These make the route
// dropdown usable (the generic city→city label produced many duplicates).

describe('formatTouringRouteOptionLabel', () => {
  test('shows route name — code — duration (the requested format)', () => {
    assert.equal(
      formatTouringRouteOptionLabel({
        name: 'Petra -> Wadi Rum ON',
        code: 'JOR-TR-SOUTH-PETRA-WADI-RUM-ON',
        durationDays: 2,
      }),
      'Petra → Wadi Rum ON — JOR-TR-SOUTH-PETRA-WADI-RUM-ON — 2 days',
    );
  });

  test('singular "day" for a one-day route', () => {
    assert.equal(
      formatTouringRouteOptionLabel({
        name: 'Ajloun & Jerash',
        code: 'JOR-TR-AMMAN-AJLOUN-JERASH',
        durationDays: 1,
      }),
      'Ajloun & Jerash — JOR-TR-AMMAN-AJLOUN-JERASH — 1 day',
    );
  });

  test('two routes that collapse to the same city→city label stay distinguishable', () => {
    // Both would render "Amman → Amman" under the old generic label.
    const a = formatTouringRouteOptionLabel({
      name: 'Amman -> Amman City Sites -> Amman RT',
      code: 'JOR-TR-CENTRAL-AMMAN-CITY-RT',
      durationDays: 1,
    });
    const b = formatTouringRouteOptionLabel({
      name: 'Amman -> Dana -> Petra ON',
      code: 'JOR-TR-SOUTH-AMMAN-DANA-PETRA-ON',
      durationDays: 2,
    });
    assert.notEqual(a, b);
    assert.match(a, /JOR-TR-CENTRAL-AMMAN-CITY-RT/);
    assert.match(b, /JOR-TR-SOUTH-AMMAN-DANA-PETRA-ON/);
  });

  test('gracefully omits a missing code and missing/zero duration', () => {
    assert.equal(formatTouringRouteOptionLabel({ name: 'My Route', code: null, durationDays: null }), 'My Route');
    assert.equal(formatTouringRouteOptionLabel({ name: 'My Route', code: '', durationDays: 0 }), 'My Route');
    assert.equal(formatTouringRouteOptionLabel({ name: '', code: 'X', durationDays: 3 }), 'Untitled route — X — 3 days');
  });
});

describe('touringRouteMatchesSearch', () => {
  const route = {
    name: 'Amman -> Dana -> Petra ON',
    code: 'JOR-TR-SOUTH-AMMAN-DANA-PETRA-ON',
    startCity: 'Amman',
    mainDestinations: ['Dana', 'Petra'],
  };

  test('empty / whitespace term matches everything', () => {
    assert.equal(touringRouteMatchesSearch(route, ''), true);
    assert.equal(touringRouteMatchesSearch(route, '   '), true);
  });

  test('matches by route name (case-insensitive)', () => {
    assert.equal(touringRouteMatchesSearch(route, 'dana'), true);
    assert.equal(touringRouteMatchesSearch(route, 'PETRA'), true);
  });

  test('matches by route code', () => {
    assert.equal(touringRouteMatchesSearch(route, 'jor-tr-south'), true);
  });

  test('matches by a main destination', () => {
    assert.equal(touringRouteMatchesSearch({ ...route, name: 'X', code: 'Y' }, 'petra'), true);
  });

  test('multi-token query requires all tokens to match somewhere', () => {
    assert.equal(touringRouteMatchesSearch(route, 'dana petra'), true);
    assert.equal(touringRouteMatchesSearch(route, 'dana aqaba'), false);
  });

  test('non-matching term returns false', () => {
    assert.equal(touringRouteMatchesSearch(route, 'wadi rum'), false);
  });
});

describe('formatTouringRouteSecondaryMeta', () => {
  test('summarizes start, destinations, and active pricing count', () => {
    const meta = formatTouringRouteSecondaryMeta({
      startCity: 'Amman',
      mainDestinations: ['Dana', 'Petra'],
      touringRoutePricings: [{ active: true } as never, { active: false } as never, { active: true } as never],
    });
    assert.match(meta, /Start: Amman/);
    assert.match(meta, /Destinations: Dana, Petra/);
    assert.match(meta, /2 active pricing rows/);
  });

  test('singular "row" and treats undefined active as active (matches default-row logic)', () => {
    const meta = formatTouringRouteSecondaryMeta({
      startCity: '',
      mainDestinations: [],
      touringRoutePricings: [{} as never],
    });
    assert.match(meta, /1 active pricing row\b/);
    assert.doesNotMatch(meta, /Start:/);
    assert.doesNotMatch(meta, /Destinations:/);
  });
});
