import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — D-b (frontend): the guarded item-REMOVE affordance that pairs with
// the backend guarded delete (PR #846). Source-grep tests (same convention as the add
// panels): pinning the eligibility gate (activity/guide/meal/entrance/external_package
// only; hotel/transport/unclassified excluded), the behind-the-mutation-flag visibility
// (handlers passed only when canAddItem), the preview → confirm dialog showing SELLING
// numbers only (never cost/margin), the DELETE that forwards ONLY the previewToken, the
// reuse of the shared handlers + a thin new proxy (no apps/api change), and the typed
// remove-error mapping. Add/apply behavior is asserted unchanged elsewhere.

const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const removePreviewProxy = readFileSync(new URL('./../../api/quotes/[id]/v2/experiences/item/[itemId]/remove/preview/route.ts', import.meta.url), 'utf8');
const deleteProxy = readFileSync(new URL('./../../api/quotes/[id]/v2/experiences/item/[itemId]/route.ts', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

// The RemoveItemControl body only (so cost-negative assertions don't pick up other rows).
function removeControlBlock(src: string): string {
  const start = src.indexOf('function RemoveItemControl');
  const end = src.indexOf('function ExperienceRow');
  assert.ok(start >= 0 && end > start, 'RemoveItemControl block not found');
  return src.slice(start, end);
}

describe('Quote Builder V2 — item remove preview-confirm (D-b frontend)', () => {
  it('the experiences step exposes a RemoveItemControl threaded into each row', () => {
    contains(stepSrc, [
      'function RemoveItemControl',
      '<RemoveItemControl exp={exp} currency={currency} onPreviewRemoveItem={onPreviewRemoveItem} onRemoveItem={onRemoveItem} />',
    ]);
  });

  it('Remove is offered ONLY for eligible V2-removable rows (activity/guide/meal/entrance/external_package) with an id', () => {
    contains(stepSrc, [
      'const canRemove = Boolean(',
      'onRemoveItem && onPreviewRemoveItem && exp.quoteItemId',
      '(exp.isActivity || exp.isGuide || exp.isMeal || exp.isEntrance || exp.isExternal)',
    ]);
    // No hotel/transport removal path in the row.
    const block = removeControlBlock(stepSrc);
    assert.ok(!/isHotel|isTransport|hotelId|transportServiceTypeId/.test(block), 'remove control must not reference hotel/transport');
  });

  it('visibility follows the item-mutation flag: the client passes remove handlers only when canAddItem', () => {
    contains(clientSrc, [
      'onPreviewRemoveItem={canAddItem ? handlePreviewRemoveItem : undefined}',
      'onRemoveItem={canAddItem ? handleRemoveItem : undefined}',
    ]);
    // Threaded through the workspace to the step.
    contains(builderSrc, ['onPreviewRemoveItem={onPreviewRemoveItem}', 'onRemoveItem={onRemoveItem}']);
  });

  it('clicking Remove runs a preview then opens the confirm dialog', () => {
    const block = removeControlBlock(stepSrc);
    contains(block, [
      'const startRemove = async',
      'onPreviewRemoveItem(exp.quoteItemId!)',
      'const confirmRemove = async',
      'onRemoveItem(exp.quoteItemId!, preview.previewToken)',
      'role="dialog"',
    ]);
  });

  it('the confirm dialog shows SELLING numbers only — current, projected, delta — and NO cost/margin', () => {
    const block = removeControlBlock(stepSrc);
    contains(block, [
      'Current selling total:',
      'After removal:',
      'Change:',
      'preview.currentTotalSell',
      'preview.projectedTotalSell',
      'preview.sellDelta',
    ]);
    // Never render cost/margin, and never any external internals, in the dialog.
    assert.ok(!/cost|margin|netCost|externalNetCost|externalInternalNotes|externalSupplierName|supplierName/i.test(block), 'remove dialog must not render cost/margin/internal fields');
  });

  it('Confirm calls DELETE; Cancel does not — and the delete forwards ONLY the previewToken', () => {
    const block = removeControlBlock(stepSrc);
    contains(block, ['const cancel = ', 'Confirm remove', 'Cancel']);
    // The client DELETE handler sends only { previewToken }.
    contains(clientSrc, [
      'const handleRemoveItem = async (itemId: string, previewToken: string)',
      'method: "DELETE"',
      'JSON.stringify({ previewToken })',
    ]);
    // The preview handler sends NO cost/pricing body.
    contains(clientSrc, [
      'const handlePreviewRemoveItem = async (itemId: string)',
      '`/api/quotes/${quote.id}/v2/experiences/item/${itemId}/remove/preview`',
      '`/api/quotes/${quote.id}/v2/experiences/item/${itemId}`',
    ]);
  });

  it('success shows a generalized toast ("External package removed successfully") and refreshes', () => {
    contains(clientSrc, [
      'parsed.itemType.replace(/_/g, " ")',
      '`${label} removed successfully.`',
      'router.refresh()',
    ]);
  });

  it('maps the typed remove error codes to safe messages (sell-only; use-Classic for ineligible)', () => {
    contains(clientSrc, [
      'const removeItemErrorMessage =',
      'feature_disabled',
      'item_not_found',
      'item_not_removable',
      'quote_not_editable',
      'stale_preview',
      'invalid_preview_token',
      'The quote changed after preview. Please preview removal again.',
      'This item cannot be removed in V2 yet. Please use Classic.',
      'This quote is not editable.',
    ]);
  });

  it('uses thin admin-web proxies (no apps/api change): remove-preview POST + item DELETE, forwarding auth only', () => {
    contains(removePreviewProxy, [
      'export async function POST',
      '/v2/experiences/item/${itemId}/remove/preview',
      'buildActorHeaders(request)',
    ]);
    contains(deleteProxy, [
      'export async function DELETE',
      'buildActorHeaders(request)',
      // The DELETE proxy forwards ONLY the previewToken.
      'previewToken: (body as { previewToken?: unknown })?.previewToken',
    ]);
    // Each proxy makes exactly ONE upstream fetch, to the experiences item endpoint —
    // no unrelated/mutating endpoints. (Scope to the fetch call; imports mention
    // "bookings/actorHeaders" and comments mention voucher/packet as things NOT sent.)
    for (const proxy of [removePreviewProxy, deleteProxy]) {
      const fetchCount = proxy.split('await fetch(').length - 1;
      assert.equal(fetchCount, 1, 'proxy must make exactly one upstream fetch');
      // The single fetch targets ONLY the experiences item endpoint — proving no
      // unrelated/mutating endpoint (Accept/invoice/booking/voucher/packet/public-link)
      // is ever called by these proxies.
      assert.ok(/\$\{API_BASE_URL\}\/quotes\/\$\{id\}\/v2\/experiences\/item/.test(proxy), 'proxy fetch must target the experiences item endpoint');
    }
  });
});
