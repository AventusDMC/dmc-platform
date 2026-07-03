import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — Phase B, Slice 2: add Activity item. Source-grep tests (same
// convention as builder-v2-itinerary-edit) that pin the flag gating, the V2-scoped
// routing, the activity-only add form, the catalog + day selection, and the
// no-regression preservation of the Classic guidance.

const pageSrc = readFileSync(new URL('./builder-v2/page.tsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');
const routeSrc = readFileSync(new URL('../../api/quotes/[id]/v2/experiences/item/route.ts', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — add Activity item (Phase B, Slice 2)', () => {
  it('page.tsx reads the ITEM_CREATE flag and role/status-gates the add surface', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_ITEM_CREATE === 'true'",
      'const canAddItem =',
      'hasRequiredRole(role, ["admin", "operations"]) && PREVIEW_EDITABLE_STATUSES.has(quoteStatusCode)',
      'itemCreateEnabled={itemCreateFlag}',
      'canAddItem={canAddItem}',
    ]);
  });

  it('client gates the add handler by role/status and posts to the V2-scoped endpoint', () => {
    contains(clientSrc, [
      'itemCreateEnabled={canAddItem && itemCreateEnabled}',
      'onAddItem={canAddItem ? handleAddItem : undefined}',
      '`/api/quotes/${quote.id}/v2/experiences/item`',
      '"feature_disabled"',
      '"out_of_scope"',
      'Activity added successfully',
    ]);
  });

  it('builder threads the add flag + handler + itinerary days into the Experiences step', () => {
    contains(builderSrc, [
      'addItemEnabled={itemCreateEnabled}',
      'onAddItem={onAddItem}',
      'itineraryDays={quote.itinerary}',
    ]);
  });

  it('experiences step gates the add form on the flag + handler + days, activity-only, via the catalog', () => {
    contains(stepSrc, [
      'function AddActivityPanel',
      'const canAddActivity = Boolean(addItemEnabled && onAddItem && itineraryDays',
      '<AddActivityPanel',
      // Activity-only payload with all explicit identity fields.
      'itemType: "activity"',
      'activityRateVariantId: variantId',
      'serviceDate',
      // Reuses the existing catalog proxy for activity + rate-variant selection.
      '"/api/activities"',
      // Classic guidance is preserved (no regression to the read-only experiences).
      'ClassicGuidance',
    ]);
  });

  it('the V2-scoped proxy route forwards to the new backend item-create endpoint', () => {
    contains(routeSrc, ['`${API_BASE_URL}/quotes/${id}/v2/experiences/item`', "method: 'POST'"]);
  });
});
