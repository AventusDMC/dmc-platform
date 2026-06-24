import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const proxySrc = read('../../../app/api/quotes/[id]/items/[itemId]/apply-preview/route.ts');
const modalSrc = read('../../../components/quote/v2/steps/meal-pricing-apply-modal.tsx');
const experiencesSrc = read('../../../components/quote/v2/steps/experiences-step.tsx');
const builderSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const pageSrc = read('./builder-v2/page.tsx');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

describe('Quote Builder V2 — meal pricing apply UI', () => {
  it('proxy forwards POST to the backend apply-preview endpoint only', () => {
    contains(proxySrc, ['export async function POST', '/quotes/${id}/items/${itemId}/apply-preview', "method: 'POST'"]);
    excludes(proxySrc, ["method: 'PATCH'", "method: 'DELETE'", "method: 'PUT'"]);
  });

  it('adapter surfaces RAW meal fields (no pricingDescription parsing for the name)', () => {
    contains(adapterSrc, [
      'it.service?.serviceType?.code === "MEAL"',
      'customServiceName: isMealItem ? it.customServiceName',
      'unitCost: isMealItem ? it.costBaseAmount',
      'quantity: isMealItem ? it.quantity',
      'paxCount: isMealItem ? it.paxCount',
      'currency: isMealItem ? it.currency',
      'serviceDate: isMealItem ? it.serviceDate',
      'isMeal: asBool(r.isMeal)',
    ]);
    // The meal name must come from the stored column, never parsed from text.
    excludes(adapterSrc, ['pricingDescription.split', '| Meal | PER_PERSON']);
  });

  it('meal modal: preview-first label, confirmation checkbox, gated Apply, error mapping; no fetch/mutation', () => {
    contains(modalSrc, [
      'Preview first. No changes are saved until you apply.',
      'I understand this will update the quote totals.',
      // Apply gated on a successful preview token.
      'const canApply = Boolean(exp.isMeal && exp.quoteItemId && token',
      // error-code mapping
      'Pricing apply is not enabled.',
      'The quote or rates changed. Preview again before applying.',
      'Pricing apply is not configured.',
      // acknowledgement: checkbox state gates the apply (only sent when delta != 0)
      'checked={ack}',
      'deltaNonZero ? ack : false',
      // payload built from raw fields (no totals, no pricingDescription)
      'customServiceName: name',
      'unitCost: Number(unitCost)',
    ]);
    // The modal performs NO network/mutation itself — it only calls injected handlers.
    excludes(modalSrc, ['fetch(', "method: 'PATCH'", "method: 'DELETE'", "method: 'POST'", 'method: "POST"', 'method: "PATCH"', 'method: "DELETE"']);
  });

  it('Experiences step: meal rows use the apply modal, non-meal keep read-only preview; prior features intact', () => {
    contains(experiencesSrc, [
      'MealPricingApplyModal',
      'onApplyMealPricing',
      'Preview &amp; apply meal pricing',
      'const canApplyMeal = Boolean(onApplyMealPricing && onPreviewItem && exp.isMeal && exp.quoteItemId)',
      // read-only preview is suppressed for meal rows
      'Boolean(onPreviewItem && exp.quoteItemId) && !canApplyMeal',
      // prior features retained
      'EditInClassicLink',
      'DisplayTextEditor',
      'PricingPreviewModal',
    ]);
    excludes(experiencesSrc, ['fetch(']);
  });

  it('builder threads onApplyMealPricing to the Experiences step', () => {
    contains(builderSrc, ['onApplyMealPricing', 'onApplyMealPricing={onApplyMealPricing}']);
  });

  it('client posts ONLY to apply-preview, gated by the role/status flag; no item PATCH/DELETE added', () => {
    contains(clientSrc, [
      '/items/${quoteItemId}/apply-preview',
      'onApplyMealPricing={canPreviewPricing ? handleApplyMealPricing : undefined}',
    ]);
    // The apply handler region uses POST only — never PATCH/DELETE on the item.
    const start = clientSrc.indexOf('const handleApplyMealPricing');
    const end = clientSrc.indexOf('return (');
    const region = start >= 0 && end > start ? clientSrc.slice(start, end) : clientSrc;
    assert.ok(region.includes('method: "POST"'), 'apply handler must POST');
    excludes(region, ['method: "PATCH"', 'method: "DELETE"', '/display-text']);
  });

  it('page gates the apply affordance to admin/operations + editable statuses (reuses canPreviewPricing)', () => {
    contains(pageSrc, [
      'canPreviewPricing',
      'hasRequiredRole(role, ["admin", "operations"])',
      'PREVIEW_EDITABLE_STATUSES',
    ]);
  });
});
