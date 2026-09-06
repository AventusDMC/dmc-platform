import { Body, Controller, Delete, ForbiddenException, Param, Patch, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor, DmcRole } from '../auth/auth.types';
import {
  AddDayInput,
  EditDayInput,
  QuoteItineraryEditActor,
  QuoteItineraryV2Service,
} from './quote-itinerary-v2.service';

// CP-N4d: explicit fail-closed allowlist for the V2-scoped itinerary WRITE handlers
// (add / edit-meta / delete-empty day). Mirrors the canonical
// QuotesController.QUOTE_OPERATIONAL_WRITE_ROLES: admin / super_admin / operations.
// These handlers previously carried only @Roles('admin','operations') with no explicit
// assertion, so the coalescing roles.guard admitted `agent_admin` (coalesced to 'admin')
// into the V2 itinerary mutations. Enforced by explicit membership BEFORE the service
// call (and therefore before the QUOTE_ITINERARY_EDIT flag check inside the service),
// so finance / viewer / agent / agent_admin / missing / unknown / future-unlisted are
// denied first — never the coalescing @Roles guard.
const V2_ITINERARY_WRITE_ROLES: readonly DmcRole[] = ['admin', 'super_admin', 'operations'];

type AddDayBody = {
  dayNumber?: number | string | null;
  title?: string | null;
  notes?: string | null;
  notesLanguage?: string | null;
};

type EditDayBody = {
  title?: string | null;
  notes?: string | null;
  notesLanguage?: string | null;
  dayNumber?: number | string | null;
};

// Quote Builder V2 — Phase B, Slice 1: itinerary day management (add / edit meta /
// delete-empty). These are NEW, V2-SCOPED routes under /quotes/:quoteId/v2/itinerary
// so they never touch the shared Classic itinerary endpoints. All three are gated by
// the QUOTE_ITINERARY_EDIT flag inside the service (fail-closed) and restricted to
// admin/operations. The service enforces company isolation, the delete-empty rule,
// and writes a generic audit row; the actual pricing-inert writes are delegated to
// the existing QuoteItineraryService.
@Controller('quotes/:quoteId/v2/itinerary')
export class QuoteItineraryV2Controller {
  constructor(private readonly service: QuoteItineraryV2Service) {}

  @Post('day')
  @Roles('admin', 'super_admin', 'operations')
  async addDay(
    @Param('quoteId') quoteId: string,
    @Body() body: AddDayBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    this.assertV2ItineraryWriteAccess(actor);
    return this.service.addDay(quoteId, this.toAddInput(body), this.toEditActor(actor));
  }

  @Patch('day/:dayId')
  @Roles('admin', 'super_admin', 'operations')
  async editDay(
    @Param('quoteId') quoteId: string,
    @Param('dayId') dayId: string,
    @Body() body: EditDayBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    this.assertV2ItineraryWriteAccess(actor);
    return this.service.editDay(quoteId, dayId, this.toEditInput(body), this.toEditActor(actor));
  }

  @Delete('day/:dayId')
  @Roles('admin', 'super_admin', 'operations')
  async deleteDay(
    @Param('quoteId') quoteId: string,
    @Param('dayId') dayId: string,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    this.assertV2ItineraryWriteAccess(actor);
    return this.service.deleteDay(quoteId, dayId, this.toEditActor(actor));
  }

  // CP-N4d: fail-closed gate for the V2 itinerary WRITE handlers. Runs as the FIRST
  // statement on the ORIGINAL AuthenticatedActor (before it is reduced to the service's
  // QuoteItineraryEditActor shape) and therefore before the service's flag / company
  // checks, so denied roles never reach the service or the QUOTE_ITINERARY_EDIT flag.
  // Explicit allowlist membership — never the coalescing @Roles guard.
  private assertV2ItineraryWriteAccess(actor: AuthenticatedActor | null | undefined) {
    const role = actor?.role;
    if (!role || !(V2_ITINERARY_WRITE_ROLES as readonly string[]).includes(role)) {
      throw new ForbiddenException('This V2 itinerary endpoint is restricted to admin, super_admin and operations.');
    }
  }

  private toAddInput(body: AddDayBody): AddDayInput {
    return {
      dayNumber: body?.dayNumber === undefined || body?.dayNumber === null ? null : Number(body.dayNumber),
      title: body?.title ?? null,
      notes: body?.notes ?? null,
      notesLanguage: body?.notesLanguage ?? null,
    };
  }

  private toEditInput(body: EditDayBody): EditDayInput {
    return {
      title: body?.title === undefined ? undefined : body.title,
      notes: body?.notes === undefined ? undefined : body.notes,
      notesLanguage: body?.notesLanguage === undefined ? undefined : body.notesLanguage,
      dayNumber: body?.dayNumber === undefined || body?.dayNumber === null ? undefined : Number(body.dayNumber),
    };
  }

  private toEditActor(actor?: AuthenticatedActor | null): QuoteItineraryEditActor {
    return actor ? { id: actor.id, companyId: actor.companyId ?? null, auditLabel: actor.auditLabel } : null;
  }
}
