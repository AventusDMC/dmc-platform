import { Body, Controller, Param, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { AddActivityItemInput, QuoteExperiencesV2Service, QuoteItemCreateActor } from './quote-experiences-v2.service';

type AddItemBody = {
  itemType?: string | null;
  dayId?: string | null;
  activityId?: string | null;
  activityRateVariantId?: string | null;
  serviceDate?: string | null;
  adultCount?: number | string | null;
  childCount?: number | string | null;
};

// Quote Builder V2 — Phase B, Slice 2: add ONE Activity item. NEW, V2-SCOPED route
// under /quotes/:quoteId/v2/experiences so it never touches the shared Classic
// item-create endpoint (POST /quotes/:id/items). Gated by the QUOTE_ITEM_CREATE flag
// inside the service (fail-closed) and restricted to admin/operations. The service
// enforces access/company isolation, editable status, day-belongs-to-quote,
// activity/variant integrity, and ACTIVITY-only scope; it delegates the actual
// create + recalculation to the existing QuotesService.createItem and writes a
// sanitized audit row.
@Controller('quotes/:quoteId/v2/experiences')
export class QuoteExperiencesV2Controller {
  constructor(private readonly service: QuoteExperiencesV2Service) {}

  @Post('item')
  @Roles('admin', 'operations')
  async addItem(
    @Param('quoteId') quoteId: string,
    @Body() body: AddItemBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.addActivityItem(quoteId, this.toInput(body), this.toActor(actor));
  }

  private toInput(body: AddItemBody): AddActivityItemInput {
    const toNum = (v: number | string | null | undefined) =>
      v === undefined || v === null || v === '' ? undefined : Number(v);
    return {
      itemType: body?.itemType ?? null,
      dayId: body?.dayId ?? null,
      activityId: body?.activityId ?? null,
      activityRateVariantId: body?.activityRateVariantId ?? null,
      serviceDate: body?.serviceDate ?? null,
      adultCount: toNum(body?.adultCount),
      childCount: toNum(body?.childCount),
    };
  }

  private toActor(actor?: AuthenticatedActor | null): QuoteItemCreateActor {
    return actor ? { id: actor.id, companyId: actor.companyId ?? null, auditLabel: actor.auditLabel } : null;
  }
}
