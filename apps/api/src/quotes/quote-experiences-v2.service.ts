import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { requireActorCompanyId } from '../auth/company-scope';
import { canViewQuoteCostMargin } from '../auth/cost-visibility';
import { DmcRole } from '../auth/auth.types';
import { EXPERIENCE_DEFAULT_MARKUP, GUIDE_DEFAULT_MARKUP } from '../common/pricing-constants';
import { resolveServiceTaxonomyGroup } from '../common/service-taxonomy';
import { PrismaService } from '../prisma/prisma.service';
import { buildCreatePreviewToken, verifyCreatePreviewToken } from './quote-create-preview-token';
import { isQuoteItemCreateEnabled } from './quote-item-create.flags';
import { getPreviewTokenSecret, normalizePayloadHash } from './quote-preview-token';
import { QuotesService } from './quotes.service';

// Actor for a V2 item create — id + auditLabel (for the generic AuditLog row),
// companyId (for access scoping + delegated createItem), and role (Slice 2C: cost/
// margin redaction of the preview/create responses). Assembled by the controller
// from the AuthenticatedActor.
export type QuoteItemCreateActor = {
  id: string;
  companyId?: string | null;
  auditLabel: string;
  role?: DmcRole | null;
} | null;

export type AddActivityItemInput = {
  // Discriminator. Scope is ACTIVITY + GUIDE + MEAL — anything else is rejected
  // out_of_scope. Absent is treated as 'activity' (activity remains the default).
  itemType?: string | null;
  dayId?: string | null;
  // Activity fields (itemType='activity').
  activityId?: string | null;
  activityRateVariantId?: string | null;
  // Guide fields (itemType='guide'). serviceId is a GUIDE-type SERVICE (not a person).
  // serviceId is shared with Meal (itemType='meal' → a MEAL-type SERVICE).
  serviceId?: string | null;
  guideType?: string | null;
  guideDuration?: string | null;
  guideOvernight?: boolean | null;
  // Meal fields (itemType='meal'). customServiceName is the meal name (required).
  // unitCost/currency are a FINANCE-ONLY cost override (defaults to the service's
  // baseCost/currency when omitted; rejected cost_override_forbidden for non-finance).
  customServiceName?: string | null;
  unitCost?: number | null;
  currency?: string | null;
  // Entrance fields (itemType='entrance'). serviceId (shared) is an ENTRANCE service
  // with a linked EntranceFee; ticketRateVariantId is OPTIONAL (base-fee fallback when
  // omitted). entranceFeeId + Jordan Pass values are computed by the resolver, never
  // accepted from the client.
  ticketRateVariantId?: string | null;
  // External-package fields (itemType='external_package'). One-off / SERVICE-LESS
  // (no serviceId). netCost/currency are the manual price (FINANCE-ONLY — the whole
  // item is finance-gated, since net cost is cost data with no catalog fallback).
  // country + clientDescription are required; the rest optional. NO pricing matrix,
  // single supplement, sell override, or multi-day range in this slice.
  netCost?: number | null;
  country?: string | null;
  clientDescription?: string | null;
  packageName?: string | null;
  pricingBasis?: string | null;
  includes?: string | null;
  excludes?: string | null;
  hotelsOrSimilar?: string | null;
  internalNotes?: string | null;
  serviceDate?: string | null;
  // Optional pax override; defaults from the quote when omitted.
  adultCount?: number | null;
  childCount?: number | null;
};

// Slice 2B-1 guard: the create call must carry a preview token + a delta
// acknowledgement (both replayed from the create-preview response).
export type AddActivityItemGuard = {
  previewToken?: unknown;
  acknowledgedDelta?: boolean;
};

// D-a: the guarded DELETE replays the opaque remove-preview token (the mere replay is
// the confirmation — removing a priced line always changes totals).
export type RemoveItemGuard = {
  previewToken?: unknown;
};

// The five V2-removable item types (type-based eligibility — no schema marker exists).
// Hotel/transport are explicitly EXCLUDED from this slice.
type RemovableItemType = 'activity' | 'guide' | 'meal' | 'entrance' | 'external_package';

// Statuses on which V2 item-create is allowed (default-safe: finalized/unknown
// statuses are rejected). Mirrors the FE preview-editable allowlist.
const EDITABLE_STATUSES = new Set(['DRAFT', 'READY', 'REVISION_REQUESTED']);

// Preview-token version/kind + TTL. The token is stateless (nothing persisted) and
// bound to the exact intended add + a snapshot of the quote's pre-create pricing.
// The kind is PER ITEM-TYPE so an activity create-preview token can never create a
// guide (and vice-versa) — the create verifies the kind matches the request's type.
const CREATE_TOKEN_KIND = 'v2-activity-create';
const GUIDE_CREATE_TOKEN_KIND = 'v2-guide-create';
const MEAL_CREATE_TOKEN_KIND = 'v2-meal-create';
const ENTRANCE_CREATE_TOKEN_KIND = 'v2-entrance-create';
const EXTERNAL_PACKAGE_CREATE_TOKEN_KIND = 'v2-external-package-create';
// D-a: guarded single-item DELETE (remove) token kind. Distinct from every create
// kind so a create token can never authorize a delete (and vice-versa).
const DELETE_TOKEN_KIND = 'v2-item-delete';
function tokenKindForItemType(itemType: 'activity' | 'guide' | 'meal' | 'entrance' | 'external_package'): string {
  if (itemType === 'guide') return GUIDE_CREATE_TOKEN_KIND;
  if (itemType === 'meal') return MEAL_CREATE_TOKEN_KIND;
  if (itemType === 'entrance') return ENTRANCE_CREATE_TOKEN_KIND;
  if (itemType === 'external_package') return EXTERNAL_PACKAGE_CREATE_TOKEN_KIND;
  return CREATE_TOKEN_KIND;
}
const CREATE_TOKEN_TTL_SECONDS = 600; // 10 minutes
// Money tolerance for the post-write totals compare (half a cent) — guards against
// float rounding while still catching any real rate/recalc drift.
const TOTALS_EPSILON = 0.005;

type ResolvedCreateContext = {
  itemType: 'activity' | 'guide' | 'meal' | 'entrance' | 'external_package';
  requiredActor: NonNullable<QuoteItemCreateActor>;
  quote: { id: string; quoteCurrency: string | null; adults: number | null; children: number | null };
  dayId: string;
  serviceDate: Date;
  adultCount: number | undefined;
  childCount: number | undefined;
  // Activity-only (present when itemType='activity').
  activityId?: string;
  activityRateVariantId?: string;
  // Guide-only (present when itemType='guide'); serviceId is shared with Meal.
  serviceId?: string;
  guideType?: string;
  guideDuration?: string;
  guideOvernight?: boolean;
  // Meal-only (present when itemType='meal'). unitCost/currency are set ONLY when a
  // finance-visible actor supplied an override; otherwise undefined → the shared
  // resolver falls back to the service's baseCost/currency.
  customServiceName?: string;
  unitCost?: number;
  currency?: string;
  // Entrance-only (present when itemType='entrance'). ticketRateVariantId is set only
  // when a valid variant was supplied; otherwise undefined → the shared resolver uses
  // the default active variant, else the EntranceFee base-fee fallback.
  ticketRateVariantId?: string;
  // External-package-only (present when itemType='external_package'). One-off /
  // service-less: no serviceId. netCost/currency/country/clientDescription are
  // required; pricingBasis defaults PER_PERSON; the rest optional. (currency is shared
  // with the meal branch above.)
  netCost?: number;
  country?: string;
  clientDescription?: string;
  packageName?: string;
  pricingBasis?: 'PER_PERSON' | 'PER_GROUP';
  includes?: string;
  excludes?: string;
  hotelsOrSimilar?: string;
  internalNotes?: string;
};

// Quote Builder V2 — Phase B, Slice 2 + Slice 2B-1. Adds ONE Activity item from V2,
// now behind a determinism guard: a create-preview projects the price with NO
// writes and signs a token; the guarded create verifies the token + a fresh
// quote-state snapshot, then delegates to the EXISTING QuotesService.createItem
// (pricing/recalc are never forked) and, if the recalculated totals drift from the
// previewed projection, compensates by calling the EXISTING removeItem — so a create
// either commits the previewed price or persists nothing.
@Injectable()
export class QuoteExperiencesV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesService,
    private readonly audit: AuditService,
  ) {}

  private assertEnabled(): void {
    if (!isQuoteItemCreateEnabled()) {
      throw new BadRequestException({
        code: 'feature_disabled',
        message: 'Adding items from V2 is not available in this version.',
      });
    }
  }

  // Access guard — mirrors QuotesService.assertQuoteMutationAccess (requireActorCompanyId
  // + quote-exists + latest-revision) plus a defensive cross-company reject on
  // brandCompanyId (legacy null-brand quotes allowed) and an editable-status gate.
  private async assertQuoteAccess(quoteId: string, actor: QuoteItemCreateActor) {
    const companyId = requireActorCompanyId(actor);

    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId },
      select: { id: true, brandCompanyId: true, status: true, quoteCurrency: true, adults: true, children: true },
    });
    if (!quote) {
      throw new BadRequestException('Quote not found');
    }
    if (quote.brandCompanyId && quote.brandCompanyId !== companyId) {
      throw new ForbiddenException('Quote belongs to a different company');
    }
    if (!EDITABLE_STATUSES.has(String(quote.status || '').toUpperCase())) {
      throw new BadRequestException({
        code: 'quote_not_editable',
        message: 'This quote can no longer be edited.',
      });
    }

    const newerRevision = await this.prisma.quote.findFirst({
      where: { revisedFromId: quoteId },
      select: { id: true },
    });
    if (newerRevision && newerRevision.id !== quoteId) {
      throw new BadRequestException('Only the latest quote revision can be changed');
    }

    return quote;
  }

  // Resolve the item type. Absent → 'activity' (back-compat). ACTIVITY+GUIDE+MEAL+
  // ENTRANCE+EXTERNAL_PACKAGE.
  private resolveItemType(input: AddActivityItemInput): 'activity' | 'guide' | 'meal' | 'entrance' | 'external_package' {
    const raw = String(input.itemType ?? 'activity').trim().toLowerCase() || 'activity';
    if (raw !== 'activity' && raw !== 'guide' && raw !== 'meal' && raw !== 'entrance' && raw !== 'external_package') {
      throw new BadRequestException({
        code: 'out_of_scope',
        message: 'Only activity, guide, meal, entrance and external package items can be added from V2 in this version.',
      });
    }
    return raw;
  }

  // Shared validation + identity resolution for both preview and create — no writes.
  private async resolveContext(
    quoteId: string,
    input: AddActivityItemInput,
    actor: QuoteItemCreateActor,
  ): Promise<ResolvedCreateContext> {
    this.assertEnabled();

    const itemType = this.resolveItemType(input);

    // ── Common validation (both types) ──
    const dayId = (input.dayId ?? '').trim();
    const serviceDateRaw = (input.serviceDate ?? '').trim();
    const baseMissing = [
      ['dayId', dayId],
      ['serviceDate', serviceDateRaw],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (baseMissing.length > 0) {
      throw new BadRequestException({ code: 'missing_field', message: `Missing required field(s): ${baseMissing.join(', ')}` });
    }
    const serviceDate = new Date(serviceDateRaw);
    if (Number.isNaN(serviceDate.getTime())) {
      throw new BadRequestException({ code: 'invalid_service_date', message: 'serviceDate is not a valid date.' });
    }

    const requiredActor = this.requireActor(actor);
    const quote = await this.assertQuoteAccess(quoteId, actor);

    // Day must belong to this quote (the shared resolver does NOT enforce this).
    const day = await this.prisma.quoteItineraryDay.findUnique({ where: { id: dayId }, select: { id: true, quoteId: true } });
    if (!day || day.quoteId !== quoteId) {
      throw new BadRequestException({ code: 'day_not_found', message: 'Itinerary day not found for this quote.' });
    }

    const base = {
      itemType,
      requiredActor,
      quote,
      dayId,
      serviceDate,
      adultCount: input.adultCount ?? quote.adults ?? undefined,
      childCount: input.childCount ?? quote.children ?? undefined,
    };

    if (itemType === 'guide') {
      // ── Guide-specific validation ──
      const serviceId = (input.serviceId ?? '').trim();
      const guideType = (input.guideType ?? '').trim();
      const guideDuration = (input.guideDuration ?? '').trim();
      const missing = [
        ['serviceId', serviceId],
        ['guideType', guideType],
        ['guideDuration', guideDuration],
      ].filter(([, v]) => !v).map(([k]) => k);
      if (missing.length > 0) {
        throw new BadRequestException({ code: 'missing_field', message: `Missing required field(s): ${missing.join(', ')}` });
      }
      // The service must exist AND be a GUIDE-type service (reject people/other types).
      // The catalog model is SupplierService (QuoteItem.service → SupplierService);
      // no `as any` so TypeScript validates the delegate + select.
      const service = await this.prisma.supplierService.findUnique({
        where: { id: serviceId },
        select: { id: true, category: true, serviceType: { select: { name: true, code: true } } },
      });
      if (!service) {
        throw new BadRequestException({ code: 'service_not_found', message: 'Service not found.' });
      }
      if (resolveServiceTaxonomyGroup(service) !== 'guide') {
        throw new BadRequestException({ code: 'not_guide_service', message: 'The selected service is not a guide service.' });
      }
      // guideType/guideDuration VALUE validity (local|escort × half_day|full_day) is
      // enforced by the shared resolver at price time → surfaces as not_resolvable.
      return { ...base, serviceId, guideType, guideDuration, guideOvernight: input.guideOvernight === true };
    }

    if (itemType === 'meal') {
      // ── Meal-specific validation ──
      const serviceId = (input.serviceId ?? '').trim();
      const customServiceName = (input.customServiceName ?? '').trim();
      const missing = [
        ['serviceId', serviceId],
        ['customServiceName', customServiceName],
      ].filter(([, v]) => !v).map(([k]) => k);
      if (missing.length > 0) {
        throw new BadRequestException({ code: 'missing_field', message: `Missing required field(s): ${missing.join(', ')}` });
      }
      // The service must exist AND resolve to the MEAL taxonomy group — the same
      // helper the shared resolver's meal branch keys on (reject non-meal services).
      const service = await this.prisma.supplierService.findUnique({
        where: { id: serviceId },
        select: { id: true, category: true, serviceType: { select: { name: true, code: true } } },
      });
      if (!service) {
        throw new BadRequestException({ code: 'service_not_found', message: 'Service not found.' });
      }
      if (resolveServiceTaxonomyGroup(service) !== 'meal') {
        throw new BadRequestException({ code: 'not_meal_service', message: 'The selected service is not a meal service.' });
      }
      // Cost-override guard: meal cost is user-entered, so a unitCost/currency override
      // is FINANCE-ONLY. Operations (and other non-cost-visible roles) may create a
      // meal ONLY at the service's baseCost/currency — a supplied override fails closed.
      const canViewCost = canViewQuoteCostMargin(actor?.role ?? null);
      const unitCostSupplied = input.unitCost !== undefined && input.unitCost !== null;
      const currencySupplied = typeof input.currency === 'string' && input.currency.trim() !== '';
      if ((unitCostSupplied || currencySupplied) && !canViewCost) {
        throw new ForbiddenException({
          code: 'cost_override_forbidden',
          message: 'Only finance-visible roles may set a meal unit cost or currency override.',
        });
      }
      // Bind the override ONLY when allowed + supplied; otherwise undefined so the
      // shared resolver falls back to the service baseCost/currency. The unitCost VALUE
      // validity (finite, ≥ 0) is enforced by the shared resolver → not_resolvable.
      const unitCost = canViewCost && unitCostSupplied ? Number(input.unitCost) : undefined;
      const currency = canViewCost && currencySupplied ? String(input.currency).trim().toUpperCase() : undefined;
      return { ...base, serviceId, customServiceName, unitCost, currency };
    }

    if (itemType === 'entrance') {
      // ── Entrance-specific validation ──
      const serviceId = (input.serviceId ?? '').trim();
      if (!serviceId) {
        throw new BadRequestException({ code: 'missing_field', message: 'Missing required field(s): serviceId' });
      }
      // The linked EntranceFee relation is the backend SOURCE OF TRUTH for "is this an
      // entrance item" — it is exactly what the shared resolver's entrance branch keys
      // on (effectiveService.entranceFee && !activity). A service without one is rejected.
      const service = await this.prisma.supplierService.findUnique({
        where: { id: serviceId },
        select: { id: true, entranceFee: { select: { id: true } } },
      });
      if (!service) {
        throw new BadRequestException({ code: 'service_not_found', message: 'Service not found.' });
      }
      if (!service.entranceFee) {
        throw new BadRequestException({ code: 'not_entrance_service', message: 'The selected service is not an entrance/ticket service.' });
      }
      // ticketRateVariantId is OPTIONAL — omitted → base-fee fallback (EntranceFee.
      // foreignerFeeJod / default active variant, resolved server-side). When supplied,
      // it must belong to THIS service and be active; otherwise fail closed.
      const ticketRateVariantIdRaw = (input.ticketRateVariantId ?? '').trim();
      let ticketRateVariantId: string | undefined;
      if (ticketRateVariantIdRaw) {
        const variant = await this.prisma.ticketRateVariant.findUnique({
          where: { id: ticketRateVariantIdRaw },
          select: { id: true, serviceId: true, active: true },
        });
        if (!variant || variant.serviceId !== serviceId || variant.active === false) {
          throw new BadRequestException({
            code: 'invalid_ticket_rate_variant',
            message: 'The selected ticket rate variant is invalid, inactive, or does not belong to this service.',
          });
        }
        ticketRateVariantId = variant.id;
      }
      return { ...base, serviceId, ticketRateVariantId };
    }

    if (itemType === 'external_package') {
      // ── External-package-specific validation (ONE-OFF / SERVICE-LESS) ──
      // FINANCE-ONLY, run FIRST: netCost is manual cost data with NO catalog fallback,
      // so the WHOLE item is gated to cost-visible roles (admin/super_admin/finance).
      // operations — and agent_admin, which RolesGuard may coalesce into @Roles('admin')
      // at the route — fail closed here BEFORE any pricing work.
      if (!canViewQuoteCostMargin(actor?.role ?? null)) {
        throw new ForbiddenException({
          code: 'external_package_finance_only',
          message: 'Only finance-visible roles may create an external package.',
        });
      }
      const country = (input.country ?? '').trim();
      const clientDescription = (input.clientDescription ?? '').trim();
      const currency = (input.currency ?? '').trim().toUpperCase();
      const netCostSupplied =
        input.netCost !== undefined && input.netCost !== null && String(input.netCost).trim() !== '';
      const missing = [
        ['netCost', netCostSupplied ? 'x' : ''],
        ['currency', currency],
        ['country', country],
        ['clientDescription', clientDescription],
      ].filter(([, v]) => !v).map(([k]) => k);
      if (missing.length > 0) {
        throw new BadRequestException({ code: 'missing_field', message: `Missing required field(s): ${missing.join(', ')}` });
      }
      const netCost = Number(input.netCost);
      if (!Number.isFinite(netCost) || netCost < 0) {
        throw new BadRequestException({
          code: 'invalid_external_package_cost',
          message: 'External package net cost must be a finite number ≥ 0.',
        });
      }
      // pricingBasis defaults to PER_PERSON; only PER_PERSON/PER_GROUP are supported in
      // this slice (no matrix/tiered pricing, no single supplement, no sell override).
      const basisRaw = (input.pricingBasis ?? '').trim().toUpperCase();
      let pricingBasis: 'PER_PERSON' | 'PER_GROUP' = 'PER_PERSON';
      if (basisRaw) {
        if (basisRaw !== 'PER_PERSON' && basisRaw !== 'PER_GROUP') {
          throw new BadRequestException({ code: 'invalid_pricing_basis', message: 'pricingBasis must be PER_PERSON or PER_GROUP.' });
        }
        pricingBasis = basisRaw;
      }
      return {
        ...base,
        netCost,
        currency,
        country,
        clientDescription,
        packageName: (input.packageName ?? '').trim() || undefined,
        pricingBasis,
        includes: (input.includes ?? '').trim() || undefined,
        excludes: (input.excludes ?? '').trim() || undefined,
        hotelsOrSimilar: (input.hotelsOrSimilar ?? '').trim() || undefined,
        internalNotes: (input.internalNotes ?? '').trim() || undefined,
      };
    }

    // ── Activity-specific validation (unchanged behavior) ──
    const activityId = (input.activityId ?? '').trim();
    const activityRateVariantId = (input.activityRateVariantId ?? '').trim();
    const missing = [
      ['activityId', activityId],
      ['activityRateVariantId', activityRateVariantId],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      throw new BadRequestException({ code: 'missing_field', message: `Missing required field(s): ${missing.join(', ')}` });
    }
    const activity = await (this.prisma as any).activity.findUnique({ where: { id: activityId }, select: { id: true } });
    if (!activity) {
      throw new BadRequestException({ code: 'activity_not_found', message: 'Activity not found.' });
    }
    const variant = await (this.prisma as any).activityRateVariant.findUnique({
      where: { id: activityRateVariantId },
      select: { id: true, activityId: true },
    });
    if (!variant) {
      throw new BadRequestException({ code: 'activity_rate_variant_not_found', message: 'Activity rate variant not found.' });
    }
    if (variant.activityId !== activityId) {
      throw new BadRequestException({
        code: 'variant_mismatch',
        message: 'Activity rate variant does not belong to the selected activity.',
      });
    }

    return { ...base, activityId, activityRateVariantId };
  }

  // The EXACT createItem input used by both preview (projection) and create, so the
  // previewed price and the committed price are computed from identical inputs.
  // Delegates to the SHARED QuotesService.createItem — guide items price via the
  // deterministic GUIDE_RATES path (guideType/guideDuration + overnight supplement).
  private buildCreateInput(ctx: ResolvedCreateContext) {
    if (ctx.itemType === 'guide') {
      return {
        quoteId: ctx.quote.id,
        serviceId: ctx.serviceId,
        itineraryId: ctx.dayId,
        serviceDate: ctx.serviceDate,
        guideType: ctx.guideType,
        guideDuration: ctx.guideDuration,
        overnight: ctx.guideOvernight === true,
        adultCount: ctx.adultCount,
        childCount: ctx.childCount,
        quantity: 1,
        markupPercent: GUIDE_DEFAULT_MARKUP,
      };
    }
    if (ctx.itemType === 'meal') {
      // Meal prices via the shared resolver's meal branch: cost = unitCost ??
      // service.baseCost, currency = currency ?? service.currency, PER_PERSON on
      // the SupplierService unitType. No new pricing math. Interim markup =
      // EXPERIENCE_DEFAULT_MARKUP (pending team confirmation of a meal markup).
      return {
        quoteId: ctx.quote.id,
        serviceId: ctx.serviceId,
        itineraryId: ctx.dayId,
        serviceDate: ctx.serviceDate,
        customServiceName: ctx.customServiceName,
        unitCost: ctx.unitCost,
        currency: ctx.currency,
        adultCount: ctx.adultCount,
        childCount: ctx.childCount,
        quantity: 1,
        markupPercent: EXPERIENCE_DEFAULT_MARKUP,
      };
    }
    if (ctx.itemType === 'entrance') {
      // Entrance prices via the shared resolver's entrance branch (keyed on the
      // service's linked EntranceFee): unit cost = ticket variant costPrice ??
      // EntranceFee.foreignerFeeJod, with Jordan Pass coverage computed server-side.
      // entranceFeeId + jordanPassCovered/savings are DERIVED — never passed. No
      // pricing math. Entrance default markup = 0 (at-cost, pending team confirmation).
      return {
        quoteId: ctx.quote.id,
        serviceId: ctx.serviceId,
        itineraryId: ctx.dayId,
        serviceDate: ctx.serviceDate,
        ticketRateVariantId: ctx.ticketRateVariantId,
        adultCount: ctx.adultCount,
        childCount: ctx.childCount,
        quantity: 1,
        markupPercent: 0,
      };
    }
    if (ctx.itemType === 'external_package') {
      // ONE-OFF / SERVICE-LESS: NO serviceId, so the shared resolver takes its one-off
      // external branch (detected by country/netCost) and persists serviceId null.
      // Manual net cost is the price (no catalog rate). markup = EXPERIENCE_DEFAULT_MARKUP
      // (owner decision: Classic parity, avoid zero-margin). No sellPrice override, no
      // pricing matrix, no single supplement, no multi-day range — none are passed.
      return {
        quoteId: ctx.quote.id,
        itineraryId: ctx.dayId,
        serviceDate: ctx.serviceDate,
        country: ctx.country,
        clientDescription: ctx.clientDescription,
        netCost: ctx.netCost,
        currency: ctx.currency,
        packageName: ctx.packageName,
        pricingBasis: ctx.pricingBasis,
        includes: ctx.includes,
        excludes: ctx.excludes,
        hotelsOrSimilar: ctx.hotelsOrSimilar,
        internalNotes: ctx.internalNotes,
        adultCount: ctx.adultCount,
        childCount: ctx.childCount,
        quantity: 1,
        markupPercent: EXPERIENCE_DEFAULT_MARKUP,
      };
    }
    return {
      quoteId: ctx.quote.id,
      activityId: ctx.activityId,
      activityRateVariantId: ctx.activityRateVariantId,
      itineraryId: ctx.dayId,
      serviceDate: ctx.serviceDate,
      adultCount: ctx.adultCount,
      childCount: ctx.childCount,
      quantity: 1,
      markupPercent: EXPERIENCE_DEFAULT_MARKUP,
    };
  }

  // Type-specific identity fields for the token (binds the token to the exact add).
  private tokenIdentityFor(ctx: ResolvedCreateContext) {
    if (ctx.itemType === 'guide') {
      return {
        serviceId: ctx.serviceId,
        guideType: ctx.guideType,
        guideDuration: ctx.guideDuration,
        guideOvernight: ctx.guideOvernight === true,
      };
    }
    if (ctx.itemType === 'meal') {
      // Bind the meal identity INCLUDING the override state — a changed
      // customServiceName or unitCost/currency after preview invalidates the token.
      return {
        serviceId: ctx.serviceId,
        customServiceName: ctx.customServiceName,
        unitCost: ctx.unitCost ?? null,
        currency: ctx.currency ?? null,
      };
    }
    if (ctx.itemType === 'entrance') {
      // Bind the entrance identity INCLUDING the (possibly omitted) ticket variant — a
      // changed serviceId or ticketRateVariantId after preview invalidates the token.
      return {
        serviceId: ctx.serviceId,
        ticketRateVariantId: ctx.ticketRateVariantId ?? null,
      };
    }
    if (ctx.itemType === 'external_package') {
      // Bind the one-off external-package identity — a changed net cost, currency,
      // country, client description, pricing basis, or package name after preview
      // invalidates the token. No serviceId (service-less).
      return {
        netCost: ctx.netCost ?? null,
        currency: ctx.currency ?? null,
        country: ctx.country ?? null,
        clientDescription: ctx.clientDescription ?? null,
        pricingBasis: ctx.pricingBasis ?? null,
        packageName: ctx.packageName ?? null,
      };
    }
    return {
      activityId: ctx.activityId,
      activityRateVariantId: ctx.activityRateVariantId,
    };
  }

  // Deterministic hash of the quote's pre-create pricing state (totals + every
  // item's cost/sell). A change here between preview and create means the quote
  // moved (concurrent edit / underlying re-price) → stale_preview.
  private async snapshotQuoteState(quoteId: string): Promise<{ totalCost: number; totalSell: number; currency: string | null; hash: string }> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: { totalCost: true, totalSell: true, quoteCurrency: true },
    });
    const items = await this.prisma.quoteItem.findMany({
      where: { quoteId },
      select: { id: true, totalCost: true, totalSell: true },
      orderBy: { id: 'asc' },
    });
    const totalCost = Number(quote?.totalCost ?? 0);
    const totalSell = Number(quote?.totalSell ?? 0);
    const currency = quote?.quoteCurrency ?? null;
    const hash = normalizePayloadHash({
      totalCost,
      totalSell,
      currency,
      items: items.map((i) => ({ id: i.id, totalCost: Number(i.totalCost), totalSell: Number(i.totalSell) })),
    });
    return { totalCost, totalSell, currency, hash };
  }

  // Create-preview: projects the new item's price with NO writes and returns a
  // signed token binding the intended add + the pre-create snapshot + the additive
  // projected quote totals. The guarded create replays this token.
  async previewActivityItem(quoteId: string, input: AddActivityItemInput, actor: QuoteItemCreateActor) {
    const ctx = await this.resolveContext(quoteId, input, actor);

    let projected: { totalCost: number; totalSell: number; currency: string | null };
    try {
      projected = await this.quotes.previewCreateItemValues(this.buildCreateInput(ctx), { companyId: ctx.requiredActor.companyId });
    } catch (err) {
      throw new ConflictException({ code: 'not_resolvable', message: 'Pricing could not be resolved for this item.' });
    }

    const snapshot = await this.snapshotQuoteState(quoteId);
    const currency = projected.currency ?? snapshot.currency ?? ctx.quote.quoteCurrency ?? null;
    const quoteTotalCost = snapshot.totalCost + projected.totalCost;
    const quoteTotalSell = snapshot.totalSell + projected.totalSell;

    const issuedAt = Math.floor(Date.now() / 1000);
    const exp = issuedAt + CREATE_TOKEN_TTL_SECONDS;
    // Slice 2C: OPAQUE (encrypted) create-preview token. The token still carries the
    // projected cost totals — the server needs them for the drift compare on create —
    // but the payload is encrypted, so a restricted client can no longer base64-decode
    // it and read cost. The shared apply-path token helper is untouched. The `kind` is
    // per item-type so an activity token cannot create a guide (and vice-versa).
    const previewToken = buildCreatePreviewToken(
      {
        kind: tokenKindForItemType(ctx.itemType),
        itemType: ctx.itemType,
        quoteId,
        dayId: ctx.dayId,
        ...this.tokenIdentityFor(ctx),
        serviceDate: ctx.serviceDate.toISOString(),
        adultCount: ctx.adultCount ?? null,
        childCount: ctx.childCount ?? null,
        snapshotHash: snapshot.hash,
        projected: {
          itemCost: projected.totalCost,
          itemSell: projected.totalSell,
          quoteTotalCost,
          quoteTotalSell,
          currency,
        },
        issuedAt,
        exp,
      },
      getPreviewTokenSecret(),
    );

    // Slice 2C: redact cost/margin for non-finance roles (selling price + currency
    // stay visible). The guard uses the token's internal cost, not this response.
    const showCost = canViewQuoteCostMargin(actor?.role ?? null);
    return {
      itemType: ctx.itemType,
      dayId: ctx.dayId,
      projected: {
        cost: showCost ? projected.totalCost : null,
        sell: projected.totalSell,
        currency,
        quote: { totalCost: showCost ? quoteTotalCost : null, totalSell: quoteTotalSell },
      },
      previewToken,
    };
  }

  async addActivityItem(
    quoteId: string,
    input: AddActivityItemInput,
    actor: QuoteItemCreateActor,
    guard: AddActivityItemGuard = {},
  ) {
    const ctx = await this.resolveContext(quoteId, input, actor);

    // --- Guard: verify the preview token + identity binding + freshness ---
    // Slice 2C: decrypt the opaque create-preview token (tamper → null via GCM auth
    // tag). Expiry/identity/snapshot checks below are unchanged.
    const payload = verifyCreatePreviewToken(guard.previewToken, getPreviewTokenSecret());
    // Per-type kind: an activity token cannot create a guide (and vice-versa).
    if (!payload || payload.kind !== tokenKindForItemType(ctx.itemType)) {
      throw new BadRequestException({ code: 'invalid_preview_token', message: 'A valid create-preview token is required. Re-run the preview.' });
    }
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new BadRequestException({ code: 'invalid_preview_token', message: 'The create-preview token has expired. Re-run the preview.' });
    }
    // Identity binding — common fields + the type-specific identity.
    const commonMatches =
      payload.quoteId === quoteId &&
      payload.dayId === ctx.dayId &&
      payload.serviceDate === ctx.serviceDate.toISOString();
    const typeMatches =
      ctx.itemType === 'guide'
        ? payload.serviceId === ctx.serviceId &&
          payload.guideType === ctx.guideType &&
          payload.guideDuration === ctx.guideDuration &&
          payload.guideOvernight === (ctx.guideOvernight === true)
        : ctx.itemType === 'meal'
          ? payload.serviceId === ctx.serviceId &&
            payload.customServiceName === ctx.customServiceName &&
            (payload.unitCost ?? null) === (ctx.unitCost ?? null) &&
            (payload.currency ?? null) === (ctx.currency ?? null)
          : ctx.itemType === 'entrance'
            ? payload.serviceId === ctx.serviceId &&
              (payload.ticketRateVariantId ?? null) === (ctx.ticketRateVariantId ?? null)
            : ctx.itemType === 'external_package'
              ? (payload.netCost ?? null) === (ctx.netCost ?? null) &&
                (payload.currency ?? null) === (ctx.currency ?? null) &&
                (payload.country ?? null) === (ctx.country ?? null) &&
                (payload.clientDescription ?? null) === (ctx.clientDescription ?? null) &&
                (payload.pricingBasis ?? null) === (ctx.pricingBasis ?? null) &&
                (payload.packageName ?? null) === (ctx.packageName ?? null)
              : payload.activityId === ctx.activityId &&
                payload.activityRateVariantId === ctx.activityRateVariantId;
    if (!commonMatches || !typeMatches) {
      throw new BadRequestException({ code: 'invalid_preview_token', message: 'The preview token does not match this request. Re-run the preview.' });
    }

    // Snapshot mismatch → the quote changed since the preview.
    const snapshot = await this.snapshotQuoteState(quoteId);
    if (snapshot.hash !== payload.snapshotHash) {
      throw new ConflictException({ code: 'stale_preview', message: 'The quote changed since the preview; re-run the preview and try again.' });
    }

    // Re-resolve pricing (fail closed on a missing/unresolvable rate — nothing written).
    try {
      await this.quotes.previewCreateItemValues(this.buildCreateInput(ctx), { companyId: ctx.requiredActor.companyId });
    } catch (err) {
      throw new ConflictException({ code: 'not_resolvable', message: 'Pricing could not be resolved at create time.' });
    }

    // Confirmation required when the add changes pricing.
    const projected = (payload.projected ?? {}) as { itemCost?: number; itemSell?: number; quoteTotalCost?: number; quoteTotalSell?: number };
    const deltaNonZero = Number(projected.itemCost ?? 0) !== 0 || Number(projected.itemSell ?? 0) !== 0;
    if (deltaNonZero && guard.acknowledgedDelta !== true) {
      throw new ConflictException({ code: 'confirmation_required', message: 'This add changes pricing; re-submit with acknowledgedDelta=true to create.' });
    }

    // --- Commit via the UNCHANGED shared createItem (same pricing + recalc path). ---
    const created = await this.quotes.createItem(this.buildCreateInput(ctx), { companyId: ctx.requiredActor.companyId });

    const itemId = (created as { id?: string })?.id ?? null;
    const cost = (created as { totalCost?: number })?.totalCost ?? null;
    const sell = (created as { totalSell?: number })?.totalSell ?? null;
    const currency = (created as { currency?: string })?.currency ?? ctx.quote.quoteCurrency ?? null;

    // Post-write compare: actual recalculated totals vs the previewed projection.
    const after = await this.prisma.quote.findUnique({ where: { id: quoteId }, select: { totalCost: true, totalSell: true } });
    const actualTotalCost = Number(after?.totalCost ?? 0);
    const actualTotalSell = Number(after?.totalSell ?? 0);
    const costDrift = Math.abs(actualTotalCost - Number(projected.quoteTotalCost ?? actualTotalCost));
    const sellDrift = Math.abs(actualTotalSell - Number(projected.quoteTotalSell ?? actualTotalSell));

    if (costDrift > TOTALS_EPSILON || sellDrift > TOTALS_EPSILON) {
      // Rates/recalc moved between preview and commit — compensate by removing the
      // just-created item via the UNCHANGED removeItem (restores totals via recalc).
      if (itemId) {
        try {
          await this.quotes.removeItem(itemId, { companyId: ctx.requiredActor.companyId });
        } catch (err) {
          // Do NOT swallow: the item may remain with drifted totals — surface it.
          console.error('[quote-experiences-v2] compensating removeItem FAILED after drift', {
            quoteId,
            itemId,
            error: (err as Error)?.message,
          });
          throw new ConflictException({
            code: 'compensation_failed',
            message: 'Pricing drifted and the automatic rollback failed; please review this quote in Classic.',
            itemId,
          });
        }
      }
      throw new ConflictException({
        code: 'rate_changed',
        message: 'Pricing changed at create time; nothing was added. Re-run the preview and try again.',
      });
    }

    // Audit always records the true cost/sell (server-side, sanitized metadata) —
    // redaction below only affects what the CLIENT receives.
    await this.writeAudit(quoteId, itemId, {
      itemType: ctx.itemType,
      dayId: ctx.dayId,
      ...this.tokenIdentityFor(ctx),
      cost,
      sell,
      currency,
    }, ctx.requiredActor);

    // Slice 2C: redact cost/margin from the create response for non-finance roles
    // (selling total + currency stay visible).
    const showCost = canViewQuoteCostMargin(actor?.role ?? null);
    return {
      itemId,
      itemType: ctx.itemType,
      dayId: ctx.dayId,
      cost: showCost ? cost : null,
      sell,
      currency,
      quote: { totalCost: showCost ? actualTotalCost : null, totalSell: actualTotalSell },
    };
  }

  // Best-effort generic audit row. NEVER blocks the create (matches the
  // quote.pricing.apply audit contract). Safe metadata only — no secrets/tokens/
  // URLs/large payloads/PII.
  private async writeAudit(
    quoteId: string,
    itemId: string | null,
    fields: Record<string, unknown>,
    actor: NonNullable<QuoteItemCreateActor>,
  ): Promise<void> {
    try {
      await this.audit.log({
        actor: { id: actor.id, companyId: actor.companyId ?? null },
        action: 'quote.item.created',
        entity: 'quoteItem',
        entityId: itemId,
        metadata: { quoteId, itemId, ...fields },
      });
    } catch (err) {
      console.warn('[quote-experiences-v2] audit quote.item.created failed', (err as Error)?.message);
    }
  }

  private requireActor(actor: QuoteItemCreateActor): NonNullable<QuoteItemCreateActor> {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }
    return actor;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // D-a: Guarded single-item DELETE (remove). Option B — a remove-preview projects
  // the post-remove totals with NO writes and signs an opaque `v2-item-delete` token;
  // the guarded DELETE verifies the token + a fresh quote-state snapshot (fail closed
  // stale_preview), then delegates to the EXISTING, DETERMINISTIC QuotesService.removeItem
  // (delete + recalc; the QuoteItineraryDayItem day-link cascades on delete). No pricing
  // math, no resolver, no createItem/recalc change, no post-delete rollback (the snapshot
  // staleness check runs BEFORE the delete). Type-based eligibility: activity/guide/meal/
  // entrance/external_package only — hotel/transport are excluded.
  // ─────────────────────────────────────────────────────────────────────────

  // The select needed to classify a persisted QuoteItem without a schema marker.
  private readonly removableItemSelect = {
    id: true,
    quoteId: true,
    activityId: true,
    hotelId: true,
    transportServiceTypeId: true,
    routeId: true,
    vehicleId: true,
    touringRouteId: true,
    externalPackageName: true,
    totalCost: true,
    totalSell: true,
    currency: true,
    service: { select: { category: true, serviceType: { select: { name: true, code: true } }, entranceFee: { select: { id: true } } } },
  } as const;

  // Type-based classification. EXCLUDE hotel/transport first, then allow the five
  // V2-removable types; anything else is not removable. Uses the shared taxonomy helper
  // plus the persisted scalar signals (mirrors how the resolver identifies each type).
  private classifyRemovable(item: {
    activityId?: string | null;
    hotelId?: string | null;
    transportServiceTypeId?: string | null;
    routeId?: string | null;
    vehicleId?: string | null;
    touringRouteId?: string | null;
    externalPackageName?: string | null;
    service?: { category?: string | null; serviceType?: { name?: string | null; code?: string | null } | null; entranceFee?: { id: string } | null } | null;
  }): RemovableItemType | null {
    const group = item.service ? resolveServiceTaxonomyGroup(item.service) : null;
    // ── Exclusions first (denylist) ──
    if (item.hotelId || group === 'hotel') return null;
    if (item.transportServiceTypeId || item.routeId || item.vehicleId || item.touringRouteId || group === 'transport') return null;
    // ── Allowlist ──
    if (item.externalPackageName) return 'external_package';
    if (item.activityId || group === 'activity') return 'activity';
    if (group === 'guide') return 'guide';
    if (group === 'meal') return 'meal';
    if (item.service?.entranceFee || group === 'ticketing') return 'entrance';
    return null;
  }

  // Shared load + validation for both remove-preview and the guarded DELETE. Enforces
  // access/company isolation + editable status + latest revision (via assertQuoteAccess),
  // acceptedVersionId == null, item-belongs-to-quote, and type eligibility. No writes.
  private async resolveRemoveContext(quoteId: string, itemId: string, actor: QuoteItemCreateActor) {
    this.assertEnabled();
    const requiredActor = this.requireActor(actor);
    const quote = await this.assertQuoteAccess(quoteId, actor);

    // Accepted quotes are frozen even if the status somehow remained editable.
    const accepted = await this.prisma.quote.findUnique({ where: { id: quoteId }, select: { acceptedVersionId: true } });
    if (accepted?.acceptedVersionId) {
      throw new BadRequestException({ code: 'quote_not_editable', message: 'This quote can no longer be edited.' });
    }

    const item = await this.prisma.quoteItem.findUnique({ where: { id: itemId }, select: this.removableItemSelect });
    if (!item || item.quoteId !== quoteId) {
      throw new BadRequestException({ code: 'item_not_found', message: 'Quote item not found for this quote.' });
    }

    const itemType = this.classifyRemovable(item);
    if (!itemType) {
      throw new BadRequestException({
        code: 'item_not_removable',
        message: 'This item type cannot be removed from V2 in this version.',
      });
    }

    return { requiredActor, quote, item, itemType };
  }

  // Remove-preview: projects post-remove totals with NO writes and returns a signed
  // v2-item-delete token binding the item + a pre-remove snapshot. Selling total/delta
  // always visible; cost/margin redacted for non-finance roles.
  async previewRemoveItem(quoteId: string, itemId: string, actor: QuoteItemCreateActor) {
    const { item, itemType } = await this.resolveRemoveContext(quoteId, itemId, actor);

    const snapshot = await this.snapshotQuoteState(quoteId);
    const itemCost = Number(item.totalCost ?? 0);
    const itemSell = Number(item.totalSell ?? 0);
    const projectedTotalCost = snapshot.totalCost - itemCost;
    const projectedTotalSell = snapshot.totalSell - itemSell;
    const currency = item.currency ?? snapshot.currency ?? null;

    const issuedAt = Math.floor(Date.now() / 1000);
    const exp = issuedAt + CREATE_TOKEN_TTL_SECONDS;
    const previewToken = buildCreatePreviewToken(
      {
        kind: DELETE_TOKEN_KIND,
        quoteId,
        itemId,
        itemType,
        snapshotHash: snapshot.hash,
        projected: {
          itemCost,
          itemSell,
          quoteTotalCost: projectedTotalCost,
          quoteTotalSell: projectedTotalSell,
          currency,
        },
        issuedAt,
        exp,
      },
      getPreviewTokenSecret(),
    );

    const showCost = canViewQuoteCostMargin(actor?.role ?? null);
    return {
      itemId,
      itemType,
      currentTotalSell: snapshot.totalSell,
      projectedTotalSell,
      sellDelta: projectedTotalSell - snapshot.totalSell,
      currency,
      currentTotalCost: showCost ? snapshot.totalCost : null,
      projectedTotalCost: showCost ? projectedTotalCost : null,
      costDelta: showCost ? projectedTotalCost - snapshot.totalCost : null,
      previewToken,
    };
  }

  // Guarded DELETE: re-validate everything, verify the opaque token + snapshot freshness
  // (fail closed stale_preview), then delegate to the UNCHANGED removeItem (delete +
  // recalc). Best-effort audit quote.item.removed. No post-delete rollback.
  async removeExperienceItem(quoteId: string, itemId: string, actor: QuoteItemCreateActor, guard: RemoveItemGuard = {}) {
    const { requiredActor, quote, item, itemType } = await this.resolveRemoveContext(quoteId, itemId, actor);

    // --- Guard: verify the opaque remove-preview token + identity + freshness ---
    const payload = verifyCreatePreviewToken(guard.previewToken, getPreviewTokenSecret());
    if (!payload || payload.kind !== DELETE_TOKEN_KIND) {
      throw new BadRequestException({ code: 'invalid_preview_token', message: 'A valid remove-preview token is required. Re-run the preview.' });
    }
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new BadRequestException({ code: 'invalid_preview_token', message: 'The remove-preview token has expired. Re-run the preview.' });
    }
    if (payload.quoteId !== quoteId || payload.itemId !== itemId || payload.itemType !== itemType) {
      throw new BadRequestException({ code: 'invalid_preview_token', message: 'The preview token does not match this request. Re-run the preview.' });
    }

    // Snapshot mismatch → the quote changed since the preview (fail closed BEFORE delete).
    const snapshot = await this.snapshotQuoteState(quoteId);
    if (snapshot.hash !== payload.snapshotHash) {
      throw new ConflictException({ code: 'stale_preview', message: 'The quote changed since the preview; re-run the preview and try again.' });
    }

    // Resolve the day-link for the audit BEFORE the delete cascades it away.
    const dayLink = await this.prisma.quoteItineraryDayItem.findFirst({ where: { quoteServiceId: itemId }, select: { dayId: true } });
    const prevCost = Number(item.totalCost ?? 0);
    const prevSell = Number(item.totalSell ?? 0);
    const currency = item.currency ?? quote.quoteCurrency ?? null;

    // --- Commit via the UNCHANGED, deterministic removeItem (delete + recalc). ---
    await this.quotes.removeItem(itemId, { companyId: requiredActor.companyId });

    const after = await this.prisma.quote.findUnique({ where: { id: quoteId }, select: { totalCost: true, totalSell: true } });
    const actualTotalCost = Number(after?.totalCost ?? 0);
    const actualTotalSell = Number(after?.totalSell ?? 0);

    // Best-effort audit (never blocks). Sanitized metadata only.
    try {
      await this.audit.log({
        actor: { id: requiredActor.id, companyId: requiredActor.companyId ?? null },
        action: 'quote.item.removed',
        entity: 'quoteItem',
        entityId: itemId,
        metadata: { quoteId, itemId, itemType, dayId: dayLink?.dayId ?? null, cost: prevCost, sell: prevSell, currency },
      });
    } catch (err) {
      console.warn('[quote-experiences-v2] audit quote.item.removed failed', (err as Error)?.message);
    }

    const showCost = canViewQuoteCostMargin(actor?.role ?? null);
    return {
      itemId,
      itemType,
      removed: true,
      quote: { totalCost: showCost ? actualTotalCost : null, totalSell: actualTotalSell },
      currency,
    };
  }
}
