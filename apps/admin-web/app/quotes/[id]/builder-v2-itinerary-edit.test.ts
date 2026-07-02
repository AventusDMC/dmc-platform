import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — Phase B, Slice 1: itinerary day management (add / edit meta /
// delete-empty). Source-grep tests (same convention as builder-v2-classic-guidance)
// that pin the flag gating, the V2-scoped routing, the delete-empty affordance, and
// the no-regression fallback to the existing shared-route text edit.

const pageSrc = readFileSync(new URL('./builder-v2/page.tsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/itinerary-step.tsx', import.meta.url), 'utf8');
const addRouteSrc = readFileSync(new URL('../../api/quotes/[id]/v2/itinerary/day/route.ts', import.meta.url), 'utf8');
const dayRouteSrc = readFileSync(
  new URL('../../api/quotes/[id]/v2/itinerary/day/[dayId]/route.ts', import.meta.url),
  'utf8',
);

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — itinerary day management (Phase B, Slice 1)', () => {
  it('page.tsx reads the ITINERARY_EDIT flag and role/status-gates the V2 edit surface', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_ITINERARY_EDIT === 'true'",
      'const canEditItinerary =',
      'hasRequiredRole(role, ["admin", "operations"]) && PREVIEW_EDITABLE_STATUSES.has(quoteStatusCode)',
      'itineraryEditEnabled={itineraryEditFlag}',
      'canEditItinerary={canEditItinerary}',
    ]);
  });

  it('client gates the edit handlers by role/status and routes through the V2-scoped endpoints', () => {
    contains(clientSrc, [
      // Structural affordances are withheld unless role/status allows (flag OFF or
      // wrong role → no handlers → hidden in the step).
      'itineraryEditEnabled={canEditItinerary && itineraryEditEnabled}',
      'onAddDay={canEditItinerary ? handleAddDay : undefined}',
      'onEditDay={canEditItinerary ? handleEditDay : undefined}',
      'onDeleteDay={canEditItinerary ? handleDeleteDay : undefined}',
      // V2-scoped routes — never the shared Classic itinerary endpoint.
      '`/api/quotes/${quote.id}/v2/itinerary/day`',
      '`/api/quotes/${quote.id}/v2/itinerary/day/${dayId}`',
      // Safe error mapping for the backend machine codes.
      '"day_not_empty"',
      '"feature_disabled"',
      'Move or remove items before deleting this day.',
    ]);
  });

  it('builder threads editEnabled + add/edit/delete handlers into the Itinerary step', () => {
    contains(builderSrc, [
      'editEnabled={itineraryEditEnabled}',
      'onAddDay={onAddDay}',
      'onEditDay={onEditDay}',
      'onDeleteDay={onDeleteDay}',
    ]);
  });

  it('itinerary step gates Add/Delete on the flag+handlers and edits via V2 with a legacy fallback', () => {
    contains(stepSrc, [
      'const canAdd = editEnabled && Boolean(onAddDay)',
      'const useV2Edit = editEnabled && Boolean(onEditDay)',
      'const canDelete = editEnabled && Boolean(onDeleteDay)',
      'Add day',
      // Delete confirms first, then calls the handler (backend enforces empty-only).
      'window.confirm(',
      // V2 edit path when enabled…
      'if (useV2Edit && onEditDay) {',
      // …and the EXISTING shared-route text edit is preserved unchanged (no regression).
      '`/api/itinerary/day/${day.id}`',
    ]);
  });

  it('the V2-scoped proxy routes forward to the new backend itinerary-edit endpoints', () => {
    contains(addRouteSrc, ['`${API_BASE_URL}/quotes/${id}/v2/itinerary/day`', "method: 'POST'"]);
    contains(dayRouteSrc, [
      '`${API_BASE_URL}/quotes/${id}/v2/itinerary/day/${dayId}`',
      "'PATCH'",
      "'DELETE'",
    ]);
  });

  it('the itinerary edit path is pricing-inert (no item apply / recalculation in the step)', () => {
    // The structural day edit must never call the pricing apply/preview endpoints or
    // trigger a recalculation — it only touches day title/notes + add/delete.
    for (const fragment of ['apply-preview', 'recalculate', 'items/', 'previewToken']) {
      assert.ok(!stepSrc.includes(fragment), `Itinerary step must NOT reference: ${fragment}`);
    }
  });
});
