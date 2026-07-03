import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { QuoteStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { requireActorCompanyId } from '../auth/company-scope';
import { PrismaService } from '../prisma/prisma.service';
import { isQuoteBookingCreateEnabled } from './quote-booking-create.flags';
import { QuotesService } from './quotes.service';

// Actor for a V2 booking-create — id + auditLabel (for the generic AuditLog row)
// and companyId (for access scoping + delegated convertToBooking). Assembled by the
// controller from the AuthenticatedActor.
export type QuoteBookingCreateActor = {
  id: string;
  companyId?: string | null;
  auditLabel: string;
} | null;

// Statuses from which a quote can be converted into a booking. Mirrors the core
// convertToBooking gate (ACCEPTED or CONFIRMED only). CONFIRMED is not part of the
// Prisma QuoteStatus TS union in some generated clients, so it is matched by value.
const CONVERTIBLE_STATUSES = new Set<string>(['ACCEPTED', 'CONFIRMED']);

export type CreateBookingFromQuoteResult = {
  bookingId: string;
  bookingRef: string | null;
  quoteId: string;
  opsV2Url: string;
  alreadyExisted: boolean;
};

// Booking Creation V2 — Phase 1, Slice 1A: convert ONE accepted/confirmed quote into
// a real booking from V2. This is deliberately thin: it gates on the
// QUOTE_BOOKING_CREATE flag (fail-closed), enforces access + company isolation +
// latest-revision, pre-checks convertibility (status + acceptedVersionId) and
// duplicate conversion for friendly typed errors, then DELEGATES to the EXISTING
// QuotesService.convertToBooking (the same conversion engine Classic uses — the
// conversion logic is never forked). A sanitized generic AuditLog row
// (quote.booking.created) is written on success; audit failure never blocks the
// conversion. The core convertToBooking still emits its own booking.created audit.
@Injectable()
export class QuoteBookingV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesService,
    private readonly audit: AuditService,
  ) {}

  private assertEnabled(): void {
    if (!isQuoteBookingCreateEnabled()) {
      throw new BadRequestException({
        code: 'feature_disabled',
        message: 'Creating bookings from V2 is not available in this version.',
      });
    }
  }

  // Access guard — requireActorCompanyId + quote-exists + brand-company isolation +
  // latest-revision. Deliberately does NOT apply an editable-status gate: convertible
  // quotes are ACCEPTED/CONFIRMED (finalized), not editable drafts. Returns the fields
  // needed for the convertibility + duplicate pre-checks.
  private async assertQuoteAccess(quoteId: string, actor: QuoteBookingCreateActor) {
    const companyId = requireActorCompanyId(actor);

    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId },
      select: { id: true, brandCompanyId: true, status: true, acceptedVersionId: true },
    });
    if (!quote) {
      throw new BadRequestException({ code: 'quote_not_found', message: 'Quote not found' });
    }
    if (quote.brandCompanyId && quote.brandCompanyId !== companyId) {
      throw new ForbiddenException('Quote belongs to a different company');
    }

    const newerRevision = await this.prisma.quote.findFirst({
      where: { revisedFromId: quoteId },
      select: { id: true },
    });
    if (newerRevision && newerRevision.id !== quoteId) {
      throw new BadRequestException('Only the latest quote revision can be converted to a booking');
    }

    return quote;
  }

  async createBookingFromQuote(
    quoteId: string,
    actor: QuoteBookingCreateActor,
  ): Promise<CreateBookingFromQuoteResult> {
    this.assertEnabled();

    const requiredActor = this.requireActor(actor);
    const quote = await this.assertQuoteAccess(quoteId, actor);

    // Convertibility pre-checks — friendly typed errors before the heavier
    // conversion transaction. The core convertToBooking re-checks these as the
    // authoritative gate.
    const status = String(quote.status || '').toUpperCase();
    if (status === String(QuoteStatus.CANCELLED)) {
      throw new BadRequestException({
        code: 'quote_not_convertible',
        message: 'Cancelled quotes cannot be converted to bookings.',
      });
    }
    if (!CONVERTIBLE_STATUSES.has(status)) {
      throw new BadRequestException({
        code: 'quote_not_convertible',
        message: 'Only accepted or confirmed quotes can be converted to bookings.',
      });
    }
    if (!quote.acceptedVersionId) {
      throw new BadRequestException({
        code: 'missing_accepted_version',
        message: 'This quote has no accepted version to convert. Accept the quote first.',
      });
    }

    // Duplicate pre-check (better UX): if a primary booking already exists for this
    // quote, return it idempotently instead of a raw 400. The in-transaction check in
    // convertToBooking remains the race-safe backstop.
    const existing = await this.findExistingPrimaryBooking(quoteId);
    if (existing) {
      return this.buildResult(existing.id, existing.bookingRef ?? null, quoteId, true);
    }

    // Delegate to the EXISTING conversion engine — same snapshot + service-mapping +
    // booking-ref + duplicate-protection path Classic uses. Conversion is never forked.
    let created: { id: string; bookingRef?: string | null };
    try {
      created = (await this.quotes.convertToBooking(quoteId, {
        id: requiredActor.id,
        companyId: requiredActor.companyId ?? null,
      } as any)) as { id: string; bookingRef?: string | null };
    } catch (err) {
      // A concurrent conversion may have won the race between our pre-check and the
      // transaction. Surface it as an idempotent booking_exists rather than a failure.
      if (this.isDuplicateConversionError(err)) {
        const raced = await this.findExistingPrimaryBooking(quoteId);
        if (raced) {
          return this.buildResult(raced.id, raced.bookingRef ?? null, quoteId, true);
        }
        throw new BadRequestException({
          code: 'booking_exists',
          message: 'A booking already exists for this quote.',
        });
      }
      throw new BadRequestException({
        code: 'conversion_failed',
        message: this.errorMessage(err) || 'Booking conversion failed.',
      });
    }

    const bookingId = created?.id;
    const bookingRef = created?.bookingRef ?? null;
    if (!bookingId) {
      throw new BadRequestException({
        code: 'conversion_failed',
        message: 'Booking conversion did not return a booking id.',
      });
    }

    await this.writeAudit(quoteId, bookingId, bookingRef, requiredActor);

    return this.buildResult(bookingId, bookingRef, quoteId, false);
  }

  private buildResult(
    bookingId: string,
    bookingRef: string | null,
    quoteId: string,
    alreadyExisted: boolean,
  ): CreateBookingFromQuoteResult {
    return {
      bookingId,
      bookingRef,
      quoteId,
      opsV2Url: `/operations/v2/${bookingId}`,
      alreadyExisted,
    };
  }

  private async findExistingPrimaryBooking(quoteId: string) {
    return this.prisma.booking.findFirst({
      where: { quoteId, amendedFromId: null } as any,
      select: { id: true, bookingRef: true },
    });
  }

  private isDuplicateConversionError(err: unknown): boolean {
    return /already exists/i.test(this.errorMessage(err));
  }

  private errorMessage(err: unknown): string {
    if (err instanceof BadRequestException) {
      const res = err.getResponse();
      if (typeof res === 'string') return res;
      if (res && typeof res === 'object') {
        const message = (res as { message?: unknown }).message;
        if (typeof message === 'string') return message;
        if (Array.isArray(message)) return message.join('; ');
      }
      return err.message;
    }
    return (err as Error)?.message ?? '';
  }

  // Best-effort generic audit row. NEVER blocks the conversion (matches the
  // quote.item.created / quote.pricing.apply audit contract). Safe metadata only — no
  // secrets/tokens/URLs/large payloads/PII. The core convertToBooking emits its own
  // booking.created audit independently.
  private async writeAudit(
    quoteId: string,
    bookingId: string,
    bookingRef: string | null,
    actor: NonNullable<QuoteBookingCreateActor>,
  ): Promise<void> {
    try {
      await this.audit.log({
        actor: { id: actor.id, companyId: actor.companyId ?? null },
        action: 'quote.booking.created',
        entity: 'booking',
        entityId: bookingId,
        metadata: { quoteId, bookingId, bookingRef, source: 'quote_builder_v2' },
      });
    } catch (err) {
      console.warn('[quote-booking-v2] audit quote.booking.created failed', (err as Error)?.message);
    }
  }

  private requireActor(actor: QuoteBookingCreateActor): NonNullable<QuoteBookingCreateActor> {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }
    return actor;
  }
}
