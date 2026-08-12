import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — M-2b (frontend): the add-ENTRANCE preview-then-confirm flow that
// pairs with the guarded backend entrance create (PR #836). Source-grep tests (same
// convention as builder-v2-add-meal-preview-confirm): pinning the entrance panel, its
// entrance/ticket service filter, the OPTIONAL ticket-rate-variant (base-fee fallback),
// the itemType=entrance payload with NO cost/markup/JP/currency fields, the reuse of the
// SAME guarded handlers/proxies (no new proxy), the two-step (Preview price → Confirm &
// add) UI showing ONLY the selling price, and the typed entrance-error mapping.
// Activity/guide/meal behavior is asserted unchanged elsewhere.

const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

// The AddEntrancePanel body only (so assertions don't pick up the activity panel's
// rate-variant cost display, which is a different, unchanged item type).
function entrancePanelBlock(src: string): string {
  const start = src.indexOf('function AddEntrancePanel');
  const end = src.indexOf('export interface ExperiencesStepProps');
  assert.ok(start >= 0 && end > start, 'AddEntrancePanel block not found');
  return src.slice(start, end);
}

describe('Quote Builder V2 — add-entrance preview-confirm (M-2b frontend)', () => {
  it('experiences step exposes an AddEntrancePanel rendered alongside activity + guide + meal (same item-create gate)', () => {
    contains(stepSrc, [
      'function AddEntrancePanel',
      '<AddEntrancePanel onAddItem={onAddItem} onPreviewAddItem={onPreviewAddItem} itineraryDays={itineraryDays} />',
      'Add entrance',
      'Entrance / ticket service',
    ]);
    contains(stepSrc, ['const canAddActivity = Boolean(addItemEnabled && onAddItem && onPreviewAddItem && itineraryDays']);
  });

  it('the entrance panel builds an itemType=entrance payload with serviceId (no cost/markup/JP/currency fields)', () => {
    contains(stepSrc, [
      'itemType: "entrance"',
      'serviceId,',
      'serviceDate,',
    ]);
    // The entrance payload must NOT carry any of these (all derived/omitted server-side).
    const start = stepSrc.indexOf('itemType: "entrance"');
    const payloadBlock = stepSrc.slice(start, start + 400);
    for (const forbidden of ['entranceFeeId', 'jordanPassCovered', 'jordanPassSavingsJod', 'unitCost', 'markupPercent', 'currency:']) {
      assert.ok(!payloadBlock.includes(forbidden), `entrance payload must not include ${forbidden}`);
    }
  });

  it('entrance panel loads ENTRANCE/TICKET services from /api/services and filters client-side', () => {
    contains(stepSrc, [
      'fetch("/api/services"',
      'function isEntranceService',
      '.filter(isEntranceService)',
      'entrance|entry|ticket|museum',
    ]);
  });

  it('the isEntranceService predicate also accepts services carrying ticketRateVariants (best-effort; backend is source of truth)', () => {
    contains(stepSrc, [
      'Array.isArray(s.ticketRateVariants) && s.ticketRateVariants.length > 0',
    ]);
  });

  it('ticketRateVariantId is OPTIONAL — sent only when a variant is chosen, omitted otherwise (base-fee fallback)', () => {
    contains(stepSrc, [
      '...(variantId ? { ticketRateVariantId: variantId } : {})',
      // base-fee-fallback affordance when the service has no variants
      'Uses the base entrance fee.',
      'Base entrance fee',
    ]);
    // canSubmit does NOT require a variant.
    contains(stepSrc, ['const canSubmit = Boolean(dayId && serviceId && serviceDate) && !submitting']);
  });

  it('entrance panel reuses the two-step Preview → Confirm UI, showing selling price only', () => {
    const block = entrancePanelBlock(stepSrc);
    contains(block, [
      'const doPreview = async',
      'const doConfirm = async',
      'onAddItem(currentPayload(), preview.previewToken, true)',
      'Preview price',
      'Confirm & add',
      'Projected selling price',
    ]);
    // No RENDERED cost/margin/fee internals in the entrance panel.
    assert.ok(!/Projected (net )?cost|Projected margin/i.test(block), 'add-entrance must not show cost/margin');
  });

  it('the variant select shows labels only — no cost values are surfaced in the entrance panel', () => {
    const block = entrancePanelBlock(stepSrc);
    // The option renders the variant label, never its costPrice/sellPrice.
    contains(block, ['{v.label ?? "Ticket rate"}']);
    assert.ok(!/costPrice|sellPrice|foreignerFeeJod/.test(block), 'entrance variant options must not surface cost/fee internals');
  });

  it('client maps the entrance typed error codes and reuses the guarded handlers/proxies (no new route)', () => {
    contains(clientSrc, [
      'addItemErrorMessage',
      'missing_field',
      'service_not_found',
      'not_entrance_service',
      'invalid_ticket_rate_variant',
      'invalid_preview_token',
      'stale_preview',
      'confirmation_required',
      'rate_changed',
      'feature_disabled',
    ]);
    contains(clientSrc, [
      'const handlePreviewAddItem = async',
      'const handleAddItem = async',
      '`/api/quotes/${quote.id}/v2/experiences/item/preview`',
      '`/api/quotes/${quote.id}/v2/experiences/item`',
    ]);
    assert.ok(!/experiences\/entrance|\/v2\/experiences\/item\/entrance/.test(clientSrc), 'no entrance-specific proxy route');
  });

  it('the success toast is generalized to the created item type (so entrance reads "Entrance added successfully")', () => {
    contains(clientSrc, [
      'const itemType = typeof parsed?.itemType === "string"',
      'const label = itemType.charAt(0).toUpperCase() + itemType.slice(1)',
      '`${label} added successfully',
    ]);
  });
});
