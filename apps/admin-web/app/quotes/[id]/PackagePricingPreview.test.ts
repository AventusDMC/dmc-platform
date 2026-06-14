import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// PR10A + PR10B-2 — route-vs-package preview with metadata-only selection. Source-grep
// assertions over the component + proxies + the additive mount in QuoteItineraryTab.
// Selection is metadata only: no apply, no quote-total change.

const componentSource = readFileSync(new URL('./PackagePricingPreview.tsx', import.meta.url), 'utf8');
const tabSource = readFileSync(new URL('./QuoteItineraryTab.tsx', import.meta.url), 'utf8');
const pricingProxySource = readFileSync(new URL('../../api/transport-pricing/quotes/[id]/package-pricing-shadow/route.ts', import.meta.url), 'utf8');
const selectionProxySource = readFileSync(new URL('../../api/transport-pricing/quotes/[id]/package-selection/route.ts', import.meta.url), 'utf8');

function expectContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('PR10A — package pricing preview (display-only base)', () => {
  it('1. preview is flag-gated by NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW (default OFF → null, no fetch)', () => {
    expectContains(componentSource, [
      'NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW',
      'if (!enabled) return null',
      'if (!enabled) return;', // useEffect early-return → no fetch when OFF
    ]);
  });

  it('2. fetches the read-only pricing-shadow proxy (GET)', () => {
    expectContains(componentSource, [
      '/api/transport-pricing/quotes/',
      'package-pricing-shadow',
      'buildAuthHeaders()',
    ]);
  });

  it('3. renders the required diagnostic fields', () => {
    expectContains(componentSource, [
      'currentTransportTotal',
      'packageGrossTotal',
      'supplierDiscountPercent',
      'packageNetTotal',
      'difference',
      'reason',
      'countedFullPackageDays',
      'manualRequiredDays',
      'excludedDays',
      'warnings',
    ]);
  });

  it('4. surfaces the standard Large Bus 49 (not VIP 31-33) note', () => {
    assert.ok(/VIP 31/.test(componentSource), 'standard Large Bus 49 / not VIP 31-33 note present');
  });

  it('5. is mounted additively in QuoteItineraryTab', () => {
    expectContains(tabSource, [
      "import { PackagePricingPreview } from './PackagePricingPreview'",
      '<PackagePricingPreview quoteId={quoteId} />',
    ]);
  });

  it('6. does not break the PR7 day-edit source-grep fragments in the tab', () => {
    expectContains(tabSource, ['<QuoteItineraryDayForm', 'title: day.title,', "notes: day.notes || '',"]);
  });

  it('7. pricing-shadow proxy is GET-only and forwards to the API endpoint', () => {
    expectContains(pricingProxySource, ['export async function GET', '/transport-pricing/quotes/', 'package-pricing-shadow', 'proxyRequest']);
    assert.ok(!/export async function (POST|PATCH|PUT|DELETE)/.test(pricingProxySource), 'pricing-shadow proxy exposes no mutating methods');
  });
});

describe('PR10B-2 — route-vs-package selection (metadata only)', () => {
  it('1. selection controls are gated by NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTION_SELECTION', () => {
    expectContains(componentSource, [
      'NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTION_SELECTION',
      'isSelectionEnabled',
      'selectionEnabled ?', // selection block rendered only when ON
    ]);
    // selection-OFF still keeps the display-only future-step copy + NOT APPLIED banner.
    assert.ok(componentSource.includes('future step'), 'selection-OFF future-step copy retained');
  });

  it('2. when selection ON, shows Select route / Select package / Clear selection', () => {
    expectContains(componentSource, ['Select route', 'Select package', 'Clear selection']);
  });

  it('3. Select route saves ROUTE_TRANSFER via PATCH to the selection endpoint', () => {
    expectContains(componentSource, [
      "const ROUTE_OPTION = 'ROUTE_TRANSFER'",
      'saveSelection(ROUTE_OPTION)',
      'package-selection',
      "method: 'PATCH'",
    ]);
  });

  it('4. Select package saves PACKAGE_MIN_FULL_DAY (no client contract id sent)', () => {
    expectContains(componentSource, [
      "const PACKAGE_OPTION = 'PACKAGE_MIN_FULL_DAY'",
      'saveSelection(PACKAGE_OPTION)',
    ]);
    // body only carries the option — the API resolves the active contract server-side.
    assert.ok(componentSource.includes('JSON.stringify({ option })'), 'PATCH body is { option } only');
    assert.ok(!/JSON\.stringify\([^)]*contractId/.test(componentSource), 'no client-supplied contractId in PATCH body');
  });

  it('5. Clear selection saves null option', () => {
    expectContains(componentSource, ['saveSelection(null)']);
  });

  it('6. ineligible package disables Select package', () => {
    expectContains(componentSource, [
      'packageSelectable',
      'disabled={saving || !packageSelectable}',
      'data?.packageContractId',
    ]);
  });

  it('7. manual-required days block package selection', () => {
    expectContains(componentSource, [
      'manualRequiredDays',
      'manualRequiredDays === 0',
      'manual-required day',
    ]);
  });

  it('8. renders saved selection from the pricing-shadow response (savedSelection)', () => {
    expectContains(componentSource, [
      'savedSelection',
      'Selected option:',
      'Selected contract ID:',
      'Selected at:',
      'Selected by:',
    ]);
  });

  it('9. renders a stale/invalid selection warning', () => {
    expectContains(componentSource, ['data.selectionStale', 'stale/invalid']);
  });

  it('10. has no apply button and always shows NOT APPLIED TO TOTALS', () => {
    assert.ok(!/>\s*Apply\b/.test(componentSource), 'no Apply button');
    assert.ok(!componentSource.toLowerCase().includes('apply to totals'), 'no apply-to-totals control');
    assert.ok(/NOT APPLIED TO TOTALS/.test(componentSource), 'NOT APPLIED TO TOTALS shown');
  });

  it('11. the only mutating fetch is the selection PATCH (no POST/PUT/DELETE, no other PATCH)', () => {
    const mutating = componentSource.match(/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/g) ?? [];
    assert.deepEqual(mutating, ["method: 'PATCH'"], 'exactly one mutating method, a PATCH');
    // that PATCH targets the selection endpoint; no quote-total write/refetch.
    assert.ok(componentSource.includes('/api/transport-pricing/quotes/${quoteId}/package-selection'), 'PATCH targets selection endpoint');
    assert.ok(!/totalCost|finalCost|recalc|recalculate/.test(componentSource), 'no quote-total mutation in the component');
  });

  it('12. does not auto-select / auto-apply (recommended is label only)', () => {
    expectContains(componentSource, ['Recommended:', 'label only']);
  });

  it('13. selection proxy is PATCH-only and forwards to the PR10B-1 endpoint', () => {
    expectContains(selectionProxySource, ['export async function PATCH', '/transport-pricing/quotes/', 'package-selection', 'proxyRequest']);
    assert.ok(!/export async function (GET|POST|PUT|DELETE)/.test(selectionProxySource), 'selection proxy exposes only PATCH');
  });
});
