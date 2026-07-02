import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const transportSrc = read('../../../components/quote/v2/steps/transport-step.tsx');
const modalSrc = read('../../../components/quote/v2/steps/pricing-preview-modal.tsx');
const builderSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const pageSrc = read('./builder-v2/page.tsx');
const typesSrc = read('../../../lib/quote-types.ts');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const flagsSrc = read('../../../../api/src/quotes/quote-pricing-preview-flags.ts');
const serviceSrc = read('../../../../api/src/quotes/quotes.service.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

describe('Quote Builder V2 — transport pricing APPLY Phase T-A (single-leg transfers, gated, default OFF)', () => {
  // ---- backend flag ----
  it('backend exposes a dedicated transport-APPLY flag (default OFF) separate from preview', () => {
    contains(flagsSrc, [
      "export const QUOTE_PRICING_TRANSPORT_APPLY_FLAG = 'quote.pricingTransportApply'",
      'export function isQuotePricingTransportApplyEnabled()',
      "readBooleanEnv('QUOTE_PRICING_TRANSPORT_APPLY')",
    ]);
    // transport PREVIEW stays its own independent gate
    contains(flagsSrc, ["readBooleanEnv('QUOTE_PRICING_TRANSPORT_PREVIEW')"]);
  });

  // ---- backend eligibility (Phase T-A: single-leg transfers only) ----
  it('apply guard opens for transport ONLY behind the flag, and only for eligible single-leg transfers', () => {
    contains(serviceSrc, [
      'isQuotePricingTransportApplyEnabled',
      'private async resolveTransportApplyEligibility',
      // structural transport detection (matches computeItemPreview), not taxonomy text
      'supportedItem.transportServiceTypeId || supportedItem.routeId || supportedItem.touringRouteId',
      'const isTransportApply = Boolean(transportApplyEligibility?.eligible)',
      'if (!isMealActivityGuide && !isEntranceApply && !isHotelApply && !isExternalPackageApply && !isTransportApply)',
    ]);
  });

  it('T-A eligibility enforces: single-leg classification, serviceDate, no override, no touring, live-apply engines OFF', () => {
    contains(serviceSrc, [
      'if (item.touringRouteId) return none',
      'if (!item.transportServiceTypeId && !item.routeId) return none',
      'if (item.serviceDate == null) return none',
      'if (item.useOverride === true || item.overrideCost != null) return none',
      'if (isPackagePricingLiveApplyEnabled() || isOvernightStationaryLiveApplyEnabled()) return none',
      "const eligible = classification === 'ROUTE_TRANSFER'",
    ]);
  });

  it('transport apply blocks changing the underlying service, and re-uses the existing write path', () => {
    contains(serviceSrc, [
      'if (isTransportApply && data?.serviceId !== undefined && data.serviceId !== supportedItem.serviceId)',
      'not supported by apply',
      'await this.updateItem(itemId, data, actor)',
    ]);
  });

  it('transport apply uses item AND quote integrity (defensive against total-level deltas)', () => {
    contains(serviceSrc, [
      'const integrityOk = isEntranceApply || isTransportApply ? itemIntegrityOk && quoteIntegrityOk : itemIntegrityOk',
    ]);
  });

  // ---- audit safety ----
  it('successful apply records transport code + classification + safe rate ids, never the token', () => {
    contains(serviceSrc, [
      "action: 'quote.pricing.apply'",
      'transportServiceTypeCode: isTransportApply ?',
      'transportClassification: isTransportApply ?',
    ]);
    const auditStart = serviceSrc.indexOf("action: 'quote.pricing.apply'");
    const auditEnd = serviceSrc.indexOf('} catch (auditErr)');
    const auditRegion = serviceSrc.slice(auditStart, auditEnd > auditStart ? auditEnd : auditStart + 1800);
    excludes(auditRegion, ['previewToken', 'tokenPayload', 'getPreviewTokenSecret']);
  });

  // ---- adapter: FE eligibility signal (single-leg transfer codes) ----
  it('adapter marks single-leg transfer rows apply-eligible (conservative FE gate)', () => {
    contains(adapterSrc, [
      'const transportServiceTypeCode = vr?.serviceType?.code ?? null',
      'SINGLE_LEG_TRANSFER_CODES',
      '"AIRPORT_TRANSFER", "POINT_TO_POINT", "ROUTE_TRANSFER"',
      'const transportApplyEligible = Boolean(',
      '!it.touringRouteId',
      '!it.useOverride',
      'it.overrideCost == null',
    ]);
    contains(typesSrc, ['transportApplyEligible?: boolean']);
  });

  // ---- modal reused (no direct write) ----
  it('transport apply reuses the shared PricingPreviewModal apply path (no direct write in the modal)', () => {
    excludes(modalSrc, ['fetch(', "method: 'POST'", 'method: "POST"', "method: 'PATCH'", 'apply-preview']);
  });

  // ---- transport step eligibility + UI ----
  it('transport apply is offered ONLY for eligible single-leg rows behind the apply flag', () => {
    contains(transportSrc, [
      'const canApplyTransport = Boolean(',
      'onApplyItemPricing && canPreview && transportApplyEnabled && svc.transportApplyEligible',
      'onApply={canApplyTransport ? onApplyItemPricing : undefined}',
      'applyEnabled={canApplyTransport}',
      'applyLabel="Apply transport price"',
      'Apply transport price',
    ]);
  });

  it('unsafe transport rows stay preview-only with single-leg helper text', () => {
    contains(transportSrc, [
      'const showApplyBlockedHelper = Boolean(canPreview && transportApplyEnabled && !svc.transportApplyEligible)',
      'Transport apply is only available for single-leg transfers in this phase. Manage this transport item in Classic.',
    ]);
  });

  it('confirmation copy explains the narrow scope (line price only; not route/vehicle/driver/assignments; nothing to client)', () => {
    contains(transportSrc, [
      "Apply updates only this transport line's price",
      'it does not change the route, vehicle, driver, pickup/drop-off',
      'sends nothing to the client',
    ]);
  });

  // ---- flag plumbing page → client → builder → step ----
  it('transport-apply flag threads page → client → builder → step and requires preview + role', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_TRANSPORT_APPLY === 'true'",
      'transportApplyEnabled={transportApplyEnabled}',
    ]);
    contains(clientSrc, [
      'transportApplyEnabled = false', // safe default
      'transportApplyEnabled={canPreviewPricing && transportPreviewEnabled && transportApplyEnabled}',
      'onApplyItemPricing={canPreviewPricing ? handleApplyItemPricing : undefined}',
    ]);
    contains(builderSrc, [
      'transportApplyEnabled={transportApplyEnabled}',
      'onApplyItemPricing={onApplyItemPricing}',
    ]);
  });

  // ---- scope guards: hotel + external apply untouched; default flag untouched ----
  it('hotel + external apply gates remain intact; V2 default routing flag untouched', () => {
    contains(serviceSrc, [
      'const isHotelApply = Boolean(supportedItem.service && this.isHotelService(supportedItem.service)) && isQuotePricingHotelApplyEnabled()',
      'const isExternalPackageApply = Boolean(supportedItem.externalPackageName) && isQuotePricingExternalPackageApplyEnabled()',
    ]);
    excludes(pageSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
    excludes(transportSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
  });

  it('no email/Resend/SMTP or Operations wiring introduced by this feature', () => {
    excludes(transportSrc, ['Resend', 'SMTP', 'nodemailer', 'sendEmail']);
  });
});
