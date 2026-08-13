import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — M-3b (frontend): the add-EXTERNAL-PACKAGE preview-then-confirm
// flow that pairs with the guarded backend external-package create (PR #841). Source-grep
// tests (same convention as builder-v2-add-entrance-preview-confirm): pinning the
// FINANCE-ONLY panel gate, the ONE-OFF / SERVICE-LESS shape (NO service picker, NO
// serviceId), the required + optional fields, the itemType=external_package payload with
// NO serviceId/markup/matrix/supplement/sell-override, the reuse of the SAME guarded
// handlers/proxies (no new proxy), the two-step (Preview price → Confirm & add) UI showing
// ONLY the selling price, and the typed external-package error mapping. Activity/guide/
// meal/entrance behavior is asserted unchanged elsewhere.

const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

// The AddExternalPackagePanel body only (so assertions don't pick up other panels).
function externalPanelBlock(src: string): string {
  const start = src.indexOf('function AddExternalPackagePanel');
  const end = src.indexOf('export interface ExperiencesStepProps');
  assert.ok(start >= 0 && end > start, 'AddExternalPackagePanel block not found');
  return src.slice(start, end);
}

describe('Quote Builder V2 — add-external-package preview-confirm (M-3b frontend)', () => {
  it('experiences step exposes an AddExternalPackagePanel rendered alongside the other add panels, behind the item-create gate', () => {
    contains(stepSrc, [
      'function AddExternalPackagePanel',
      '<AddExternalPackagePanel onAddItem={onAddItem} onPreviewAddItem={onPreviewAddItem} itineraryDays={itineraryDays} defaultCurrency={currency} />',
      'Add external package',
    ]);
    contains(stepSrc, ['const canAddActivity = Boolean(addItemEnabled && onAddItem && onPreviewAddItem && itineraryDays']);
  });

  it('the panel is FINANCE-ONLY: rendered only when externalPackageCreateEnabled, which the workspace feeds from canViewCostMargin', () => {
    // The step gates the panel render on the finance prop.
    contains(stepSrc, [
      'externalPackageCreateEnabled?: boolean',
      '{externalPackageCreateEnabled ? (',
    ]);
    // The workspace wires the finance-visibility signal (admin/super_admin/finance) into it.
    contains(builderSrc, ['externalPackageCreateEnabled={canViewCostMargin}']);
  });

  it('the panel is ONE-OFF / SERVICE-LESS — no service picker, no /api/services fetch, no serviceId', () => {
    // Strip line comments — the panel's doc comment mentions "no serviceId" in prose.
    const code = externalPanelBlock(stepSrc).replace(/\/\/.*$/gm, '');
    assert.ok(!code.includes('/api/services'), 'external package panel must not fetch services');
    assert.ok(!/serviceId/.test(code), 'external package panel code must not reference serviceId');
    assert.ok(!/supplierId|supplierSelect/.test(code), 'external package panel must not reference a supplier selector');
  });

  it('the panel builds an itemType=external_package payload with the required fields', () => {
    contains(stepSrc, [
      'itemType: "external_package"',
      'dayId,',
      'serviceDate,',
      'netCost: Number(netCost)',
      'currency: currency.trim().toUpperCase()',
      'country: country.trim()',
      'clientDescription: clientDescription.trim()',
      'pricingBasis,',
    ]);
  });

  it('the payload must NOT include serviceId / markupPercent / pricing matrix / single supplement / sell override', () => {
    const start = stepSrc.indexOf('itemType: "external_package"');
    const payloadBlock = stepSrc.slice(start, start + 700);
    for (const forbidden of ['serviceId', 'markupPercent', 'pricingMatrixJson', 'singleSupplement', 'sellPrice', 'sellPriceOverride', 'externalNetCost', 'externalSupplierName', 'supplierName']) {
      assert.ok(!payloadBlock.includes(forbidden), `external package payload must not include ${forbidden}`);
    }
  });

  it('optional fields are threaded only when provided (packageName / includes / excludes / hotelsOrSimilar / internalNotes)', () => {
    contains(stepSrc, [
      '...(packageName.trim() ? { packageName: packageName.trim() } : {})',
      '...(includes.trim() ? { includes: includes.trim() } : {})',
      '...(excludes.trim() ? { excludes: excludes.trim() } : {})',
      '...(hotelsOrSimilar.trim() ? { hotelsOrSimilar: hotelsOrSimilar.trim() } : {})',
      '...(internalNotes.trim() ? { internalNotes: internalNotes.trim() } : {})',
    ]);
  });

  it('exposes required + optional field controls (net cost, currency, country, client description, pricing basis PER_PERSON/PER_GROUP, notes)', () => {
    const block = externalPanelBlock(stepSrc);
    contains(block, ['Net cost', 'Currency', 'Country', 'Client description', 'Pricing basis', 'PER_PERSON', 'PER_GROUP', 'Package name (optional)', 'Hotels or similar (optional)', 'Includes (optional)', 'Excludes (optional)', 'Internal notes (optional, finance)']);
  });

  it('reuses the two-step Preview → Confirm UI, showing selling price only (no rendered cost/margin)', () => {
    const block = externalPanelBlock(stepSrc);
    contains(block, [
      'const doPreview = async',
      'const doConfirm = async',
      'onAddItem(currentPayload(), preview.previewToken, true)',
      'Preview price',
      'Confirm & add',
      'Projected selling price',
    ]);
    // A net-cost INPUT is allowed (finance-only panel); but NO projected cost/margin is rendered.
    assert.ok(!/Projected (net )?cost|Projected margin/i.test(block), 'add-external-package must not render projected cost/margin');
    // canSubmit requires the four required fields (+ day + service date).
    contains(block, ['const canSubmit', 'dayId && serviceDate && netCost.trim() && currency.trim() && country.trim() && clientDescription.trim()']);
  });

  it('client maps the external-package typed error codes and reuses the guarded handlers/proxies (no new route)', () => {
    contains(clientSrc, [
      'addItemErrorMessage',
      'external_package_finance_only',
      'invalid_external_package_cost',
      'invalid_pricing_basis',
      'missing_field',
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
    assert.ok(!/experiences\/external|\/v2\/experiences\/item\/external/.test(clientSrc), 'no external-package-specific proxy route');
  });

  it('the success toast reads "External package added successfully" (underscores → spaces in the generalized label)', () => {
    contains(clientSrc, [
      'const itemType = typeof parsed?.itemType === "string"',
      'parsed.itemType.replace(/_/g, " ")',
      'const label = itemType.charAt(0).toUpperCase() + itemType.slice(1)',
      '`${label} added successfully',
    ]);
  });
});
