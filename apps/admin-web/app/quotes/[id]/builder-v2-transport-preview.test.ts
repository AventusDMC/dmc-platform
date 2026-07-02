import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const transportSrc = read('../../../components/quote/v2/steps/transport-step.tsx');
const modalSrc = read('../../../components/quote/v2/steps/pricing-preview-modal.tsx');
const typesSrc = read('../../../lib/quote-types.ts');
const builderSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const pageSrc = read('./builder-v2/page.tsx');
// Backend flag module lives in the api workspace.
const flagsSrc = read('../../../../api/src/quotes/quote-pricing-preview-flags.ts');
const serviceSrc = read('../../../../api/src/quotes/quotes.service.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

describe('Quote Builder V2 — transport pricing preview (PR #565, preview-only)', () => {
  it('transport row preview is gated on the new flag (default OFF → read-only)', () => {
    contains(transportSrc, [
      'transportPreviewEnabled',
      'const canPreview = Boolean(onPreviewItem && svc.quoteItemId && transportPreviewEnabled)',
      'Preview transport pricing',
    ]);
  });

  it('transport step still reuses the shared PricingPreviewModal (not the meal ItemPricingApplyModal), and never writes directly', () => {
    // Transport Apply Phase T-A (single-leg transfers) reuses PricingPreviewModal's
    // opt-in apply (see builder-v2-transport-apply.test.ts); it must NOT pull in the
    // meal ItemPricingApplyModal and must NOT post apply-preview from the step itself
    // (the client owns the apply request).
    excludes(transportSrc, [
      'ItemPricingApplyModal',
      'apply-preview',
    ]);
  });

  it('staff guidance says transport stays Classic/read-only unless the flag is ON', () => {
    contains(transportSrc, [
      'Transport remains Classic/read-only unless the transport pricing-preview flag is enabled',
      // and when ON it is explicitly preview-only (no apply)
      'preview-only (read-only) — there is no apply',
    ]);
  });

  it('flag threads page → client → builder → transport step, gated by role/status', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_TRANSPORT_PREVIEW === 'true'",
      'transportPreviewEnabled={transportPreviewEnabled}',
    ]);
    contains(clientSrc, [
      'transportPreviewEnabled = false', // safe default
      // only when the user may preview (role + editable status) AND the flag is ON
      'transportPreviewEnabled={canPreviewPricing && transportPreviewEnabled}',
    ]);
    contains(builderSrc, ['transportPreviewEnabled={transportPreviewEnabled}']);
  });

  it('client preview handler posts to the read-only /preview endpoint (never apply)', () => {
    contains(clientSrc, ['/api/quotes/${quote.id}/items/${quoteItemId}/preview']);
  });

  it('preview modal displays the pricing basis/reason when returned, and still shows warnings', () => {
    // pricingBasis is a typed field on the read-only preview result.
    contains(typesSrc, ['pricingBasis?: string | null']);
    contains(modalSrc, [
      'result.pricingBasis',
      'Pricing basis',
      // warnings + the not-resolvable banner are still rendered
      'result.pricingResolvable === false',
      'Pricing could not be fully resolved for this item.',
      'result.warnings',
    ]);
  });

  it('V2 default flag is untouched (independent of the transport flag)', () => {
    excludes(pageSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
  });
});

describe('Quote Builder V2 — transport preview backend gate (PR #565)', () => {
  it('backend exposes a dedicated transport-preview flag, default OFF', () => {
    contains(flagsSrc, [
      "export const QUOTE_PRICING_TRANSPORT_PREVIEW_FLAG = 'quote.pricingTransportPreview'",
      'export function isQuotePricingTransportPreviewEnabled()',
      "readBooleanEnv('QUOTE_PRICING_TRANSPORT_PREVIEW')",
    ]);
  });

  it('computeItemPreview blocks transport as out-of-scope when the transport flag is OFF', () => {
    contains(serviceSrc, [
      'isQuotePricingTransportPreviewEnabled',
      'existingItem.transportServiceTypeId || existingItem.routeId || existingItem.touringRouteId',
      'if (isTransportPreviewItem && !isQuotePricingTransportPreviewEnabled())',
      // transport stays preview-only: apply is blocked by the existing supported-type gate
      'supported-type gate (isMealActivityGuide || isEntranceApply) already',
    ]);
  });

  it('transport preview flag is its own gate, separate from the Phase T-A apply flag', () => {
    // Transport Apply Phase T-A adds a SEPARATE apply flag (see
    // builder-v2-transport-apply.test.ts); preview remains its own independent gate.
    contains(flagsSrc, ["readBooleanEnv('QUOTE_PRICING_TRANSPORT_PREVIEW')"]);
    contains(flagsSrc, ["export const QUOTE_PRICING_TRANSPORT_APPLY_FLAG = 'quote.pricingTransportApply'"]);
  });
});
