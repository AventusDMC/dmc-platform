import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — Slice 2B-2: the add-activity preview-then-confirm flow that
// pairs with the Slice 2B-1 backend guard. Source-grep tests (same convention as
// builder-v2-add-activity) pinning: the new preview proxy, the client preview +
// guarded-create handlers, the typed-error mapping, the prop threading, and the
// two-step (Preview price → Confirm & add) UI that shows only the client-safe
// selling price (no cost/margin).

const previewRouteSrc = readFileSync(new URL('../../api/quotes/[id]/v2/experiences/item/preview/route.ts', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — add-activity preview-confirm (Slice 2B-2)', () => {
  it('adds a read-only create-preview proxy forwarding to the backend preview route', () => {
    contains(previewRouteSrc, [
      '`${API_BASE_URL}/quotes/${id}/v2/experiences/item/preview`',
      "method: 'POST'",
      'buildActorHeaders(request)',
    ]);
  });

  it('client previews first, then creates with previewToken + acknowledgedDelta', () => {
    contains(clientSrc, [
      'const handlePreviewAddItem = async',
      '`/api/quotes/${quote.id}/v2/experiences/item/preview`',
      'const handleAddItem = async',
      'previewToken?: string',
      'acknowledgedDelta: acknowledgedDelta === true',
      'onPreviewAddItem={canAddItem ? handlePreviewAddItem : undefined}',
    ]);
  });

  it('client maps every guarded typed error code to a safe message', () => {
    contains(clientSrc, [
      'addItemErrorMessage',
      'invalid_preview_token',
      'stale_preview',
      'not_resolvable',
      'confirmation_required',
      'rate_changed',
      'compensation_failed',
    ]);
    // The add-activity success toast is client-safe: selling total only (the old
    // cost/sell toast was replaced).
    contains(clientSrc, ['Quote selling total is now']);
  });

  it('builder threads onPreviewAddItem alongside the guarded onAddItem', () => {
    contains(builderSrc, [
      'onPreviewAddItem?:',
      'onPreviewAddItem,',
      'onPreviewAddItem={onPreviewAddItem}',
      'previewToken?: string, acknowledgedDelta?: boolean',
    ]);
  });

  it('experiences step exposes the two-step Preview → Confirm UI, showing selling price only', () => {
    contains(stepSrc, [
      'export type PreviewAddHandler',
      'onPreviewAddItem: PreviewAddHandler',
      'const doPreview = async',
      'const doConfirm = async',
      'onAddItem(currentPayload(), preview.previewToken, true)',
      'Preview price',
      'Confirm & add',
      'Projected selling price',
    ]);
    // The confirm step must not render cost/margin.
    assert.ok(!/Projected (net )?cost|Projected margin/i.test(stepSrc), 'add-activity confirm must not show cost/margin');
  });
});
