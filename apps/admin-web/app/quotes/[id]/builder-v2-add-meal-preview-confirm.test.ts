import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — M-1b (frontend): the add-MEAL preview-then-confirm flow that pairs
// with the guarded backend meal create (PR #831). Source-grep tests (same convention as
// builder-v2-add-guide-preview-confirm): pinning the meal panel, its meal fields +
// payload, the reuse of the SAME guarded handlers/proxies (no new proxy), the two-step
// (Preview price → Confirm & add) UI showing ONLY the selling price, the FINANCE-GATED
// unit-cost/currency override (never shown/sent for operations), and the typed meal-error
// mapping. Activity/guide behavior is asserted unchanged elsewhere.

const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — add-meal preview-confirm (M-1b frontend)', () => {
  it('experiences step exposes an AddMealPanel rendered alongside the activity + guide panels (same item-create gate)', () => {
    contains(stepSrc, [
      'function AddMealPanel',
      '<AddMealPanel onAddItem={onAddItem} onPreviewAddItem={onPreviewAddItem} itineraryDays={itineraryDays} canEnterCostOverride={Boolean(mealCostOverrideEnabled)} />',
      'Add meal',
      'Meal service',
      'Meal name',
    ]);
    // rendered inside the SAME canAddActivity (item-create flag + handlers + days) block
    contains(stepSrc, ['const canAddActivity = Boolean(addItemEnabled && onAddItem && onPreviewAddItem && itineraryDays']);
  });

  it('the meal panel builds an itemType=meal payload with serviceId + customServiceName', () => {
    contains(stepSrc, [
      'itemType: "meal"',
      'serviceId,',
      'customServiceName: mealName.trim()',
      'serviceDate,',
    ]);
  });

  it('meal name maps to customServiceName', () => {
    contains(stepSrc, ['customServiceName: mealName.trim()']);
  });

  it('meal panel loads MEAL-taxonomy SERVICES from /api/services and filters client-side', () => {
    contains(stepSrc, [
      'fetch("/api/services"',
      'function isMealService',
      '.filter(isMealService)',
      'meal|dining|breakfast|lunch|dinner|restaurant|food',
    ]);
  });

  it('meal panel reuses the two-step Preview → Confirm UI, showing selling price only', () => {
    contains(stepSrc, [
      'const doPreview = async',
      'const doConfirm = async',
      'onAddItem(currentPayload(), preview.previewToken, true)',
      'Preview price',
      'Confirm & add',
      'Projected selling price',
    ]);
    // The meal confirm step must not render cost/margin anywhere in the step.
    assert.ok(!/Projected (net )?cost|Projected margin/i.test(stepSrc), 'add-meal confirm must not show cost/margin');
  });

  it('the unit-cost/currency override is FINANCE-GATED (canEnterCostOverride) — hidden for operations', () => {
    contains(stepSrc, [
      'canEnterCostOverride: boolean',
      '{canEnterCostOverride ? (',
      'Unit cost override (finance)',
      'Currency override (finance)',
      'mealCostOverrideEnabled?: boolean',
    ]);
    // finance visibility is threaded from canViewCostMargin (canAccessFinance) — NOT from
    // any operations-visible gate.
    contains(builderSrc, ['mealCostOverrideEnabled={canViewCostMargin}']);
  });

  it('the meal payload only includes unitCost/currency when finance AND entered (never for operations)', () => {
    contains(stepSrc, [
      '...(canEnterCostOverride && unitCost.trim() !== "" ? { unitCost: Number(unitCost) } : {})',
      '...(canEnterCostOverride && currency.trim() !== "" ? { currency: currency.trim() } : {})',
    ]);
  });

  it('client maps the meal typed error codes and reuses the guarded handlers/proxies (no new route)', () => {
    contains(clientSrc, [
      'addItemErrorMessage',
      'missing_field',
      'service_not_found',
      'not_meal_service',
      'cost_override_forbidden',
      'invalid_preview_token',
      'stale_preview',
      'not_resolvable',
      'confirmation_required',
      'rate_changed',
      'feature_disabled',
    ]);
    // SAME generic handlers + SAME two proxy endpoints — no meal-specific proxy.
    contains(clientSrc, [
      'const handlePreviewAddItem = async',
      'const handleAddItem = async',
      '`/api/quotes/${quote.id}/v2/experiences/item/preview`',
      '`/api/quotes/${quote.id}/v2/experiences/item`',
    ]);
    assert.ok(!/experiences\/meal|\/v2\/experiences\/item\/meal/.test(clientSrc), 'no meal-specific proxy route');
  });

  it('the success toast is generalized to the created item type (not hard-coded to Activity)', () => {
    contains(clientSrc, [
      'const itemType = typeof parsed?.itemType === "string"',
      'const label = itemType.charAt(0).toUpperCase() + itemType.slice(1)',
      '`${label} added successfully',
    ]);
    assert.ok(!clientSrc.includes('"Activity added successfully."'), 'the hard-coded Activity toast must be generalized');
  });
});
