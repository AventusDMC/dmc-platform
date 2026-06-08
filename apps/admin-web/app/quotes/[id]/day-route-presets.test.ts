import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DAY_ROUTE_PRESETS, CUSTOM_DAY_PRESET_KEY, getDayRoutePreset } from './day-route-presets';

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
