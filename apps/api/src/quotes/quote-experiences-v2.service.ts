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
  // Discriminator. Scope is ACTIVITY + GUIDE — anything else is rejected out_of_scope.
  // Absent is treated as 'activity' (activity remains the default for back-compat).
  itemType?: string | null;
  dayId?: string | null;
  // Activity fields (itemType='activity').
  activityId?: string | null;
  activityRateVariantId?: string | null;
  // Guide fields (itemType='guide'). serviceId is a GUIDE-type SERVICE (not a person).
  serviceId?: string | null;
  guideType?: string | null;
  guideDuration?: string | null;
  guideOvernight?: boolean | null;
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

// Statuses on which V2 item-create is allowed (default-safe: finalized/unknown
// statuses are rejected). Mirrors the FE preview-editable allowlist.
const EDITABLE_STATUSES = new Set(['DRAFT', 'READY', 'REVISION_REQUESTED']);

// Preview-token version/kind + TTL. The token is stateless (nothing persisted) and
// bound to the exact intended add + a snapshot of the quote's pre-create pricing.
// The kind is PER ITEM-TYPE so an activity create-preview token can never create a
// guide (and vice-versa) — the create verifies the kind matches the request's type.
const CREATE_TOKEN_KIND = 'v2-activity-create';
const GUIDE_CREATE_TOKEN_KIND = 'v2-guide-create';
function tokenKindForItemType(itemType: 'activity' | 'guide'): string {
  return itemType === 'guide' ? GUIDE_CREATE_TOKEN_KIND : CREATE_TOKEN_KIND;
}
const CREATE_TOKEN_TTL_SECONDS = 600; // 10 minutes
// Money tolerance for the post-write totals compare (half a cent) — guards against
// float rounding while still catching any real rate/recalc drift.
const TOTALS_EPSILON = 0.005;

type ResolvedCreateContext = {
  itemType: 'activity' | 'guide';
  requiredActor: NonNullable<QuoteItemCreateActor>;
  quote: { id: string; quoteCurrency: string | null; adults: number | null; children: number | null };
  dayId: string;
  serviceDate: Date;
  adultCount: number | undefined;
  childCount: number | undefined;
  // Activity-only (present when itemType='activity').
  activityId?: string;
  activityRateVariantId?: string;
  // Guide-only (present when itemType='guide').
  serviceId?: string;
  guideType?: string;
  guideDuration?: string;
  guideOvernight?: boolean;
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

  // Resolve the item type. Absent → 'activity' (back-compat). ACTIVITY + GUIDE only.
  private resolveItemType(input: AddActivityItemInput): 'activity' | 'guide' {
    const raw = String(input.itemType ?? 'activity').trim().toLowerCase() || 'activity';
    if (raw !== 'activity' && raw !== 'guide') {
      throw new BadRequestException({
        code: 'out_of_scope',
        message: 'Only activity and guide items can be added from V2 in this version.',
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
}
