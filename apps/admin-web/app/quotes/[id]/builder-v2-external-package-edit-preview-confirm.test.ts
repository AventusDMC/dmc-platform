import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — E-b (frontend): the guarded External Package COMMERCIAL edit
// affordance that pairs with the backend guarded edit (PR #853). Source-grep tests (same
// convention as the add/remove panels): pinning the dedicated OFF-by-default frontend gate
// (NEXT_PUBLIC_QUOTE_EXTERNAL_PACKAGE_EDIT), the finance-only + strict-DRAFT visibility,
// the external_package-only row eligibility, the two-field-only form (netCost +
// pricingBasis), the preview-first → confirm flow that renders the BACKEND projection
// (item AND quote totals shown separately, SLAB-aware), the confirm that replays the exact
// v2e previewToken + acknowledgement, the thin allowlisting proxies (no apps/api change),
// the typed error mapping, and the absence of client pricing math / legacy pricing-apply.

const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const pageSrc = readFileSync(new URL('./builder-v2/page.tsx', import.meta.url), 'utf8');
const editPreviewProxy = readFileSync(new URL('./../../api/quotes/[id]/v2/experiences/item/[itemId]/edit/preview/route.ts', import.meta.url), 'utf8');
const editProxy = readFileSync(new URL('./../../api/quotes/[id]/v2/experiences/item/[itemId]/edit/route.ts', import.meta.url), 'utf8');

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

// The EditExternalPackageControl body only (so field/leak assertions don't pick up other
// rows). The control is defined AFTER ExperienceRow, before the "Add activity" form.
function editControlBlock(src: string): string {
  const start = src.indexOf('function EditExternalPackageControl');
  const end = src.indexOf('// Phase B, Slice 2: inline "Add activity" form.', start);
  assert.ok(start >= 0 && end > start, 'EditExternalPackageControl block not found');
  return src.slice(start, end);
}

describe('Quote Builder V2 — external package commercial edit preview-confirm (E-b frontend)', () => {
  // ---- 1. dedicated frontend gate, default OFF, fail-closed ----
  it('uses a DEDICATED build-time gate NEXT_PUBLIC_QUOTE_EXTERNAL_PACKAGE_EDIT (default OFF), not the create gate', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_EXTERNAL_PACKAGE_EDIT === 'true'",
      'const canEditExternalPackage =',
      'externalPackageEditFlag && canAccessFinance(role) && quoteStatusCode === "DRAFT"',
      'canEditExternalPackage={canEditExternalPackage}',
    ]);
    // NOT reusing the item-create or pricing preview/apply gates as the edit gate.
    const editLine = pageSrc.split('\n').find((l) => l.includes('canEditExternalPackage =')) || '';
    assert.ok(!/ITEM_CREATE|EXTERNAL_PACKAGE_PREVIEW|EXTERNAL_PACKAGE_APPLY/.test(editLine), 'edit gate must not reuse create/preview/apply flags');
  });

  // ---- 2/3. authorization: finance-only + strict DRAFT; unauthorized roles excluded ----
  it('gates the affordance on canAccessFinance (admin/super_admin/finance) + strict DRAFT — never operations/agent_admin/viewer', () => {
    contains(pageSrc, ['canAccessFinance(role)', 'quoteStatusCode === "DRAFT"']);
    // The edit gate must NOT be widened to operations/viewer via hasRequiredRole.
    const editLine = pageSrc.split('\n').find((l) => l.includes('canEditExternalPackage =')) || '';
    assert.ok(!/hasRequiredRole/.test(editLine), 'edit gate must use canAccessFinance, not hasRequiredRole (which would admit operations/agent_admin)');
    // The client passes handlers ONLY when canEditExternalPackage.
    contains(clientSrc, [
      'onPreviewEditExternal={canEditExternalPackage ? handlePreviewEditExternal : undefined}',
      'onEditExternal={canEditExternalPackage ? handleEditExternal : undefined}',
    ]);
  });

  // ---- 2/4. external_package-only row eligibility; other types never receive it ----
  it('offers the edit ONLY on external_package rows with an id (handler-presence gated)', () => {
    contains(stepSrc, [
      'const canEditExternal = Boolean(',
      'onPreviewEditExternal && onEditExternal && exp.quoteItemId && exp.isExternal',
      '<EditExternalPackageControl exp={exp} currency={currency} onPreviewEditExternal={onPreviewEditExternal} onEditExternal={onEditExternal} />',
    ]);
    // The gate and the control reference ONLY isExternal — never hotel/transport/activity/guide/meal/entrance.
    const block = editControlBlock(stepSrc);
    assert.ok(!/isActivity|isGuide|isMeal|isEntrance|isHotel|isTransport|hotelId|transportServiceTypeId/.test(block), 'edit control must not reference other item types');
    // Threaded through the workspace to the step.
    contains(builderSrc, ['onPreviewEditExternal={onPreviewEditExternal}', 'onEditExternal={onEditExternal}']);
  });

  // ---- 5/6. two-field-only form; immutable/excluded fields never render ----
  it('renders ONLY netCost + pricingBasis inputs (PER_PERSON/PER_GROUP) — no currency/markup/override/name/desc/country/pax/date/day/supplier/notes', () => {
    const block = editControlBlock(stepSrc);
    contains(block, [
      'New net cost',
      'Pricing basis',
      'value="PER_PERSON"',
      'value="PER_GROUP"',
      'setNetCost',
      'setPricingBasis',
    ]);
    // No editable controls for any immutable/descriptive field.
    assert.ok(!/setCurrency|setMarkup|markupPercent|sellPrice|sellOverride|useOverride|setPackageName|externalPackageName|setDescription|clientDescription|setCountry|externalPackageCountry|adultCount|childCount|setServiceDate|setDayId|serviceId|supplierName|internalNotes/.test(block), 'edit form must expose only netCost + pricingBasis');
  });

  // ---- 7/8. preview-first: preview before apply; preview writes nothing ----
  it('previews first (edit-preview) and only applies on explicit confirm', () => {
    const block = editControlBlock(stepSrc);
    contains(block, [
      'const startPreview = async',
      'onPreviewEditExternal(exp.quoteItemId!',
      'const confirmEdit = async',
      'onEditExternal(exp.quoteItemId!, preview.payload, preview.result.previewToken!, acknowledged)',
      'role="dialog"',
    ]);
    // The client preview handler hits the /edit/preview endpoint (read-only) — the apply
    // endpoint (/edit) is only called by the separate apply handler.
    contains(clientSrc, [
      'const handlePreviewEditExternal = async',
      '`/api/quotes/${quote.id}/v2/experiences/item/${itemId}/edit/preview`',
      'const handleEditExternal = async',
      '`/api/quotes/${quote.id}/v2/experiences/item/${itemId}/edit`',
    ]);
    // The preview handler body must not POST to the apply endpoint.
    const previewFn = clientSrc.slice(clientSrc.indexOf('const handlePreviewEditExternal'), clientSrc.indexOf('const handleEditExternal'));
    assert.ok(!previewFn.includes('/edit`'), 'edit-preview must not call the apply endpoint');
  });

  // ---- 9/10. backend projection; item + quote separated; SLAB-aware; no client math ----
  it('renders the BACKEND projection — item AND quote totals separately, SLAB-aware, never computing pricing in the browser', () => {
    const block = editControlBlock(stepSrc);
    contains(block, [
      'preview.result.item?.current?.totalCost',
      'preview.result.item?.projected?.totalCost',
      'preview.result.item?.delta?.totalCost',
      'preview.result.item?.current?.totalSell',
      'preview.result.item?.projected?.totalSell',
      'preview.result.quote?.current?.totalCost',
      'preview.result.quote?.projected?.totalCost',
      'preview.result.quote?.delta?.totalSell',
      'This package line',
      'Whole quote',
    ]);
    // SLAB caveat surfaced; quote deltas read straight from the backend (never inferred from the item).
    contains(block, ['pricingMode === "slab"', 'sellProjected === false', 'slab pricing']);
    // No browser-side pricing arithmetic (markup/pax multiplication or derived deltas).
    assert.ok(!/markup|\* *pax|netCost *\*|\* *\(1|projected *= *current|totalSell *\* /.test(block), 'edit panel must not compute pricing in the browser');
  });

  // ---- 11. confirm dialog exposes no token / supplier / internal / snapshot data ----
  it('never renders the preview token, supplier, internal notes, or snapshot internals in the dialog', () => {
    const block = editControlBlock(stepSrc);
    excludes(block, ['{preview.result.previewToken}', '{preview.result.previewToken!}']);
    assert.ok(!/supplierName|externalSupplierName|internalNotes|externalInternalNotes|snapshotHash|snapshot|externalNetCost/.test(block), 'edit dialog must not render token/supplier/internal/snapshot internals');
  });

  // ---- 12. Cancel makes no apply call ----
  it('Cancel resets state and makes no apply request; only confirm calls the apply handler', () => {
    const block = editControlBlock(stepSrc);
    contains(block, ['const cancel = ', 'Cancel']);
    const cancelFn = block.slice(block.indexOf('const cancel ='), block.indexOf('const cur ='));
    assert.ok(!cancelFn.includes('onEditExternal'), 'Cancel must not call the apply handler');
  });

  // ---- 13. confirm sends ONLY the approved payload + token + acknowledgement ----
  it('the apply handler forwards ONLY netCost/pricingBasis + previewToken + acknowledgedDelta', () => {
    const applyFn = clientSrc.slice(clientSrc.indexOf('const handleEditExternal'), clientSrc.indexOf('setApplyToast({ text: "External package commercial terms updated'));
    contains(applyFn, [
      'method: "POST"',
      'payload.netCost !== undefined ? { netCost: payload.netCost } : {}',
      'payload.pricingBasis !== undefined ? { pricingBasis: payload.pricingBasis } : {}',
      'previewToken,',
      'acknowledgedDelta,',
    ]);
    // No other fields are ever sent from the apply handler.
    assert.ok(!/currency:|markup|sellPrice|packageName|country:|serviceId|supplierName|internalNotes|serviceDate|dayId/.test(applyFn), 'apply payload must carry only the approved fields');
  });

  // ---- 14. success feedback + refresh ----
  it('shows client-safe success feedback and refreshes on apply (no optimistic pricing mutation)', () => {
    contains(clientSrc, [
      'External package commercial terms updated successfully.',
      'router.refresh()',
    ]);
  });

  // ---- 15. typed error mapping → safe copy; ineligible → use Classic ----
  it('maps the E-a error codes to safe copy, directing ineligible cases to Classic', () => {
    contains(clientSrc, [
      'const editExternalErrorMessage =',
      'feature_disabled',
      'external_package_finance_only',
      'quote_not_editable',
      'item_not_found',
      'not_external_package',
      'matrix_pricing_unsupported',
      'override_pricing_unsupported',
      'item_not_editable',
      'invalid_preview_token',
      'stale_preview',
      'confirmation_required',
      'post_write_integrity_mismatch',
      'Please use Classic.',
    ]);
  });

  // ---- 16/17/18. thin allowlisting proxies; exactly one upstream call; no legacy apply ----
  it('uses thin admin-web proxies forwarding ONLY approved fields, exactly one upstream call each, to the /edit endpoints', () => {
    contains(editPreviewProxy, [
      'export async function POST',
      '/v2/experiences/item/${itemId}/edit/preview',
      'buildActorHeaders(request)',
      "if (body?.netCost !== undefined) forwarded.netCost = body.netCost;",
      "if (body?.pricingBasis !== undefined) forwarded.pricingBasis = body.pricingBasis;",
    ]);
    contains(editProxy, [
      'export async function POST',
      '/v2/experiences/item/${itemId}/edit',
      'buildActorHeaders(request)',
      'previewToken: body?.previewToken',
      'acknowledgedDelta: body?.acknowledgedDelta === true',
    ]);
    // The preview proxy must NOT forward previewToken/ack in its request body; the apply
    // proxy is the only one that does. (The word may appear in the proxy's comment.)
    assert.ok(!/forwarded\.previewToken|previewToken:|acknowledgedDelta/.test(editPreviewProxy), 'edit-preview proxy must not forward a token/ack');
    // Each proxy makes exactly ONE upstream fetch, to the experiences item /edit endpoint.
    for (const proxy of [editPreviewProxy, editProxy]) {
      const fetchCount = proxy.split('await fetch(').length - 1;
      assert.equal(fetchCount, 1, 'proxy must make exactly one upstream fetch');
      assert.ok(/\$\{API_BASE_URL\}\/quotes\/\$\{id\}\/v2\/experiences\/item\/\$\{itemId\}\/edit/.test(proxy), 'proxy fetch must target the experiences item /edit endpoint');
    }
    // No legacy pricing-apply / classic-item / apply endpoints are ever FETCHED (scope to
    // the fetch target line so a comment mentioning "pricing-apply" doesn't trip this).
    for (const proxy of [editPreviewProxy, editProxy]) {
      const fetchLine = proxy.split('\n').find((l) => l.includes('await fetch(')) || '';
      assert.ok(!/pricing-apply|\/items\/|\/pricing\/|\/apply-preview/.test(fetchLine), 'E-b proxy must not fetch any pricing-apply/classic endpoint');
    }
    // The client edit handlers only ever FETCH the /edit[/preview] endpoints — never a
    // pricing-apply/classic path (scope to fetch-target lines so comments don't trip this).
    const editSurface = clientSrc.slice(clientSrc.indexOf('const handlePreviewEditExternal'), clientSrc.indexOf('setApplyToast({ text: "External package commercial terms updated'));
    const editFetchLines = editSurface.split('\n').filter((l) => l.includes('/api/quotes/'));
    assert.ok(editFetchLines.length === 2, 'edit handlers should make exactly two endpoint calls (preview + apply)');
    for (const l of editFetchLines) {
      assert.ok(/\/v2\/experiences\/item\/\$\{itemId\}\/edit/.test(l), 'edit handler fetch must target the /edit endpoint');
      assert.ok(!/pricing-apply|\/items\/|\/pricing\//.test(l), 'edit handler must not call a pricing-apply/classic endpoint');
    }
  });
});
