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

// Phase 3D.1G — route picker shows the real route name + code (not the generic
// city→city label), and offers a search filter so operators can find a route.
test('route picker labels options by route name + code (not generic city→city)', () => {
  const src = readPanelSource();
  assert.match(src, /formatTouringRouteOptionLabel\(route\)/, 'options must use the touring-route name/code label');
  assert.ok(!/formatRouteLabel\(/.test(src), 'must not fall back to the generic fromCity→toCity label here');
});

test('route picker offers a name/code/destination search filter', () => {
  const src = readPanelSource();
  assert.match(src, /touringRouteMatchesSearch/, 'a search filter helper must drive the option list');
  assert.match(src, /filteredTouringRoutes\.map\(/, 'options must render from the filtered list');
});

test('selection still keys off route.id (apply/fetch behavior unchanged)', () => {
  const src = readPanelSource();
  // The <option> value remains route.id and selection still calls loadRoute — the
  // label change is display-only and does not alter what gets fetched/applied.
  assert.match(src, /value=\{route\.id\}/, 'option value must remain the route id');
  assert.match(src, /onChange=\{\(e\) => void loadRoute\(e\.target\.value\)\}/, 'selection must still call loadRoute(id)');
});
