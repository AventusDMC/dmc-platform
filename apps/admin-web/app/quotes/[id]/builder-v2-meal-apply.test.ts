import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const proxySrc = read('../../../app/api/quotes/[id]/items/[itemId]/apply-preview/route.ts');
const modalSrc = read('../../../components/quote/v2/steps/item-pricing-apply-modal.tsx');
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

describe('Quote Builder V2 — meal + activity pricing apply UI', () => {
  it('proxy forwards POST to the backend apply-preview endpoint only', () => {
    contains(proxySrc, ['export async function POST', '/quotes/${id}/items/${itemId}/apply-preview', "method: 'POST'"]);
    excludes(proxySrc, ["method: 'PATCH'", "method: 'DELETE'", "method: 'PUT'"]);
  });

  it('adapter surfaces RAW meal + activity fields (no pricingDescription parsing)', () => {
    contains(adapterSrc, [
      // meal
      'it.service?.serviceType?.code === "MEAL"',
      'customServiceName: isMealItem ? it.customServiceName',
      'isMeal: asBool(r.isMeal)',
      // activity (new)
      'it.service?.serviceType?.code === "ACTIVITY"',
      'isActivity: Boolean(it.id) && isActivityItem',
      'activityId: isActivityItem ? it.activityId',
      'activityRateVariantId: isActivityItem ? it.activityRateVariantId',
      'serviceId: isActivityItem ? it.serviceId',
      'isActivity: asBool(r.isActivity)',
      // shared raw fields surfaced for meal OR activity
      'quantity: isMealItem || isActivityItem ? it.quantity',
      'paxCount: isMealItem || isActivityItem ? it.paxCount',
      'serviceDate: isMealItem || isActivityItem ? it.serviceDate',
    ]);
    // Required ids/values must come from columns, never parsed from text.
    excludes(adapterSrc, ['pricingDescription.split', '| Meal | PER_PERSON', '| Activity |']);
  });

  it('modal: preview-first label, ack checkbox, gated Apply, error mapping; meal+activity payloads; no fetch', () => {
    contains(modalSrc, [
      'Preview first. No changes are saved until you apply.',
      'I understand this will update the quote totals.',
      // kind-aware gating on a successful preview token
      'const kindMatches = isActivity ? Boolean(exp.isActivity) : Boolean(exp.isMeal)',
      'const canApply = Boolean(kindMatches && exp.quoteItemId && token',
      // error-code mapping
      'Pricing apply is not enabled.',
      'The quote or rates changed. Preview again before applying.',
      'Pricing apply is not configured.',
      'deltaNonZero ? ack : false',
      // meal payload (raw fields)
      'customServiceName: name',
      'unitCost: Number(unitCost)',
      // activity payload (raw ids; re-price at current variant)
      'activityId: exp.activityId',
      'activityRateVariantId: exp.activityRateVariantId',
      'serviceId: exp.serviceId',
      // headings per kind
      'Preview & apply activity pricing',
      'Preview & apply meal pricing',
    ]);
    excludes(modalSrc, ['fetch(', "method: 'PATCH'", "method: 'DELETE'", "method: 'POST'", 'method: "POST"', 'method: "PATCH"', 'method: "DELETE"']);
  });

  it('Experiences step: meal AND activity rows use the apply modal; non-supported keep read-only preview; prior features intact', () => {
    contains(experiencesSrc, [
      'ItemPricingApplyModal',
      'onApplyItemPricing',
      'const canApplyMeal = Boolean(onApplyItemPricing && onPreviewItem && exp.isMeal && exp.quoteItemId)',
      'const canApplyActivity = Boolean(onApplyItemPricing && onPreviewItem && exp.isActivity && exp.quoteItemId)',
      'const canApply = canApplyMeal || canApplyActivity',
      'kind={applyKind}',
      // read-only preview suppressed for meal/activity apply rows
      'Boolean(onPreviewItem && exp.quoteItemId) && !canApply',
      // prior features retained
      'EditInClassicLink',
      'DisplayTextEditor',
      'PricingPreviewModal',
    ]);
    excludes(experiencesSrc, ['fetch(']);
  });

  it('builder threads onApplyItemPricing to the Experiences step', () => {
    contains(builderSrc, ['onApplyItemPricing', 'onApplyItemPricing={onApplyItemPricing}']);
  });

  it('client posts ONLY to apply-preview, gated by the role/status flag; no item PATCH/DELETE added', () => {
    contains(clientSrc, [
      '/items/${quoteItemId}/apply-preview',
      'onApplyItemPricing={canPreviewPricing ? handleApplyItemPricing : undefined}',
    ]);
    const start = clientSrc.indexOf('const handleApplyItemPricing');
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
