import { Body, Controller, Param, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { AddItemInput, QuoteExperiencesV2Service, QuoteItemCreateActor } from './quote-experiences-v2.service';

type AddItemBody = {
  itemType?: string | null;
  dayId?: string | null;
  serviceDate?: string | null;
  // Activity
  activityId?: string | null;
  activityRateVariantId?: string | null;
  adultCount?: number | string | null;
  childCount?: number | string | null;
  // Guide
  serviceId?: string | null;
  guideType?: string | null;
  guideDuration?: string | null;
  overnight?: boolean | string | null;
  guideLanguage?: string | null;
};

// Quote Builder V2 — Phase B item-create. NEW, V2-SCOPED route under
// /quotes/:quoteId/v2/experiences so it never touches the shared Classic item-create
// endpoint (POST /quotes/:id/items). Gated by the QUOTE_ITEM_CREATE flag inside the
// service (fail-closed) and restricted to admin/operations. Supports ACTIVITY
// (Slice 2) and GUIDE (Slice 3); anything else is out_of_scope. The service enforces
// access/company isolation, editable status, day-belongs-to-quote, and per-type
// integrity, delegates the actual create + recalculation to QuotesService.createItem,
// and writes a sanitized audit row.
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
    return this.service.addItem(quoteId, this.toInput(body), this.toActor(actor));
  }

  private toInput(body: AddItemBody): AddItemInput {
    const toNum = (v: number | string | null | undefined) =>
      v === undefined || v === null || v === '' ? undefined : Number(v);
    return {
      itemType: body?.itemType ?? null,
      dayId: body?.dayId ?? null,
      serviceDate: body?.serviceDate ?? null,
      // Activity
      activityId: body?.activityId ?? null,
      activityRateVariantId: body?.activityRateVariantId ?? null,
      adultCount: toNum(body?.adultCount),
      childCount: toNum(body?.childCount),
      // Guide
      serviceId: body?.serviceId ?? null,
      guideType: body?.guideType ?? null,
      guideDuration: body?.guideDuration ?? null,
      overnight: body?.overnight === undefined || body?.overnight === null ? null : Boolean(body.overnight === true || body.overnight === 'true'),
      guideLanguage: body?.guideLanguage ?? null,
    };
  }

  private toActor(actor?: AuthenticatedActor | null): QuoteItemCreateActor {
    return actor ? { id: actor.id, companyId: actor.companyId ?? null, auditLabel: actor.auditLabel } : null;
  }
}
