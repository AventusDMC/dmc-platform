import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { requireActorCompanyId } from '../auth/company-scope';
import { EXPERIENCE_DEFAULT_MARKUP, GUIDE_DEFAULT_MARKUP } from '../common/pricing-constants';
import { resolveServiceTaxonomyGroup } from '../common/service-taxonomy';
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

// V2 item-create input. Slice 2 supports `activity`; Slice 3 adds `guide`. Absent
// itemType is treated as `activity` (backward compatible). Each type uses its own
// required fields; anything else is out_of_scope.
export type AddItemInput = {
  itemType?: string | null;
  dayId?: string | null;
  serviceDate?: string | null;
  // Activity
  activityId?: string | null;
  activityRateVariantId?: string | null;
  adultCount?: number | null;
  childCount?: number | null;
  // Guide
  serviceId?: string | null;
  guideType?: string | null;
  guideDuration?: string | null;
  overnight?: boolean | null;
  guideLanguage?: string | null;
};

// Back-compat alias (Slice 2 name).
export type AddActivityItemInput = AddItemInput;

// Statuses on which V2 item-create is allowed (default-safe: finalized/unknown
// statuses are rejected). Mirrors the FE preview-editable allowlist.
const EDITABLE_STATUSES = new Set(['DRAFT', 'READY', 'REVISION_REQUESTED']);
const SUPPORTED_ITEM_TYPES = new Set(['activity', 'guide']);
const GUIDE_TYPES = new Set(['local', 'escort']);
const GUIDE_DURATIONS = new Set(['half_day', 'full_day']);

// Quote Builder V2 — Phase B item-create (Slice 2 activity + Slice 3 guide). This is
// deliberately thin: it gates on the QUOTE_ITEM_CREATE flag (fail-closed), restricts
// to the supported types, enforces access + company isolation + editable status +
// day-belongs-to-quote + per-type integrity, then DELEGATES to the EXISTING
// QuotesService.createItem (the same pricing + recalculateQuoteTotals path Classic
// uses — pricing is never forked). A sanitized generic AuditLog row is written on
// success; audit failure never blocks the create.
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

  // Public dispatcher — activity + guide. Shared guards run once; per-type validation
  // + createItem args are built in the branch. Exactly one item is created.
  async addItem(quoteId: string, input: AddItemInput, actor: QuoteItemCreateActor) {
    this.assertEnabled();

    const itemType = String(input.itemType ?? 'activity').toLowerCase().trim() || 'activity';
    if (!SUPPORTED_ITEM_TYPES.has(itemType)) {
      throw new BadRequestException({
        code: 'out_of_scope',
        message: 'Only activity and guide items can be added from V2 in this version.',
      });
    }

    // Shared required fields.
    const dayId = (input.dayId ?? '').trim();
    const serviceDateRaw = (input.serviceDate ?? '').trim();
    const missing: string[] = [];
    if (!dayId) missing.push('dayId');
    if (!serviceDateRaw) missing.push('serviceDate');
    // Per-type required fields.
    if (itemType === 'activity') {
      if (!(input.activityId ?? '').trim()) missing.push('activityId');
      if (!(input.activityRateVariantId ?? '').trim()) missing.push('activityRateVariantId');
    } else {
      if (!(input.serviceId ?? '').trim()) missing.push('serviceId');
      if (!(input.guideType ?? '').trim()) missing.push('guideType');
      if (!(input.guideDuration ?? '').trim()) missing.push('guideDuration');
    }
    if (missing.length > 0) {
      throw new BadRequestException({ code: 'missing_field', message: `Missing required field(s): ${missing.join(', ')}` });
    }

    const serviceDate = new Date(serviceDateRaw);
    if (Number.isNaN(serviceDate.getTime())) {
      throw new BadRequestException({ code: 'invalid_service_date', message: 'serviceDate is not a valid date.' });
    }

    // Guide enum validation (cheap, before quote access).
    if (itemType === 'guide') {
      const gt = String(input.guideType).toLowerCase().trim();
      const gd = String(input.guideDuration).toLowerCase().trim();
      if (!GUIDE_TYPES.has(gt)) {
        throw new BadRequestException({ code: 'invalid_guide_type', message: 'guideType must be local or escort.' });
      }
      if (!GUIDE_DURATIONS.has(gd)) {
        throw new BadRequestException({ code: 'invalid_guide_duration', message: 'guideDuration must be half_day or full_day.' });
      }
    }

    const requiredActor = this.requireActor(actor);
    const quote = await this.assertQuoteAccess(quoteId, actor);

    // Day must belong to this quote (the shared resolver does NOT enforce this).
    const day = await this.prisma.quoteItineraryDay.findUnique({ where: { id: dayId }, select: { id: true, quoteId: true } });
    if (!day || day.quoteId !== quoteId) {
      throw new BadRequestException({ code: 'day_not_found', message: 'Itinerary day not found for this quote.' });
    }

    const built = itemType === 'activity' ? await this.buildActivity(input, quote) : await this.buildGuide(input);

    // Delegate to the EXISTING createItem — same pricing + recalc path Classic uses.
    const created = await this.quotes.createItem(
      {
        quoteId,
        itineraryId: dayId,
        serviceDate,
        // quantity 1 = one item; markup is set per-type in the builder to the standard
        // constant so the resolver prices it exactly as the Classic add path does.
        quantity: 1,
        ...built.createInput,
      },
      { companyId: requiredActor.companyId },
    );

    const itemId = (created as { id?: string })?.id ?? null;
    const cost = (created as { totalCost?: number })?.totalCost ?? null;
    const sell = (created as { totalSell?: number })?.totalSell ?? null;
    const currency = (created as { currency?: string })?.currency ?? quote.quoteCurrency ?? null;

    // Fresh quote totals after the delegated recalculation (for the FE toast).
    const totals = await this.prisma.quote.findUnique({ where: { id: quoteId }, select: { totalCost: true, totalSell: true } });

    await this.writeAudit(quoteId, itemId, { ...built.auditFields, dayId, cost, sell, currency }, requiredActor);

    return {
      itemId,
      itemType,
      dayId,
      cost,
      sell,
      currency,
      quote: { totalCost: totals?.totalCost ?? null, totalSell: totals?.totalSell ?? null },
    };
  }

  // Back-compat entry (Slice 2). Forces the activity type and delegates.
  async addActivityItem(quoteId: string, input: AddItemInput, actor: QuoteItemCreateActor) {
    return this.addItem(quoteId, { ...input, itemType: input.itemType ?? 'activity' }, actor);
  }

  // ── Activity build: integrity checks + createItem args + audit fields ─────────
  private async buildActivity(input: AddItemInput, quote: { adults?: number | null; children?: number | null }) {
    const activityId = (input.activityId ?? '').trim();
    const activityRateVariantId = (input.activityRateVariantId ?? '').trim();

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

    return {
      createInput: {
        activityId,
        activityRateVariantId,
        adultCount: input.adultCount ?? quote.adults ?? undefined,
        childCount: input.childCount ?? quote.children ?? undefined,
        markupPercent: EXPERIENCE_DEFAULT_MARKUP,
      },
      auditFields: { itemType: 'activity', activityId, activityRateVariantId } as Record<string, unknown>,
    };
  }

  // ── Guide build: guide-compatible service check + createItem args + audit fields ─
  // Uses a guide-type SERVICE only (never a guide person). Pricing is the existing
  // deterministic GUIDE_RATES (+ overnight supplement) applied inside createItem;
  // markup is the standard GUIDE_DEFAULT_MARKUP. No supplier/person assignment.
  private async buildGuide(input: AddItemInput) {
    const serviceId = (input.serviceId ?? '').trim();
    const guideType = String(input.guideType).toLowerCase().trim();
    const guideDuration = String(input.guideDuration).toLowerCase().trim();
    const overnight = Boolean(input.overnight);
    const langRaw = (input.guideLanguage ?? '').trim();
    const guideLanguage = langRaw ? langRaw.slice(0, 40) : undefined;

    const service = await (this.prisma as any).supplierService.findUnique({
      where: { id: serviceId },
      select: { id: true, category: true, serviceType: { select: { name: true, code: true } } },
    });
    if (!service) {
      throw new BadRequestException({ code: 'service_not_found', message: 'Service not found.' });
    }
    if (resolveServiceTaxonomyGroup(service) !== 'guide') {
      throw new BadRequestException({
        code: 'not_guide_service',
        message: 'Selected service is not guide-compatible.',
      });
    }

    return {
      createInput: {
        serviceId,
        guideType,
        guideDuration,
        overnight,
        guideLanguage,
        markupPercent: GUIDE_DEFAULT_MARKUP,
      },
      // guideLanguage is intentionally NOT audited (it is a free-text request note).
      auditFields: { itemType: 'guide', serviceId, guideType, guideDuration, overnight } as Record<string, unknown>,
    };
  }

  // Best-effort generic audit row. NEVER blocks the create (matches the
  // quote.pricing.apply audit contract). Safe metadata only — no secrets/tokens/
  // URLs/large payloads/PII/guide-person id.
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
