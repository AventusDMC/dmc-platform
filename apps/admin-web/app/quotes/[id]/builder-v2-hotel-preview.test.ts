import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const hotelsSrc = read('../../../components/quote/v2/steps/hotels-step.tsx');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const typesSrc = read('../../../lib/quote-types.ts');
const builderSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const pageSrc = read('./builder-v2/page.tsx');
const flagsSrc = read('../../../../api/src/quotes/quote-pricing-preview-flags.ts');
const serviceSrc = read('../../../../api/src/quotes/quotes.service.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

describe('Quote Builder V2 — hotel pricing preview (PR #569, preview-only)', () => {
  it('hotel row preview is gated on the new flag + a matched priced line (default OFF → diagnostics only)', () => {
    contains(hotelsSrc, [
      'hotelPreviewEnabled',
      'const canPreview = Boolean(onPreviewItem && hotel.pricedQuoteItemId && hotelPreviewEnabled)',
      'Preview hotel pricing',
      'PricingPreviewModal',
      'quoteItemId={hotel.pricedQuoteItemId!}',
    ]);
  });

  it('hotels step keeps diagnostics + Why? and has NO apply/confirm control (preview-only)', () => {
    // diagnostics retained
    contains(hotelsSrc, ['diagnostics?.reasons', 'Why?', 'Contract on file', 'onSetPrimary']);
    // no apply/edit/write
    excludes(hotelsSrc, ['onApply', 'apply-preview', 'Apply', "method: 'POST'", 'method: "POST"', 'fetch(']);
  });

  it('staff guidance still says hotel editing/contracts/rates are managed in Classic', () => {
    contains(hotelsSrc, ['managed in Classic Builder']);
  });

  it('adapter carries the matched priced hotel QuoteItem id (both paths) for the preview target', () => {
    contains(adapterSrc, [
      'quoteItemId: it.id ?? null',
      'pricedQuoteItemId: optMatched?.quoteItemId ?? undefined',
      'pricedQuoteItemId: fbMatched?.quoteItemId ?? undefined',
    ]);
    contains(typesSrc, ['pricedQuoteItemId?: string']);
  });

  it('flag threads page → client → builder → hotels step, gated by role/status', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_PREVIEW === 'true'",
      'hotelPreviewEnabled={hotelPreviewEnabled}',
    ]);
    contains(clientSrc, [
      'hotelPreviewEnabled = false', // safe default
      'hotelPreviewEnabled={canPreviewPricing && hotelPreviewEnabled}',
    ]);
    contains(builderSrc, ['hotelPreviewEnabled={hotelPreviewEnabled}', 'onPreviewItem={onPreviewItem}']);
  });

  it('backend exposes a dedicated hotel-preview flag (default OFF) and a scope gate; no hotel APPLY flag', () => {
    contains(flagsSrc, [
      "export const QUOTE_PRICING_HOTEL_PREVIEW_FLAG = 'quote.pricingHotelPreview'",
      'export function isQuotePricingHotelPreviewEnabled()',
      "readBooleanEnv('QUOTE_PRICING_HOTEL_PREVIEW')",
    ]);
    excludes(flagsSrc, ['HOTEL_APPLY', 'HotelApply']);
    contains(serviceSrc, [
      'isQuotePricingHotelPreviewEnabled',
      'const isHotelPreviewItem = Boolean(existingItem.hotelId)',
      'if (isHotelPreviewItem && !isQuotePricingHotelPreviewEnabled())',
    ]);
  });

  it('V2 default flag is untouched (this feature does not reference it)', () => {
    excludes(pageSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
    excludes(hotelsSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
    excludes(flagsSrc, ['QUOTE_BUILDER_V2_DEFAULT']);
  });
});
