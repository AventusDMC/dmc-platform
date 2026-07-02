import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildV2ReadinessAudit } from '../../../lib/quote-v2-readiness';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const experiencesSrc = read('../../../components/quote/v2/steps/experiences-step.tsx');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const typesSrc = read('../../../lib/quote-types.ts');
const builderSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const pageSrc = read('./builder-v2/page.tsx');
const flagsSrc = read('../../../../api/src/quotes/quote-pricing-preview-flags.ts');
const serviceSrc = read('../../../../api/src/quotes/quotes.service.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}
const baseExp = (over: any) => ({ id: 'x', quoteItemId: 'x', ...over });
function quote(exps: any[], opts?: any) {
  return [
    { hotelCities: [], transport: [], experiences: exps, passengers: [], roomingGroups: [],
      passengersLoadError: false, roomingLoadError: false,
      steps: [{ id: 'hotels', status: 'complete' }, { id: 'transport', status: 'complete' }, { id: 'experiences', status: 'complete' }],
      readiness: [{ done: true }] } as any, opts,
  ] as const;
}

describe('Quote Builder V2 — external package preview (PR #571, preview-only)', () => {
  it('external-package row preview is gated on the new flag + isExternal (default OFF → read-only)', () => {
    contains(experiencesSrc, [
      'externalPackagePreviewEnabled',
      'const canPreviewExternal = Boolean(',
      'exp.isExternal && externalPackagePreviewEnabled',
      'Preview external package pricing',
      // external excluded from the generic read-only preview
      '!exp.isEntrance && !exp.isExternal',
    ]);
  });

  it('external-package rows show the read-only manual/bundled diagnostic when apply is not enabled', () => {
    // The preview-only diagnostic + external branch remain. (A flag-gated external
    // APPLY affordance now also exists — covered by builder-v2-external-package-apply.test.ts.)
    contains(experiencesSrc, ['External package — pricing is manual/bundled', 'exp.isExternal ? (']);
    // The old combined "Preview & apply" wording is not used.
    excludes(experiencesSrc, ['Preview & apply external']);
  });

  it('adapter marks external-package experiences with isExternal (both layers)', () => {
    contains(adapterSrc, ['isExternal: Boolean(it.id) && externalPackage', 'isExternal: asBool(r.isExternal)']);
    contains(typesSrc, ['isExternal?: boolean']);
  });

  it('flag threads page → client → builder → experiences step, gated by role/status', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_EXTERNAL_PACKAGE_PREVIEW === 'true'",
      'externalPackagePreviewEnabled={externalPackagePreviewEnabled}',
    ]);
    contains(clientSrc, [
      'externalPackagePreviewEnabled = false',
      'externalPackagePreviewEnabled={canPreviewPricing && externalPackagePreviewEnabled}',
    ]);
    contains(builderSrc, ['externalPackagePreviewEnabled={externalPackagePreviewEnabled}']);
  });

  it('backend exposes a dedicated external-package preview flag (default OFF) + scope gate', () => {
    contains(flagsSrc, [
      "export const QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW_FLAG = 'quote.pricingExternalPackagePreview'",
      'export function isQuotePricingExternalPackagePreviewEnabled()',
      "readBooleanEnv('QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW')",
    ]);
    // Preview stays its own gate; a separate external-package APPLY flag now exists
    // too (covered by builder-v2-external-package-apply.test.ts).
    contains(serviceSrc, [
      'isQuotePricingExternalPackagePreviewEnabled',
      'const isExternalPackagePreviewItem = Boolean(existingItem.externalPackageName)',
      'if (isExternalPackagePreviewItem && !isQuotePricingExternalPackagePreviewEnabled())',
    ]);
  });

  // ---- readiness panel reflects external preview only when enabled ----
  it('readiness panel: external packages → Classic when flag OFF, Preview only when ON', () => {
    const off = buildV2ReadinessAudit(...quote([baseExp({ isExternal: true })]));
    const offRow = off.rows.find((r) => r.key === 'experiences-external');
    assert.equal(offRow?.level, 'classic');

    const [q] = quote([baseExp({ isExternal: true })]);
    const on = buildV2ReadinessAudit(q, { externalPackagePreviewEnabled: true });
    const onRow = on.rows.find((r) => r.key === 'experiences-external');
    assert.equal(onRow?.level, 'preview');
  });

  it('V2 default flag is untouched by this feature', () => {
    excludes(experiencesSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
    excludes(flagsSrc, ['QUOTE_BUILDER_V2_DEFAULT']);
  });
});
