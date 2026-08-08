import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — Slice 3 (frontend): the add-GUIDE preview-then-confirm flow
// that pairs with the guarded backend guide create (PR #787). Source-grep tests
// (same convention as builder-v2-add-activity-preview-confirm): pinning the guide
// panel, its guide fields + payload, the reuse of the SAME guarded handlers, the
// two-step (Preview price → Confirm & add) UI showing ONLY the selling price, and
// the typed guide-error mapping. Activity behavior is asserted unchanged elsewhere.

const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — add-guide preview-confirm (Slice 3 frontend)', () => {
  it('experiences step exposes an AddGuidePanel rendered alongside the activity panel', () => {
    contains(stepSrc, [
      'function AddGuidePanel',
      '<AddGuidePanel onAddItem={onAddItem} onPreviewAddItem={onPreviewAddItem} itineraryDays={itineraryDays} />',
      'Add guide',
      'Guide service',
      'Guide type',
    ]);
  });

  it('the guide panel builds an itemType=guide payload with the guide fields', () => {
    contains(stepSrc, [
      'itemType: "guide"',
      'serviceId,',
      'guideType,',
      'guideDuration,',
      'guideOvernight:',
    ]);
  });

  it('guide type/duration options are local|escort and half_day|full_day; overnight is escort-only', () => {
    contains(stepSrc, [
      'value: "local"',
      'value: "escort"',
      'value: "half_day"',
      'value: "full_day"',
      'const isEscort = guideType === "escort"',
      'isEscort ? (',
    ]);
  });

  it('guide panel loads guide-type SERVICES (not people) and filters client-side', () => {
    contains(stepSrc, [
      'fetch("/api/services"',
      'function isGuideService',
      '.filter(isGuideService)',
    ]);
  });

  it('guide panel reuses the two-step Preview → Confirm UI, showing selling price only', () => {
    contains(stepSrc, [
      'const doPreview = async',
      'const doConfirm = async',
      'onAddItem(currentPayload(), preview.previewToken, true)',
      'Preview price',
      'Confirm & add',
      'Projected selling price',
    ]);
    // The guide confirm step must not render cost/margin anywhere in the step.
    assert.ok(!/Projected (net )?cost|Projected margin/i.test(stepSrc), 'add-guide confirm must not show cost/margin');
  });

  it('client maps the guide typed error codes (reuses the guarded handlers)', () => {
    contains(clientSrc, [
      'addItemErrorMessage',
      'missing_field',
      'service_not_found',
      'not_guide_service',
      'invalid_preview_token',
      'stale_preview',
      'not_resolvable',
      'confirmation_required',
      'rate_changed',
      'compensation_failed',
    ]);
    // Same generic handlers post the guide payload verbatim to the V2 route.
    contains(clientSrc, [
      'const handlePreviewAddItem = async',
      'const handleAddItem = async',
      '`/api/quotes/${quote.id}/v2/experiences/item/preview`',
      '`/api/quotes/${quote.id}/v2/experiences/item`',
    ]);
  });
});
