import { Controller, Param, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { QuoteBookingCreateActor, QuoteBookingV2Service } from './quote-booking-v2.service';

// Booking Creation V2 — Phase 1, Slice 1A: convert an accepted/confirmed quote into a
// real booking. NEW, V2-SCOPED route under /quotes/:quoteId/v2 so it never touches the
// shared Classic convert endpoint (POST /quotes/:id/convert-to-booking). Gated by the
// QUOTE_BOOKING_CREATE flag inside the service (fail-closed) and restricted to
// admin/operations (super_admin overrides; agent_admin behaves as admin via RolesGuard).
// The service enforces access/company isolation, latest-revision, convertibility, and
// duplicate protection; it delegates the actual conversion to the existing
// QuotesService.convertToBooking and writes a sanitized audit row.
@Controller('quotes/:quoteId/v2')
export class QuoteBookingV2Controller {
  constructor(private readonly service: QuoteBookingV2Service) {}

  @Post('booking')
  @Roles('admin', 'operations')
  async createBooking(
    @Param('quoteId') quoteId: string,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.createBookingFromQuote(quoteId, this.toActor(actor));
  }

  private toActor(actor?: AuthenticatedActor | null): QuoteBookingCreateActor {
    return actor ? { id: actor.id, companyId: actor.companyId ?? null, auditLabel: actor.auditLabel } : null;
  }
}
