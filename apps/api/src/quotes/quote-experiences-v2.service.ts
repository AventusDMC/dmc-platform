import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { requireActorCompanyId } from '../auth/company-scope';
import { EXPERIENCE_DEFAULT_MARKUP } from '../common/pricing-constants';
import { PrismaService } from '../prisma/prisma.service';
import { isQuoteItemCreateEnabled } from './quote-item-create.flags';
import { QuotesService } from './quotes.service';

// Actor for a V2 item create — id + auditLabel (for the generic AuditLog row) and
// companyId (for access scoping + delegated createItem). Assembled by the controller
// from the AuthenticatedActor.
export type QuoteItemCreateActor = {
  id: string;
  companyId?: string | null;
  auditLabel: string;
} | null;

export type AddActivityItemInput = {
  // Optional discriminator. Slice 2 is ACTIVITY ONLY — anything else is rejected
  // out_of_scope. Absent is treated as 'activity' (the route is activity-scoped).
  itemType?: string | null;
  dayId?: string | null;
  activityId?: string | null;
  activityRateVariantId?: string | null;
  serviceDate?: string | null;
  // Optional pax override; defaults from the quote when omitted.
  adultCount?: number | null;
  childCount?: number | null;
};

// Statuses on which V2 item-create is allowed (default-safe: finalized/unknown
// statuses are rejected). Mirrors the FE preview-editable allowlist.
const EDITABLE_STATUSES = new Set(['DRAFT', 'READY', 'REVISION_REQUESTED']);

// Quote Builder V2 — Phase B, Slice 2: add ONE Activity item from V2. This is the
// first item-create path in V2. It is deliberately thin: it gates on the
// QUOTE_ITEM_CREATE flag (fail-closed), restricts to ACTIVITY only, enforces access
// + company isolation + editable status + day-belongs-to-quote + activity/variant
// integrity, then DELEGATES to the EXISTING QuotesService.createItem (the same
// pricing + recalculateQuoteTotals path Classic uses — pricing is never forked).
// A sanitized generic AuditLog row is written on success; audit failure never blocks
// the create.
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

  async addActivityItem(quoteId: string, input: AddActivityItemInput, actor: QuoteItemCreateActor) {
    this.assertEnabled();

    // ACTIVITY only in this slice.
    if (input.itemType != null && String(input.itemType).toLowerCase() !== 'activity') {
      throw new BadRequestException({
        code: 'out_of_scope',
        message: 'Only activity items can be added from V2 in this version.',
      });
    }

    // Required fields (explicit selection — no silent defaults for identity fields).
    const dayId = (input.dayId ?? '').trim();
    const activityId = (input.activityId ?? '').trim();
    const activityRateVariantId = (input.activityRateVariantId ?? '').trim();
    const serviceDateRaw = (input.serviceDate ?? '').trim();
    const missing = [
      ['dayId', dayId],
      ['activityId', activityId],
      ['activityRateVariantId', activityRateVariantId],
      ['serviceDate', serviceDateRaw],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      throw new BadRequestException({ code: 'missing_field', message: `Missing required field(s): ${missing.join(', ')}` });
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

    // Activity + rate-variant integrity (fail fast with clear codes; the delegated
    // resolver also validates these defensively).
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

    // Delegate to the EXISTING createItem — same pricing + recalc path Classic uses.
    // pax defaults from the quote when the client omits them.
    const created = await this.quotes.createItem(
      {
        quoteId,
        activityId,
        activityRateVariantId,
        itineraryId: dayId,
        serviceDate,
        adultCount: input.adultCount ?? quote.adults ?? undefined,
        childCount: input.childCount ?? quote.children ?? undefined,
        // Required by createItem. quantity 1 = one activity booking; markup defaults
        // to the standard experience markup (the resolver applies it exactly as the
        // Classic add path does — pricing is never forked here).
        quantity: 1,
        markupPercent: EXPERIENCE_DEFAULT_MARKUP,
      },
      { companyId: requiredActor.companyId },
    );

    const itemId = (created as { id?: string })?.id ?? null;
    const cost = (created as { totalCost?: number })?.totalCost ?? null;
    const sell = (created as { totalSell?: number })?.totalSell ?? null;
    const currency = (created as { currency?: string })?.currency ?? quote.quoteCurrency ?? null;

    // Fresh quote totals after the delegated recalculation (for the FE toast).
    const totals = await this.prisma.quote.findUnique({ where: { id: quoteId }, select: { totalCost: true, totalSell: true } });

    await this.writeAudit(quoteId, itemId, {
      itemType: 'activity',
      dayId,
      activityId,
      activityRateVariantId,
      cost,
      sell,
      currency,
    }, requiredActor);

    return {
      itemId,
      itemType: 'activity',
      dayId,
      cost,
      sell,
      currency,
      quote: { totalCost: totals?.totalCost ?? null, totalSell: totals?.totalSell ?? null },
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
