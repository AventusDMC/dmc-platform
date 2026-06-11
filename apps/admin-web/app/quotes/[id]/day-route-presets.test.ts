import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DAY_ROUTE_PRESETS, CUSTOM_DAY_PRESET_KEY, getDayRoutePreset, CLASSIC_JORDAN_ROUTE_TEMPLATES, getClassicJordanRouteTemplate } from './day-route-presets';

// Phase R.4b-1 — static day route preset catalog + the live planner dropdown
// that prefills the title/narrative editor (no schema, no pricing, no apply).

const REQUIRED_KEYS = [
  'qaia-amman',
  'amman-city-tour',
  'amman-jerash-amman',
  'amman-madaba-nebo-petra',
  'petra-wadi-rum',
  'wadi-rum-dead-sea',
  'dead-sea-free-day',
  'dead-sea-bethany-dead-sea',
  'dead-sea-qaia',
];

describe('R.4b-1 — DAY_ROUTE_PRESETS catalog', () => {
  it('1. contains all standard 8-day Jordan route presets', () => {
    const keys = DAY_ROUTE_PRESETS.map((p) => p.key);
    for (const key of REQUIRED_KEYS) {
      assert.ok(keys.includes(key), `missing preset: ${key}`);
    }
  });

  it('2. every preset has the required fields', () => {
    for (const p of DAY_ROUTE_PRESETS) {
      assert.ok(typeof p.key === 'string' && p.key.length > 0, `key on ${p.key}`);
      assert.ok(typeof p.label === 'string' && p.label.length > 0, `label on ${p.key}`);
      assert.ok(typeof p.defaultTitle === 'string' && p.defaultTitle.length > 0, `defaultTitle on ${p.key}`);
      assert.ok(typeof p.narrative === 'string' && p.narrative.length > 0, `narrative on ${p.key}`);
      assert.ok(typeof p.narrativeTemplateKey === 'string' && p.narrativeTemplateKey.length > 0, `narrativeTemplateKey on ${p.key}`);
      assert.ok(Array.isArray(p.stops), `stops on ${p.key}`);
      assert.ok(Array.isArray(p.entranceKeys), `entranceKeys on ${p.key}`);
      assert.ok(Array.isArray(p.activityKeys), `activityKeys on ${p.key}`);
      assert.ok(['ARRIVAL_TRANSFER', 'DEPARTURE_TRANSFER', 'TOURING_FULL_DAY', 'NONE'].includes(p.transportHint), `transportHint on ${p.key}`);
      // overnightCity is null only on the departure preset
      assert.ok(p.overnightCity === null || typeof p.overnightCity === 'string', `overnightCity on ${p.key}`);
    }
  });

  it('3. defaultTitle is the route title only — never prefixed with "Day NN"', () => {
    for (const p of DAY_ROUTE_PRESETS) {
      assert.ok(!/^day\s*\d/i.test(p.defaultTitle), `defaultTitle "${p.defaultTitle}" must not start with "Day NN"`);
      assert.ok(!/—/.test(p.defaultTitle) || !/^day/i.test(p.defaultTitle), `no "Day NN —" prefix on ${p.key}`);
    }
    // the gate's headline preset prefills exactly the clean route title
    const petra = getDayRoutePreset('amman-madaba-nebo-petra')!;
    assert.equal(petra.defaultTitle, 'Amman / Madaba / Mount Nebo / Petra');
  });

  it('4. getDayRoutePreset returns null for Custom / unknown, and the preset for a known key', () => {
    assert.equal(getDayRoutePreset(CUSTOM_DAY_PRESET_KEY), null);
    assert.equal(getDayRoutePreset(null), null);
    assert.equal(getDayRoutePreset('nope'), null);
    assert.equal(getDayRoutePreset('petra-wadi-rum')!.defaultTitle, 'Petra Visit / Wadi Rum');
  });

  it('5. catalog carries no pricing/cost data', () => {
    assert.doesNotMatch(JSON.stringify(DAY_ROUTE_PRESETS), /\bprice\b|\bcost\b|\bamount\b|markup|sellPrice/i);
  });
});

const plannerSource = readFileSync(new URL('./QuoteServicePlanner.tsx', import.meta.url), 'utf8');

describe('R.4b-1 — live planner dropdown wiring', () => {
  it('6. renders a "Route / Day Plan" dropdown defaulting to Custom', () => {
    assert.ok(plannerSource.includes('Route / Day Plan'), 'dropdown label present');
    assert.ok(plannerSource.includes('Custom (free text)'), 'default Custom option present');
    assert.ok(plannerSource.includes('DAY_ROUTE_PRESETS.map'), 'options mapped from catalog');
    assert.ok(plannerSource.includes('value={CUSTOM_DAY_PRESET_KEY}'), 'select value pinned to Custom (one-shot prefill)');
  });

  it('7. selecting a preset prefills the title + narrative editor (no auto-save)', () => {
    assert.ok(plannerSource.includes('onPresetSelect'), 'onPresetSelect wired');
    assert.ok(/titleDraft:\s*preset\.defaultTitle/.test(plannerSource), 'prefills title from preset');
    assert.ok(plannerSource.includes('preset.narrative'), 'prefills narrative from preset');
    // prefill opens the existing R.1d editor (setActiveDayDescription) — it does
    // not call saveDayContent directly, so nothing persists until Save is clicked.
    const idx = plannerSource.indexOf('onPresetSelect={(preset)');
    const block = plannerSource.slice(idx, idx + 700);
    assert.ok(block.includes('setActiveDayDescription'), 'prefill sets the editor draft state');
    assert.ok(!/saveDayContent\(/.test(block), 'preset selection must NOT auto-save');
  });
});

// ---------------------------------------------------------------------------
// Phase S.2D-3A — curated 4/5/6/7-day route templates + the petra-dead-sea preset.
// Config/constants only: no UI, no apply, no generator/schema/pricing change.
// ---------------------------------------------------------------------------

describe('S.2D-3A — petra-dead-sea preset + classic route templates', () => {
  it('1/2. the petra-dead-sea preset exists with the approved fields', () => {
    const p = getDayRoutePreset('petra-dead-sea');
    assert.ok(p, 'petra-dead-sea preset present');
    assert.equal(p!.defaultTitle, 'Petra Visit / Dead Sea');
    assert.equal(p!.narrative, 'Spend the morning exploring the rose-red city of Petra, then transfer to the Dead Sea. Overnight at the Dead Sea.');
    assert.equal(p!.overnightCity, 'Dead Sea');
    assert.equal(p!.origin, 'Petra');
    assert.equal(p!.destination, 'Dead Sea');
    assert.deepEqual(p!.entranceKeys, ['petra']);
    assert.deepEqual(p!.activityKeys, []);
    assert.equal(p!.transportHint, 'TOURING_FULL_DAY');
    assert.equal(p!.guideHint, 'Local guide for Petra');
  });

  it('3-6. every template key resolves to a real preset', () => {
    for (const [duration, keys] of Object.entries(CLASSIC_JORDAN_ROUTE_TEMPLATES)) {
      for (const key of keys) {
        assert.ok(getDayRoutePreset(key), `template ${duration}-day key "${key}" resolves to a preset`);
      }
    }
  });

  it('7. template lengths match the duration', () => {
    assert.equal(getClassicJordanRouteTemplate(4)!.length, 4);
    assert.equal(getClassicJordanRouteTemplate(5)!.length, 5);
    assert.equal(getClassicJordanRouteTemplate(6)!.length, 6);
    assert.equal(getClassicJordanRouteTemplate(7)!.length, 7);
    // no template for unsupported durations (8-day stays the generator literal)
    assert.equal(getClassicJordanRouteTemplate(8), null);
    assert.equal(getClassicJordanRouteTemplate(3), null);
    assert.equal(getClassicJordanRouteTemplate(undefined), null);
  });

  it('8. template overnight chains match the approved sequences (= durationDays - 1)', () => {
    const overnights = (duration: number) =>
      getClassicJordanRouteTemplate(duration)!
        .map((k) => getDayRoutePreset(k)!.overnightCity)
        .filter((c): c is string => Boolean(c));
    assert.deepEqual(overnights(4), ['Amman', 'Petra', 'Dead Sea']);
    assert.deepEqual(overnights(5), ['Amman', 'Petra', 'Wadi Rum', 'Dead Sea']);
    assert.deepEqual(overnights(6), ['Amman', 'Amman', 'Petra', 'Wadi Rum', 'Dead Sea']);
    assert.deepEqual(overnights(7), ['Amman', 'Amman', 'Petra', 'Wadi Rum', 'Dead Sea', 'Dead Sea']);
    // each overnight chain has exactly durationDays - 1 nights
    for (const d of [4, 5, 6, 7]) assert.equal(overnights(d).length, d - 1, `${d}-day has ${d - 1} nights`);
  });

  it('9. no unsupported places are introduced (only canonical preset cities/keys)', () => {
    // The one new preset uses only the canonical Petra entrance + Dead Sea overnight.
    const p = getDayRoutePreset('petra-dead-sea')!;
    const allowedEntrance = ['petra', 'madaba', 'mount-nebo', 'jerash', 'bethany', 'amman-citadel', 'roman-theatre'];
    for (const key of p.entranceKeys) assert.ok(allowedEntrance.includes(key), `entrance key ${key} is canonical`);
    // templates reference only existing preset keys (no invented stops/places)
    const presetKeys = new Set(DAY_ROUTE_PRESETS.map((x) => x.key));
    for (const keys of Object.values(CLASSIC_JORDAN_ROUTE_TEMPLATES)) {
      for (const k of keys) assert.ok(presetKeys.has(k), `template key ${k} is a known preset`);
    }
  });

  it('10. existing preset catalog is unchanged except for the added petra-dead-sea', () => {
    // all originally-required keys still resolve
    for (const key of REQUIRED_KEYS) assert.ok(getDayRoutePreset(key), `existing preset ${key} still present`);
    // exactly one new preset was added (10 total = 9 original + petra-dead-sea)
    assert.equal(DAY_ROUTE_PRESETS.length, REQUIRED_KEYS.length + 1);
    assert.ok(DAY_ROUTE_PRESETS.some((x) => x.key === 'petra-dead-sea'));
  });
});
