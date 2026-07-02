import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { requireActorCompanyId } from '../auth/company-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteItineraryDayDto, UpdateQuoteItineraryDayDto } from './quote-itinerary.dto';
import { isQuoteItineraryEditEnabled } from './quote-itinerary-edit.flags';
import { QuoteItineraryService } from './quote-itinerary.service';

// Actor for a V2 itinerary edit — carries the id + audit label (for the existing
// per-day QuoteItineraryAuditLog written by QuoteItineraryService) AND the
// companyId (for access scoping + the generic AuditLog row). Assembled by the
// controller from the AuthenticatedActor.
export type QuoteItineraryEditActor = {
  id: string;
  companyId?: string | null;
  auditLabel: string;
} | null;

export type AddDayInput = {
  dayNumber?: number | null;
  title?: string | null;
  notes?: string | null;
  notesLanguage?: string | null;
};

export type EditDayInput = {
  title?: string | null;
  notes?: string | null;
  notesLanguage?: string | null;
  // dayNumber is accepted (re-number a day) but is safe/pricing-inert. All other
  // day fields (transport metadata, sortOrder via reorder, etc.) are intentionally
  // NOT part of this slice.
  dayNumber?: number | null;
};

// Quote Builder V2 — Phase B, Slice 1: itinerary day management (add / edit meta /
// delete-empty). This is the FIRST real build/edit path in V2. It is deliberately
// thin: it gates on the QUOTE_ITINERARY_EDIT flag (fail-closed), enforces company
// isolation + latest-revision (mirroring the quote-mutation access guard), enforces
// the delete-empty rule, writes a generic AuditLog row, and otherwise DELEGATES to
// the EXISTING QuoteItineraryService.createDay/updateDay/removeDay — the same
// pricing-INERT writes Classic already uses (no recalculateQuoteTotals, no item
// pricing). The shared Classic routes/service are untouched by this class.
@Injectable()
export class QuoteItineraryV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itinerary: QuoteItineraryService,
    private readonly audit: AuditService,
  ) {}

  private get dayModel() {
    return (this.prisma as any).quoteItineraryDay;
  }

  private get dayItemModel() {
    return (this.prisma as any).quoteItineraryDayItem;
  }

  // Fail-closed feature gate. When the flag is OFF (default) every V2 itinerary
  // edit is rejected with a stable machine code the FE maps to a safe message.
  private assertEnabled(): void {
    if (!isQuoteItineraryEditEnabled()) {
      throw new BadRequestException({
        code: 'feature_disabled',
        message: 'Itinerary editing is not available in this version.',
      });
    }
  }

  // Access guard — mirrors QuotesService.assertQuoteMutationAccess (requireActorCompanyId
  // + quote-exists + latest-revision) and additionally enforces cross-company
  // isolation defensively: a quote that HAS a brandCompanyId belonging to a DIFFERENT
  // company than the actor is rejected. Legacy quotes with a null brandCompanyId are
  // allowed (unchanged from the base guard — no regression on pre-brand quotes).
  private async assertQuoteAccess(quoteId: string, actor: QuoteItineraryEditActor) {
    const companyId = requireActorCompanyId(actor);

    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId },
      select: { id: true, brandCompanyId: true },
    });
    if (!quote) {
      throw new BadRequestException('Quote not found');
    }
    if (quote.brandCompanyId && quote.brandCompanyId !== companyId) {
      throw new ForbiddenException('Quote belongs to a different company');
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

  // Load a day and assert it belongs to the quote in the route (prevents editing/
  // deleting another quote's day via a mismatched path). Returns the day shell.
  private async assertDayBelongsToQuote(quoteId: string, dayId: string) {
    const day = await this.dayModel.findUnique({
      where: { id: dayId },
      select: { id: true, quoteId: true, dayNumber: true, title: true },
    });
    if (!day || day.quoteId !== quoteId) {
      throw new BadRequestException('Itinerary day not found for this quote');
    }
    return day;
  }

  // Best-effort generic audit row. NEVER blocks the mutation — a failure here is
  // swallowed (matches the quote.pricing.apply audit contract). No secrets/tokens/
  // URLs/large payloads: only safe structural summary fields.
  private async writeAudit(
    action: 'quote.itinerary.day.created' | 'quote.itinerary.day.updated' | 'quote.itinerary.day.deleted',
    quoteId: string,
    dayId: string,
    metadata: Record<string, unknown>,
    actor: QuoteItineraryEditActor,
  ): Promise<void> {
    try {
      await this.audit.log({
        actor: actor ? { id: actor.id, companyId: actor.companyId ?? null } : null,
        action,
        entity: 'quoteItineraryDay',
        entityId: dayId,
        metadata: { quoteId, dayId, ...metadata },
      });
    } catch (err) {
      // Audit is advisory — never fail the write because logging failed.
      console.warn(`[quote-itinerary-v2] audit ${action} failed`, (err as Error)?.message);
    }
  }

  // ── Add a new itinerary day (pricing-inert) ──────────────────────────────────
  async addDay(quoteId: string, input: AddDayInput, actor: QuoteItineraryEditActor) {
    this.assertEnabled();
    await this.assertQuoteAccess(quoteId, actor);
    const requiredActor = this.requireActor(actor);

    // Auto-number when the client doesn't pass an explicit dayNumber: next after
    // the current max (min 1). createDay still validates + rejects duplicates.
    const existing = await this.dayModel.findMany({ where: { quoteId }, select: { dayNumber: true } });
    const maxDayNumber = existing.reduce((max: number, d: any) => Math.max(max, Number(d.dayNumber) || 0), 0);
    const dayNumber = Number.isInteger(input.dayNumber) && (input.dayNumber as number) > 0
      ? (input.dayNumber as number)
      : maxDayNumber + 1;
    const title = (input.title ?? '').trim() || `Day ${dayNumber}`;

    const dto: CreateQuoteItineraryDayDto = {
      dayNumber,
      title,
      notes: input.notes ?? null,
      notesLanguage: input.notesLanguage ?? null,
    };

    const created = await this.itinerary.createDay(quoteId, dto, {
      id: requiredActor.id,
      auditLabel: requiredActor.auditLabel,
    });

    await this.writeAudit('quote.itinerary.day.created', quoteId, created.id, {
      dayNumber: created.dayNumber,
      sortOrder: created.sortOrder ?? null,
      title: this.summarizeText(created.title),
    }, actor);

    return created;
  }

  // ── Edit day meta: title / notes / notesLanguage (pricing-inert) ─────────────
  async editDay(quoteId: string, dayId: string, input: EditDayInput, actor: QuoteItineraryEditActor) {
    this.assertEnabled();
    await this.assertQuoteAccess(quoteId, actor);
    await this.assertDayBelongsToQuote(quoteId, dayId);
    const requiredActor = this.requireActor(actor);

    // Only safe day-meta fields — NEVER pricing, services, transport metadata,
    // sortOrder/reorder, or day-item links.
    const dto: UpdateQuoteItineraryDayDto = {
      title: input.title === undefined ? undefined : (input.title ?? undefined),
      notes: input.notes === undefined ? undefined : input.notes,
      notesLanguage: input.notesLanguage === undefined ? undefined : input.notesLanguage,
      dayNumber: Number.isInteger(input.dayNumber) ? (input.dayNumber as number) : undefined,
    };

    const updated = await this.itinerary.updateDay(dayId, dto, {
      id: requiredActor.id,
      auditLabel: requiredActor.auditLabel,
    });

    await this.writeAudit('quote.itinerary.day.updated', quoteId, dayId, {
      dayNumber: updated.dayNumber,
      title: this.summarizeText(updated.title),
      notesChanged: input.notes !== undefined,
    }, actor);

    return updated;
  }

  // ── Delete an EMPTY day only (pricing-inert; no cascade of quote items) ───────
  async deleteDay(quoteId: string, dayId: string, actor: QuoteItineraryEditActor) {
    this.assertEnabled();
    await this.assertQuoteAccess(quoteId, actor);
    const day = await this.assertDayBelongsToQuote(quoteId, dayId);
    const requiredActor = this.requireActor(actor);

    // Guard: only days with ZERO linked quote items (QuoteItineraryDayItem rows)
    // may be deleted. This never cascade-deletes quote items or their pricing.
    const linkedItems = await this.dayItemModel.count({ where: { dayId } });
    if (linkedItems > 0) {
      throw new BadRequestException({
        code: 'day_not_empty',
        message: 'Move or remove items before deleting this day.',
      });
    }

    await this.itinerary.removeDay(dayId, { id: requiredActor.id, auditLabel: requiredActor.auditLabel });

    await this.writeAudit('quote.itinerary.day.deleted', quoteId, dayId, {
      dayNumber: day.dayNumber,
      title: this.summarizeText(day.title),
      hadItems: false,
    }, actor);

    return { id: dayId };
  }

  private requireActor(actor: QuoteItineraryEditActor) {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }
    return actor;
  }

  // Keep audit metadata compact + safe — never log large free-text blobs.
  private summarizeText(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  }
}
