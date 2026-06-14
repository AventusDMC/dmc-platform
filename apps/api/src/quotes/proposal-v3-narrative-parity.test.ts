import { test } from 'node:test';
import * as assert from 'node:assert/strict';

// Phase P.3X-5E-3A — GOLDEN PARITY: the API-local copy of the R.7B narrative
// helper must produce byte-identical output to the admin-web original for every
// vector + locale. This test imports BOTH copies and compares them directly.
//
// Cross-workspace import is safe here: tsconfig.build.json excludes **/*.test.ts,
// so nest build never compiles this file (the admin-web helper is pure TS and is
// only loaded by the ts-node test runner). proposal-v3 itself does NOT import the
// API copy — it stays dormant until P.3X-5E-3B.
import * as apiHelper from './day-narrative-preview';
import * as webHelper from '../../../admin-web/app/quotes/[id]/day-narrative-preview';

type Vector = { label: string; input: any };

// Representative cases from the audit (arrival/departure/round-trip/linear/visit-
// origin/transition + applied guide + applied activity).
const VECTORS: Vector[] = [
  { label: 'Arrival Amman', input: { title: 'Arrival Amman', overnightCity: 'Amman', dayNumber: 1 } },
  { label: 'Departure (origin from notes)', input: { title: 'Departure', notes: 'Transfer from Dead Sea to QAIA for the departure flight.', dayNumber: 8 } },
  { label: 'Departure (bare)', input: { title: 'Departure', dayNumber: 8 } },
  { label: 'Round-trip Amman / Jerash / Amman', input: { title: 'Amman / Jerash / Amman', dayNumber: 2 } },
  { label: 'Linear Amman / Madaba / Mount Nebo / Petra', input: { title: 'Amman / Madaba / Mount Nebo / Petra', dayNumber: 3 } },
  { label: 'Visit-origin Petra Visit / Wadi Rum', input: { title: 'Petra Visit / Wadi Rum', dayNumber: 4 } },
  { label: 'Transition Wadi Rum / Dead Sea', input: { title: 'Wadi Rum / Dead Sea', dayNumber: 5 } },
  { label: 'Round-trip Dead Sea / Bethany / Dead Sea', input: { title: 'Dead Sea / Bethany / Dead Sea', dayNumber: 6 } },
  { label: 'City tour (single)', input: { title: 'Amman City Tour', dayNumber: 2 } },
  { label: 'Empty title → leisure', input: { title: '', dayNumber: 7 } },
  { label: 'Applied local guide', input: { title: 'Amman / Jerash / Amman', dayNumber: 2, appliedServices: [{ kind: 'guide' }] } },
  {
    label: 'Applied Wadi Rum Jeep Tour',
    input: { title: 'Wadi Rum / Dead Sea', dayNumber: 5, appliedServices: [{ kind: 'activity', name: 'Wadi Rum Jeep Tour' }] },
  },
  {
    label: 'Applied guide + activity + entrance',
    input: {
      title: 'Amman / Madaba / Mount Nebo / Petra',
      dayNumber: 3,
      appliedServices: [{ kind: 'guide' }, { kind: 'activity', name: 'Wadi Rum Jeep Tour' }, { kind: 'entrance', name: 'Petra Ticket' }],
    },
  },
];

const LOCALES = ['en', 'es', 'pt', 'ar'] as const;

for (const vector of VECTORS) {
  for (const locale of LOCALES) {
    test(`P.3X-5E-3A parity: "${vector.label}" [${locale}] is byte-identical`, () => {
      const apiOut = apiHelper.buildDayNarrativePreview(vector.input, { locale });
      const webOut = webHelper.buildDayNarrativePreview(vector.input, { locale });
      // Full structural parity (text + sourceLayer + flags + usedServices).
      assert.deepEqual(apiOut, webOut);
      // Explicit byte-for-byte on the rendered text.
      assert.equal(apiOut.text, webOut.text);
    });
  }
}

test('P.3X-5E-3A parity: isClientSafeNarrative agrees (safe + unsafe/internal text)', () => {
  const samples = [
    'After breakfast, visit Jerash, then return to your hotel for overnight.', // safe
    'Transfer with Sedan from supplier at cost 500 markup 20%', // unsafe: vehicle/supplier/cost/markup
    'Overnight: No', // unsafe internal marker
    'Daily Full Day | Jordan Program', // unsafe internal descriptor tokens
    '', // empty → false
    'زيارة جرش ثم العودة إلى الفندق للمبيت.', // safe Arabic
  ];
  for (const s of samples) {
    assert.equal(apiHelper.isClientSafeNarrative(s), webHelper.isClientSafeNarrative(s), `isClientSafeNarrative("${s}")`);
  }
});

test('P.3X-5E-3A parity: locale + direction helpers + locale set agree', () => {
  assert.deepEqual([...apiHelper.NARRATIVE_LOCALES], [...webHelper.NARRATIVE_LOCALES]);
  for (const v of ['en', 'es', 'pt', 'ar', 'fr', '', null, undefined, 'AR', ' es ']) {
    assert.equal(apiHelper.resolveNarrativeLocale(v as any), webHelper.resolveNarrativeLocale(v as any), `resolveNarrativeLocale(${JSON.stringify(v)})`);
  }
  for (const loc of ['en', 'es', 'pt', 'ar'] as const) {
    assert.equal(apiHelper.narrativeTextDirection(loc), webHelper.narrativeTextDirection(loc), `narrativeTextDirection(${loc})`);
  }
});

test('P.3X-5E-3A: the API copy is NOT imported by the proposal-v3 mapper (stays dormant)', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const mapper = readFileSync(resolve(__dirname, 'proposal-v3.mapper.ts'), 'utf8');
  assert.ok(!/day-narrative-preview/.test(mapper), 'proposal-v3.mapper.ts must not import the narrative helper yet');
});
