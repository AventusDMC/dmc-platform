import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Touring Legs Phase 2A — quote display integration tests.
//
// The strip is a client React component that fetches /api/touring-routes/
// :id/legs-summary and renders text/badges. Testing rendering through
// jsdom isn't set up in this workspace, so the contract is asserted by
// source-grep against the component file (the same admin-web test
// pattern used by *.page.test.tsx — see MEMORY.md).
//
// What we lock in:
//   - The component renders nothing when summary.legCount === 0 (the
//     spec's fallback: "if no legs exist, quote behaves exactly as
//     before").
//   - It calls /api/touring-routes/:id/legs-summary, not any pricing
//     endpoint.
//   - It shows the missing-Route-Standard warning when applicable.
//   - It NEVER imports pricing modules / types / services — the
//     pricing-untouched guarantee from the spec.

const componentSource = readFileSync(
  join(__dirname, 'TouringRouteJourneyFlowStrip.tsx'),
  'utf8',
);

const plannerSource = readFileSync(
  join(__dirname, 'QuoteServicePlanner.tsx'),
  'utf8',
);

test('strip renders touring leg flow when legs exist (flow string + drive line)', () => {
  // Flow string lives in summary.flow and is rendered in the strip.
  assert.ok(componentSource.includes('summary.flow'));
  // Drive line shows duration / buffer / distance — they all come from
  // the legs summary, not from any quote total.
  assert.ok(componentSource.includes('totalDriveDurationHours'));
  assert.ok(componentSource.includes('totalBufferMinutes'));
  assert.ok(componentSource.includes('totalDriveDistanceKm'));
});

test('strip returns null when summary has zero legs (fallback to existing behaviour)', () => {
  // The spec's "if no legs exist, quote behaves exactly as before"
  // contract — the early return guards.
  assert.match(componentSource, /summary\.legCount\s*===\s*0/);
  // Confirm there's an actual null-return guard immediately after.
  assert.match(componentSource, /summary\.legCount\s*===\s*0\)\s*return null;/);
});

test('strip surfaces missing-Route-Standard warning quietly', () => {
  assert.ok(componentSource.includes('missingRouteStandardCount'));
  assert.ok(componentSource.includes('missing timing standard'));
});

test('strip never references pricing modules / services / types — pricing untouched', () => {
  // Spec: "no pricing changes. No changes to: TouringRoutePricing,
  // quote total cost, sell price, margin, booking conversion pricing."
  // Source-grep guards against any pricing import sneaking in.
  const forbiddenSubstrings = [
    'TouringRoutePricing',
    'touringRoutePricing',
    'pricing-diagnostics',
    'sellPrice',
    'margin',
    'totalCost',
    'commercialPricing',
    'priceComponents',
  ];
  for (const banned of forbiddenSubstrings) {
    assert.ok(
      !componentSource.includes(banned),
      `JourneyFlowStrip must not reference "${banned}" — pricing is read by separate components.`,
    );
  }
});

test('strip risk chips cover the spec list: Long Distance, Border, Mountain, Airport, Overnight', () => {
  // Spec task 3: "Show risk/confidence chips if present: Long Distance,
  // Border Crossing, Mountain Road, Airport Sensitive, Overnight Risk."
  assert.ok(componentSource.includes('Long distance'));
  assert.ok(componentSource.includes('Border crossing'));
  assert.ok(componentSource.includes('Mountain road'));
  assert.ok(componentSource.includes('Airport sensitive'));
  assert.ok(componentSource.includes('Overnight risk'));
});

test('strip shows "Touring flow requires coordination" insight on high-risk routes', () => {
  // Spec task 8 — quiet operator insight.
  assert.ok(componentSource.includes('Touring flow requires coordination'));
});

test('strip fetches from /api/touring-routes/:id/legs-summary, never from a pricing endpoint', () => {
  assert.match(componentSource, /\/api\/touring-routes\/\$\{touringRouteId\}\/legs-summary/);
  // No /api/quotes pricing endpoints touched.
  assert.ok(!componentSource.includes('/api/quotes/'));
  // No transport-pricing endpoints touched.
  assert.ok(!componentSource.includes('/api/transport-pricing'));
});

// --------------------------------------------------------------------
// Wiring into the planner
// --------------------------------------------------------------------
test('QuoteServicePlanner imports and renders the JourneyFlowStrip exactly once', () => {
  // Import present.
  assert.ok(plannerSource.includes("import { TouringRouteJourneyFlowStrip }"));
  // Rendered once — guards against accidental duplicate usage.
  const matches = plannerSource.match(/<TouringRouteJourneyFlowStrip\b/g) || [];
  assert.equal(matches.length, 1, 'JourneyFlowStrip should be rendered exactly once on the planner');
});

test('QuoteServicePlanner renders the strip only when item has a touring route id (fallback safety)', () => {
  // The rendering site must be gated by `item.touringRoute?.id` so
  // services without a touring route don't fetch garbage.
  assert.match(
    plannerSource,
    /item\.touringRoute\?\.id\s*\?\s*\(\s*<TouringRouteJourneyFlowStrip\b/,
  );
});
