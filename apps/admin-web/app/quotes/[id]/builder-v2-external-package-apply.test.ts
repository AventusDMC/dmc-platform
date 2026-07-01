import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const experiencesSrc = read('../../../components/quote/v2/steps/experiences-step.tsx');
const modalSrc = read('../../../components/quote/v2/steps/pricing-preview-modal.tsx');
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

describe('Quote Builder V2 — external-package pricing APPLY (gated, default OFF)', () => {
  // ---- backend flag ----
  it('backend exposes a dedicated external-package APPLY flag (default OFF) separate from preview', () => {
    contains(flagsSrc, [
      "export const QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY_FLAG = 'quote.pricingExternalPackageApply'",
      'export function isQuotePricingExternalPackageApplyEnabled()',
      "readBooleanEnv('QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY')",
    ]);
    // preview flag is still its own, independent gate
    contains(flagsSrc, ["readBooleanEnv('QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW')"]);
  });

  // ---- backend apply guard ----
  it('apply guard opens for external package ONLY behind the external-apply flag; reuses the existing write path', () => {
    contains(serviceSrc, [
      'isQuotePricingExternalPackageApplyEnabled',
      'const isExternalPackageApply = Boolean(supportedItem.externalPackageName) && isQuotePricingExternalPackageApplyEnabled()',
      'if (!isMealActivityGuide && !isEntranceApply && !isHotelApply && !isExternalPackageApply)',
      // delegates to the same existing write path (no parallel pricing/recalc)
      'await this.updateItem(itemId, data, actor)',
    ]);
  });

  it('external-package apply blocks changing the underlying service (re-price in place only)', () => {
    contains(serviceSrc, [
      'if (isExternalPackageApply && data?.serviceId !== undefined && data.serviceId !== supportedItem.serviceId)',
      'not supported by apply',
    ]);
  });

  // ---- audit safety ----
  it('successful apply records serviceType EXTERNAL_PACKAGE + currency, never the token', () => {
    contains(serviceSrc, [
      "action: 'quote.pricing.apply'",
      "serviceType: isExternalPackageApply ? 'EXTERNAL_PACKAGE' : supportedItem?.service?.serviceType?.code ?? null",
    ]);
    // The audit metadata is a flat totals/payload summary — the preview token is
    // never part of it (verified at the unit level in quote-item-apply-guard.test.ts).
    const auditStart = serviceSrc.indexOf("action: 'quote.pricing.apply'");
    const auditEnd = serviceSrc.indexOf('} catch (auditErr)');
    const auditRegion = serviceSrc.slice(auditStart, auditEnd > auditStart ? auditEnd : auditStart + 1500);
    excludes(auditRegion, ['previewToken', 'tokenPayload', 'getPreviewTokenSecret']);
  });

  // ---- modal: generic, opt-in apply with per-type description ----
  it('preview modal apply copy is parameterized (applyDescription) so external can explain its narrow scope', () => {
    contains(modalSrc, [
      'applyDescription',
      '? applyDescription',
    ]);
  });

  it('modal apply re-prices via onApply — it never writes directly', () => {
    excludes(modalSrc, ['fetch(', "method: 'POST'", 'method: "POST"', "method: 'PATCH'", 'apply-preview']);
  });

  // ---- experiences step eligibility + UI ----
  it('external apply is offered ONLY for eligible external rows behind the apply flag (eligibility)', () => {
    contains(experiencesSrc, [
      'const canApplyExternal = Boolean(',
      'onApplyItemPricing && canPreviewExternal && externalPackageApplyEnabled',
      // canPreviewExternal itself already requires a real external item + stable id + preview flag
      'onPreviewItem && exp.quoteItemId && exp.isExternal && externalPackagePreviewEnabled',
      // the modal receives the apply handler ONLY when the row is apply-eligible
      'onApply={canApplyExternal ? onApplyItemPricing : undefined}',
      'applyEnabled={canApplyExternal}',
      'applyLabel="Apply external package price"',
      'Apply external package price',
    ]);
  });

  it('ineligible external rows stay preview-only (apply gated on canApplyExternal, never frontend-trusted)', () => {
    // Non-external / non-eligible rows never reach the external apply path.
    contains(experiencesSrc, ['exp.isExternal ? (']);
    // No transport/hotel apply leakage from this step.
    excludes(experiencesSrc, ['Apply transport', 'applyLabel="Apply transport']);
  });

  it('confirmation copy explains the narrow scope (line-only, not inner services, nothing sent to client)', () => {
    contains(experiencesSrc, [
      "Apply updates only this external package line's price",
      'it does not change the hotels, transport, or services inside the package',
      'sends nothing to the client',
    ]);
  });

  // ---- flag plumbing page → client → builder → experiences step ----
  it('external-apply flag threads page → client → builder → step and requires preview + role', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_EXTERNAL_PACKAGE_APPLY === 'true'",
      'externalPackageApplyEnabled={externalPackageApplyEnabled}',
    ]);
    contains(clientSrc, [
      'externalPackageApplyEnabled = false', // safe default
      // apply requires role (canPreviewPricing) AND the preview flag AND the apply flag
      'externalPackageApplyEnabled={canPreviewPricing && externalPackagePreviewEnabled && externalPackageApplyEnabled}',
      // apply reuses the SAME apply handler + refreshes the quote after apply
      'onApplyItemPricing={canPreviewPricing ? handleApplyItemPricing : undefined}',
      'router.refresh()',
    ]);
    contains(builderSrc, ['externalPackageApplyEnabled={externalPackageApplyEnabled}']);
  });

  // ---- scope guards: transport stays preview-only; hotel apply untouched; default flag untouched ----
  it('transport stays preview-only and the V2 default routing flag is untouched', () => {
    excludes(flagsSrc, ['TRANSPORT_APPLY', 'TransportApply']);
    excludes(pageSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
    excludes(experiencesSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
    excludes(flagsSrc, ['QUOTE_BUILDER_V2_DEFAULT']);
  });

  it('hotel apply gate remains intact (this PR does not weaken hotel scope)', () => {
    contains(serviceSrc, [
      'const isHotelApply = Boolean(supportedItem.service && this.isHotelService(supportedItem.service)) && isQuotePricingHotelApplyEnabled()',
    ]);
  });

  it('no email/Resend/SMTP or Operations wiring is introduced by this feature', () => {
    excludes(experiencesSrc, ['Resend', 'SMTP', 'nodemailer', 'sendEmail']);
    excludes(modalSrc, ['Resend', 'SMTP', 'nodemailer', 'sendEmail']);
  });
});
