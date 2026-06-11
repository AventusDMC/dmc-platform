import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = readFileSync(new URL('./RoutePlannerPreview.tsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('./QuoteItineraryWorkspace.tsx', import.meta.url), 'utf8');
const presetsSource = readFileSync(new URL('./day-route-presets.ts', import.meta.url), 'utf8');

function expectSourceContains(src: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(src.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('Phase S.2D-1 — Route Planner preview (UI-only, not persisted)', () => {
  it('renders a preview section, one row per day, reusing DAY_ROUTE_PRESETS', () => {
    expectSourceContains(source, [
      "export function RoutePlannerPreview",
      // reuses the existing preset catalog (no new place data)
      "import { DAY_ROUTE_PRESETS, getDayRoutePreset } from './day-route-presets'",
      'aria-label="Route Planner (preview)"',
      // one row per itinerary day
      'sorted.map((day) =>',
      'Day {String(day.dayNumber).padStart(2, \'0\')}',
      'Current title:',
      // preset dropdown with the catalog labels + the two non-preset options
      'DAY_ROUTE_PRESETS.map((p) =>',
      '<option key={p.key} value={p.key}>{p.label}</option>',
      'Custom / keep current',
      'Leisure / no transport',
      // preview values from the selected preset
      'preset.defaultTitle',
      'preset.narrative',
      'preset.overnightCity',
      // explicit preview-only labelling
      'Preview only — not saved yet',
    ]);
  });

  it('is preview-only — no persistence, no PATCH, no generator/service calls', () => {
    // No network writes of any kind from this component (the real guarantee).
    assert.ok(!/\bfetch\s*\(/.test(source), 'must not call fetch');
    // Call-shaped checks (so the descriptive header comment doesn't false-positive):
    assert.ok(!/method:\s*['"]PATCH['"]/i.test(source), 'must not issue a PATCH request');
    assert.ok(!/quotes\/[^'"`]*\/itinerary\/day/.test(source), 'must not hit the day endpoint');
    assert.ok(!source.includes('tailor-made-draft'), 'must not call the generator/apply endpoints');
    assert.ok(!/['"`][^'"`]*\/items['"`]/.test(source), 'must not create QuoteItems');
    // Selecting a preset only updates LOCAL preview state — it never mutates the
    // passed-in day objects (no assignment to day.title / day.narrative).
    assert.ok(!/day\.title\s*=/.test(source), 'must not mutate day.title');
    assert.ok(!/day\.narrative\s*=/.test(source), 'must not mutate day narrative');
    // The only state is the local preview selection.
    expectSourceContains(source, ['const [selected, setSelected] = useState']);
  });

  it('warns that 5-day classic routing is not yet automatable', () => {
    expectSourceContains(source, [
      '5-day classic routing is operationally tight and requires a curated departure preset before automation.',
    ]);
  });

  it('is mounted in the itinerary workspace as a preview-only details section', () => {
    expectSourceContains(workspaceSource, [
      "import { RoutePlannerPreview } from './RoutePlannerPreview';",
      '<RoutePlannerPreview',
      'days={quoteItinerary.days.map((day) => ({ dayNumber: day.dayNumber, title: day.title }))}',
      'id="qb-route-planner"',
    ]);
  });

  it('the preset catalog it reuses is unchanged (no new places exposed here)', () => {
    // S.2D-1 must not add places/presets — it only consumes the existing catalog.
    expectSourceContains(presetsSource, ['export const DAY_ROUTE_PRESETS', 'export const CUSTOM_DAY_PRESET_KEY']);
  });
});
