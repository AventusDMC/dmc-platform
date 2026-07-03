import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — Phase B, Slice 3: add Guide item. Source-grep tests that pin
// the guide form (activity + guide via the SAME flag/handler/route), the guide
// catalog rule (/api/services filtered to guide, NOT /api/guides), and the
// type-aware success toast. The flag plumbing is unchanged from Slice 2 (reused).

const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — add Guide item (Phase B, Slice 3)', () => {
  it('experiences step add form supports guide alongside activity', () => {
    contains(stepSrc, [
      'function AddItemPanel',
      'Add guide',
      'itemType: "guide"',
      'guideType',
      'guideDuration',
      'overnight',
      // Activity still supported in the same panel (no regression).
      'itemType: "activity"',
    ]);
  });

  it('guide catalog uses /api/services filtered to guide-type, NOT /api/guides', () => {
    contains(stepSrc, [
      '"/api/services"',
      'isGuideServiceRecord',
      // taxonomy substring rule mirrors the backend resolveServiceTaxonomyGroup
      "includes(\"guide\")",
    ]);
    // /api/guides is guide PEOPLE (assignment) — must never be the guide-item catalog.
    assert.ok(!stepSrc.includes('/api/guides'), 'guide form must not reference /api/guides');
  });

  it('client reuses the V2 item-create route + a type-aware success toast', () => {
    contains(clientSrc, [
      '`/api/quotes/${quote.id}/v2/experiences/item`',
      // Toast/label is derived from the payload itemType (Activity | Guide).
      'itemType',
      'added successfully',
      '"out_of_scope"',
    ]);
  });

  it('builder threads the same add flag + handler + itinerary days (reused plumbing)', () => {
    contains(builderSrc, [
      'addItemEnabled={itemCreateEnabled}',
      'onAddItem={onAddItem}',
      'itineraryDays={quote.itinerary}',
    ]);
  });
});
