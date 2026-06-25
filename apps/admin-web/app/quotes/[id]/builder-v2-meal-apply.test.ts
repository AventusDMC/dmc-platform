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
      'serviceId: isActivityItem || isGuideItem ? it.serviceId',
      'isActivity: asBool(r.isActivity)',
      // guide (PR C)
      'it.service?.serviceType?.code === "GUIDE"',
      'isGuide: Boolean(it.id) && isGuideItem',
      'guideType: isGuideItem ? it.guideType',
      'guideDuration: isGuideItem ? it.guideDuration',
      'guideOvernight: isGuideItem ? it.guideOvernight',
      'isGuide: asBool(r.isGuide)',
      // shared raw fields surfaced for meal OR activity OR guide
      'quantity: isMealItem || isActivityItem || isGuideItem ? it.quantity',
      'paxCount: isMealItem || isActivityItem || isGuideItem ? it.paxCount',
      'serviceDate: isMealItem || isActivityItem || isGuideItem ? it.serviceDate',
      'dayCount: isActivityItem || isGuideItem ? it.dayCount',
    ]);
    // Required ids/values must come from columns, never parsed from text.
    excludes(adapterSrc, ['pricingDescription.split', '| Meal | PER_PERSON', '| Activity |', 'pricingDescription.match']);
  });

  it('modal: preview-first label, ack checkbox, gated Apply, error mapping; meal+activity payloads; no fetch', () => {
    contains(modalSrc, [
      'Preview first. No changes are saved until you apply.',
      'I understand this will update the quote totals.',
      // kind-aware gating on a successful preview token (meal/activity/guide)
      'const kindMatches = isGuide ? Boolean(exp.isGuide) : isActivity ? Boolean(exp.isActivity) : Boolean(exp.isMeal)',
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
      // guide payload (raw fields; guideOvernight → backend `overnight`)
      'guideType,',
      'guideDuration,',
      'overnight: guideOvernight,',
      'serviceId: exp.serviceId ?? undefined,',
      // headings per kind
      'Preview & apply activity pricing',
      'Preview & apply meal pricing',
      'Preview & apply guide pricing',
    ]);
    excludes(modalSrc, ['fetch(', "method: 'PATCH'", "method: 'DELETE'", "method: 'POST'", 'method: "POST"', 'method: "PATCH"', 'method: "DELETE"']);
  });

  it('modal: activity qty/pax are read-only (hardening); meal qty/pax/unitCost stay editable; serviceDate editable for both', () => {
    contains(modalSrc, [
      // activity: quantity + pax rendered read-only (managed in Classic)
      'Quantity (managed in Classic)',
      'Pax count (quote pax, set in Classic)',
      '<div className={readonlyCls}>{quantity}</div>',
      '<div className={readonlyCls}>{paxCount}</div>',
      // helper text explaining the activity pricing inputs
      'Activity pricing is driven by the selected activity rate and service date. Rate selection and pax/quote counts are managed in Classic Builder.',
      // serviceDate stays editable for BOTH kinds (valid activity pricing input)
      'type="date" value={serviceDate} onChange={(e) => edit(setServiceDate)(e.target.value)}',
      // meal qty/pax/unitCost stay editable inputs (meal UI unchanged)
      'value={quantity} onChange={(e) => edit(setQuantity)(e.target.value)}',
      'value={paxCount} onChange={(e) => edit(setPaxCount)(e.target.value)}',
      'value={unitCost} onChange={(e) => edit(setUnitCost)(e.target.value)}',
      // activity payload still carries the raw qty/pax fields (read-only, not removed)
      'quantity: Number(quantity)',
      'paxCount: Number(paxCount)',
    ]);
  });

  it('modal: guide cost drivers editable (type/duration/overnight/quantity); pax + day count read-only; helper text', () => {
    contains(modalSrc, [
      // guide editable cost drivers
      'value={guideType} onChange={(e) => edit(setGuideType)(e.target.value)}',
      'value={guideDuration} onChange={(e) => edit(setGuideDuration)(e.target.value)}',
      'checked={guideOvernight}',
      // quantity stays an editable input (quantity IS a guide cost driver)
      'value={quantity} onChange={(e) => edit(setQuantity)(e.target.value)}',
      // pax + day count read-only for guide (managed in Classic)
      'Pax count (managed in Classic)',
      'Day count (managed in Classic)',
      // helper text (exact)
      'Guide pricing is driven by guide type, duration, overnight status, quantity, and service date. Pax count and day count are managed in Classic Builder.',
      // guide payload maps guideOvernight → overnight
      'overnight: guideOvernight,',
    ]);
  });

  it('Experiences step: meal AND activity rows use the apply modal; non-supported keep read-only preview; prior features intact', () => {
    contains(experiencesSrc, [
      'ItemPricingApplyModal',
      'onApplyItemPricing',
      'const canApplyMeal = Boolean(onApplyItemPricing && onPreviewItem && exp.isMeal && exp.quoteItemId)',
      'const canApplyActivity = Boolean(onApplyItemPricing && onPreviewItem && exp.isActivity && exp.quoteItemId)',
      'const canApplyGuide = Boolean(onApplyItemPricing && onPreviewItem && exp.isGuide && exp.quoteItemId)',
      'const canApply = canApplyMeal || canApplyActivity || canApplyGuide',
      'kind={applyKind}',
      'Preview & apply guide pricing',
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
