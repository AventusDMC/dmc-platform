import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const proxySrc = read('../../../app/api/quotes/[id]/items/[itemId]/preview/route.ts');
const modalSrc = read('../../../components/quote/v2/steps/pricing-preview-modal.tsx');
const experiencesSrc = read('../../../components/quote/v2/steps/experiences-step.tsx');
const transportSrc = read('../../../components/quote/v2/steps/transport-step.tsx');
const builderSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const pageSrc = read('./builder-v2/page.tsx');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
  }
}

describe('Quote Builder V2 — read-only pricing preview modal', () => {
  it('proxy forwards POST to the backend preview endpoint only', () => {
    contains(proxySrc, [
      'export async function POST',
      '/quotes/${id}/items/${itemId}/preview',
      "method: 'POST'",
    ]);
    // The proxy is preview-only — no apply/mutation verbs.
    excludes(proxySrc, ["method: 'PATCH'", "method: 'DELETE'", "method: 'PUT'"]);
  });

  it('modal renders current/projected/delta + read-only labelling; apply is opt-in and delegated', () => {
    contains(modalSrc, [
      'Preview only — no changes will be saved',
      'Pricing preview is not enabled.',
      '>Current<',
      '>Projected<',
      '>Delta<',
      'This item',
      'Quote totals',
    ]);
    // Apply is OPT-IN: it shows only when applyEnabled + an onApply handler are
    // passed (hotel apply, PR #578). When the caller omits them the modal is
    // preview-only — the default for experiences/transport/external.
    contains(modalSrc, ['applyEnabled', 'onApply', 'previewToken']);
    // Even with apply on, the modal NEVER writes directly — it delegates to the
    // onApply handler. No mutation fetch / verbs live in the modal itself.
    excludes(modalSrc, [
      'fetch(',
      "method: 'PATCH'",
      "method: 'POST'",
      "method: 'DELETE'",
      'method: "PATCH"',
      'method: "POST"',
      'method: "DELETE"',
    ]);
  });

  it('Experiences + Transport rows expose the preview affordance and keep prior features', () => {
    for (const src of [experiencesSrc, transportSrc]) {
      contains(src, [
        'PricingPreviewModal',
        'onPreviewItem',
        // existing features retained
        'EditInClassicLink',
        'DisplayTextEditor',
      ]);
      // The step itself performs no mutation fetch.
      excludes(src, ['fetch(']);
    }
    // Experiences keeps the generic read-only preview label.
    contains(experiencesSrc, ['Preview pricing']);
    // Transport preview is now behind its own flag (PR #565) and uses a transport-
    // specific label; default OFF means transport rows are read-only.
    contains(transportSrc, ['Preview transport pricing', 'transportPreviewEnabled']);
  });

  it('builder threads onPreviewItem to Experiences + Transport (read-only)', () => {
    contains(builderSrc, ['onPreviewItem', 'onPreviewItem={onPreviewItem}']);
  });

  it('client posts ONLY to the preview endpoint and gates by role flag (no apply mutation)', () => {
    contains(clientSrc, [
      '/items/${quoteItemId}/preview',
      'onPreviewItem={canPreviewPricing ? handlePreviewItem : undefined}',
    ]);
    // The preview handler must POST to /preview and never PATCH/DELETE an item.
    const start = clientSrc.indexOf('const handlePreviewItem');
    const end = clientSrc.indexOf('const handleEnablePublicLink');
    const region = start >= 0 && end > start ? clientSrc.slice(0, start) : clientSrc;
    void region;
    const previewFn = clientSrc.slice(clientSrc.indexOf('const handlePreviewItem'), clientSrc.indexOf('return ('));
    assert.ok(previewFn.includes('method: "POST"'), 'preview handler must use POST');
    excludes(previewFn, ['method: "PATCH"', 'method: "DELETE"']);
  });

  it('page gates the preview affordance to admin/operations + editable statuses', () => {
    contains(pageSrc, [
      'canPreviewPricing',
      'hasRequiredRole(role, ["admin", "operations"])',
      'PREVIEW_EDITABLE_STATUSES',
      'canPreviewPricing={canPreviewPricing}',
    ]);
  });
});
