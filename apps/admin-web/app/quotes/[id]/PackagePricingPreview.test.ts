import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// PR10A — display-only route-vs-package preview. Source-grep assertions over the new
// component + proxy + the additive mount in QuoteItineraryTab. Diagnostic only: no save,
// no apply, no quote-total change.

const componentSource = readFileSync(new URL('./PackagePricingPreview.tsx', import.meta.url), 'utf8');
const tabSource = readFileSync(new URL('./QuoteItineraryTab.tsx', import.meta.url), 'utf8');
const proxySource = readFileSync(new URL('../../api/transport-pricing/quotes/[id]/package-pricing-shadow/route.ts', import.meta.url), 'utf8');

function expectContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('PR10A — package pricing preview (display-only)', () => {
  it('1. is flag-gated by NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW (default OFF → null, no fetch)', () => {
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

  it('3. is display-only — no apply/save, no POST/PATCH', () => {
    assert.ok(!/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(componentSource), 'no mutating fetch method');
    assert.ok(!componentSource.includes('<button'), 'no buttons (no apply/select control)');
    assert.ok(/NOT APPLIED — preview only/.test(componentSource), 'NOT APPLIED shown');
    assert.ok(componentSource.includes('future step'), 'future-step text present');
  });

  it('4. renders the required diagnostic fields', () => {
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

  it('5. surfaces the standard Large Bus 49 (not VIP 31-33) note', () => {
    assert.ok(/VIP 31/.test(componentSource), 'standard Large Bus 49 / not VIP 31-33 note present');
  });

  it('6. is mounted additively in QuoteItineraryTab', () => {
    expectContains(tabSource, [
      "import { PackagePricingPreview } from './PackagePricingPreview'",
      '<PackagePricingPreview quoteId={quoteId} />',
    ]);
  });

  it('7. does not break the PR7 day-edit source-grep fragments in the tab', () => {
    expectContains(tabSource, ['<QuoteItineraryDayForm', 'title: day.title,', "notes: day.notes || '',"]);
  });

  it('8. proxy is GET-only and forwards to the API endpoint', () => {
    expectContains(proxySource, ['export async function GET', '/transport-pricing/quotes/', 'package-pricing-shadow', 'proxyRequest']);
    assert.ok(!/export async function (POST|PATCH|PUT|DELETE)/.test(proxySource), 'proxy exposes no mutating methods');
  });
});
