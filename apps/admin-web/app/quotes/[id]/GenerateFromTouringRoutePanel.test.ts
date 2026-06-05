import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 3D.1C guard: the apply is NON-DESTRUCTIVE. We assert against the actual
// fetch()/method code (not prose). Uses cwd-relative paths (no import.meta) to
// stay CJS-safe for the build.
function readPanelSource(): string {
  const candidates = [
    resolve(process.cwd(), 'app/quotes/[id]/GenerateFromTouringRoutePanel.tsx'),
    resolve(process.cwd(), 'apps/admin-web/app/quotes/[id]/GenerateFromTouringRoutePanel.tsx'),
  ];
  const path = candidates.find((c) => existsSync(c)) ?? candidates[0];
  return readFileSync(path, 'utf8');
}

test('panel never issues a destructive method (no DELETE, no PATCH)', () => {
  const src = readPanelSource();
  assert.ok(!/method:\s*'DELETE'/.test(src), 'must not DELETE anything');
  assert.ok(!/method:\s*'PATCH'/.test(src), 'must not PATCH (no overwrite of existing days/items)');
});

test('apply uses only create-style writes: POST days/items + PUT pois', () => {
  const src = readPanelSource();
  assert.match(src, /\/quotes\/\$\{quoteId\}\/itinerary\/day/, 'creates itinerary days');
  assert.match(src, /\/quotes\/\$\{quoteId\}\/items/, 'creates the transport package item');
  assert.match(src, /\/itinerary\/day\/\$\{dayId\}\/pois/, 'assigns POIs on the newly-created days');
});

test('generated days carry empty notes (composer remains the narrative source)', () => {
  const src = readPanelSource();
  assert.match(src, /notes:\s*''/, 'days must be created with empty notes — no composed narrative stored');
});

test('apply is gated and blocks when the quote already has itinerary days', () => {
  const src = readPanelSource();
  assert.match(src, /canApply/, 'apply must be gated by the apply plan');
  assert.match(src, /existingDayCount/, 'apply must consider existing itinerary days');
  assert.match(src, /\/quotes\/\$\{quoteId\}\/itinerary`/, 'a pre-flight GET on the itinerary must run before writing');
});
