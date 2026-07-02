import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import {
  AddDayInput,
  EditDayInput,
  QuoteItineraryEditActor,
  QuoteItineraryV2Service,
} from './quote-itinerary-v2.service';

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
  @Roles('admin', 'operations')
  async addDay(
    @Param('quoteId') quoteId: string,
    @Body() body: AddDayBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.addDay(quoteId, this.toAddInput(body), this.toEditActor(actor));
  }

  @Patch('day/:dayId')
  @Roles('admin', 'operations')
  async editDay(
    @Param('quoteId') quoteId: string,
    @Param('dayId') dayId: string,
    @Body() body: EditDayBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.editDay(quoteId, dayId, this.toEditInput(body), this.toEditActor(actor));
  }

  @Delete('day/:dayId')
  @Roles('admin', 'operations')
  async deleteDay(
    @Param('quoteId') quoteId: string,
    @Param('dayId') dayId: string,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.deleteDay(quoteId, dayId, this.toEditActor(actor));
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
