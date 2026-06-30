import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const hotelsSrc = read('../../../components/quote/v2/steps/hotels-step.tsx');
const modalSrc = read('../../../components/quote/v2/steps/pricing-preview-modal.tsx');
const builderSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const pageSrc = read('./builder-v2/page.tsx');
const typesSrc = read('../../../lib/quote-types.ts');
const flagsSrc = read('../../../../api/src/quotes/quote-pricing-preview-flags.ts');
const serviceSrc = read('../../../../api/src/quotes/quotes.service.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

describe('Quote Builder V2 — hotel pricing APPLY (PR #578, gated, default OFF)', () => {
  // ---- backend flag ----
  it('backend exposes a dedicated hotel-APPLY flag (default OFF) separate from preview', () => {
    contains(flagsSrc, [
      "export const QUOTE_PRICING_HOTEL_APPLY_FLAG = 'quote.pricingHotelApply'",
      'export function isQuotePricingHotelApplyEnabled()',
      "readBooleanEnv('QUOTE_PRICING_HOTEL_APPLY')",
    ]);
    // preview flag is still its own, independent gate
    contains(flagsSrc, ["readBooleanEnv('QUOTE_PRICING_HOTEL_PREVIEW')"]);
  });

  // ---- backend apply guard ----
  it('apply guard opens for hotel ONLY behind the hotel-apply flag; reuses the existing write path', () => {
    contains(serviceSrc, [
      'isQuotePricingHotelApplyEnabled',
      'const isHotelApply = Boolean(supportedItem.service && this.isHotelService(supportedItem.service)) && isQuotePricingHotelApplyEnabled()',
      'if (!isMealActivityGuide && !isEntranceApply && !isHotelApply)',
    ]);
  });

  it('hotel apply blocks changing the underlying service (re-price in place only)', () => {
    contains(serviceSrc, [
      'if (isHotelApply && data?.serviceId !== undefined && data.serviceId !== supportedItem.serviceId)',
      'not supported by apply',
    ]);
  });

  it('hotel apply uses item-only integrity (no sibling re-sync like entrance) and delegates to updateItem', () => {
    contains(serviceSrc, [
      'const integrityOk = isEntranceApply ? itemIntegrityOk && quoteIntegrityOk : itemIntegrityOk',
      'await this.updateItem(itemId, data, actor)',
    ]);
  });

  // ---- audit safety ----
  it('successful apply writes a sanitized audit row (serviceType, before/after totals) and never the token', () => {
    contains(serviceSrc, [
      "action: 'quote.pricing.apply'",
      'serviceType: supportedItem?.service?.serviceType?.code ?? null',
      'previousItemTotalCost: before.item.totalCost',
      'newItemTotalCost: after.item.totalCost',
    ]);
    // The audit metadata is a flat totals/payload summary — the preview token is
    // never part of it (verified at the unit level in quote-item-apply-guard.test.ts).
    const auditStart = serviceSrc.indexOf("action: 'quote.pricing.apply'");
    const auditEnd = serviceSrc.indexOf('} catch (auditErr)');
    const auditRegion = serviceSrc.slice(auditStart, auditEnd > auditStart ? auditEnd : auditStart + 1500);
    excludes(auditRegion, ['previewToken', 'tokenPayload', 'getPreviewTokenSecret']);
  });

  // ---- preview result carries a token the apply reuses ----
  it('PricingPreviewResult carries the previewToken the apply replays', () => {
    contains(typesSrc, ['previewToken?: string | null']);
  });

  // ---- modal: opt-in apply ----
  it('preview modal gains an opt-in apply action (Apply hotel price) that replays the preview token', () => {
    contains(modalSrc, [
      'applyEnabled',
      'onApply?: ApplyItemPricingHandler',
      'applyLabel',
      'const previewToken = result?.previewToken ?? null',
      'onApply(quoteItemId, {}, previewToken, deltaNonZero ? ack : false)',
      // loading + success + error + acknowledgement states
      'setApplying',
      'applySuccess',
      'applyError',
      'I understand this will update the quote totals.',
    ]);
  });

  it('modal apply re-prices in place — it never writes directly (delegates to onApply)', () => {
    excludes(modalSrc, ['fetch(', "method: 'POST'", 'method: "POST"', "method: 'PATCH'", 'apply-preview']);
  });

  it('modal stays preview-only by default (apply UI is gated on applyEnabled + onApply)', () => {
    contains(modalSrc, [
      'Preview only — no changes will be saved',
      'applyEnabled && onApply',
    ]);
  });

  // ---- hotels step eligibility + badge ----
  it('hotel apply is offered ONLY for matched priced rows behind the apply flag (eligibility)', () => {
    contains(hotelsSrc, [
      'const canApply = Boolean(canPreview && onApplyItemPricing && hotelApplyEnabled && hotel.pricedQuoteItemId)',
      // canPreview itself already requires a matched priced QuoteItem
      'const canPreview = Boolean(onPreviewItem && hotel.pricedQuoteItemId && hotelPreviewEnabled)',
      // the modal receives the apply handler ONLY when the row is apply-eligible
      'onApply={canApply ? onApplyItemPricing : undefined}',
      'applyLabel="Apply hotel price"',
    ]);
  });

  it('hotels step header promotes to "Apply enabled" when the apply scope is active', () => {
    contains(hotelsSrc, [
      'const applyActive = Boolean(previewActive && onApplyItemPricing && hotelApplyEnabled)',
      'statusLabel={applyActive ? "Apply enabled" : hasEditableAlternatives ? "Set primary only" : previewActive ? "Preview only" : "View only"}',
    ]);
  });

  // ---- flag plumbing page → client → builder → hotels step ----
  it('hotel-apply flag threads page → client → builder → hotels step and requires preview + role', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY === 'true'",
      'hotelApplyEnabled={hotelApplyEnabled}',
    ]);
    contains(clientSrc, [
      'hotelApplyEnabled = false', // safe default
      // apply requires role (canPreviewPricing) AND the preview flag AND the apply flag
      'hotelApplyEnabled={canPreviewPricing && hotelPreviewEnabled && hotelApplyEnabled}',
      // apply reuses the SAME apply handler as meal/activity/guide/entrance
      'onApplyItemPricing={canPreviewPricing ? handleApplyItemPricing : undefined}',
    ]);
    contains(builderSrc, [
      'hotelApplyEnabled={hotelApplyEnabled}',
      'onApplyItemPricing={onApplyItemPricing}',
    ]);
  });

  // ---- scope guards: transport + external stay preview-only; default flag untouched ----
  it('no transport or external-package APPLY flag is introduced (they stay preview-only)', () => {
    excludes(flagsSrc, ['TRANSPORT_APPLY', 'TransportApply', 'EXTERNAL_PACKAGE_APPLY', 'ExternalPackageApply']);
  });

  it('V2 default routing flag is untouched by this feature', () => {
    excludes(pageSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
    excludes(hotelsSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
    excludes(flagsSrc, ['QUOTE_BUILDER_V2_DEFAULT']);
  });
});
