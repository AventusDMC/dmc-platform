import { Body, Controller, Param, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { AddActivityItemInput, QuoteExperiencesV2Service, QuoteItemCreateActor } from './quote-experiences-v2.service';

type AddItemBody = {
  itemType?: string | null;
  dayId?: string | null;
  // Activity fields.
  activityId?: string | null;
  activityRateVariantId?: string | null;
  // Guide fields.
  serviceId?: string | null;
  guideType?: string | null;
  guideDuration?: string | null;
  guideOvernight?: boolean | null;
  serviceDate?: string | null;
  adultCount?: number | string | null;
  childCount?: number | string | null;
  // Slice 2B-1 determinism guard — replayed from the create-preview response.
  previewToken?: unknown;
  acknowledgedDelta?: boolean;
};

// Quote Builder V2 — Phase B, Slice 2/3: add ONE Activity OR Guide item. NEW,
// V2-SCOPED route under /quotes/:quoteId/v2/experiences so it never touches the shared
// Classic item-create endpoint (POST /quotes/:id/items). Gated by the QUOTE_ITEM_CREATE
// flag inside the service (fail-closed) and restricted to admin/operations. The service
// enforces access/company isolation, editable status, day-belongs-to-quote, per-type
// integrity (activity/variant, or guide-service/type/duration), and ACTIVITY+GUIDE-only
// scope; it delegates the actual create + recalculation to the existing
// QuotesService.createItem behind a determinism guard and writes a sanitized audit row.
@Controller('quotes/:quoteId/v2/experiences')
export class QuoteExperiencesV2Controller {
  constructor(private readonly service: QuoteExperiencesV2Service) {}

  // Slice 2B-1: read-only create-preview. Projects the activity's price with NO
  // writes and returns a signed previewToken the client must replay on create.
  // Same flag/role/status gating as create (enforced in the service).
  @Post('item/preview')
  @Roles('admin', 'operations')
  async previewItem(
    @Param('quoteId') quoteId: string,
    @Body() body: AddItemBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.previewActivityItem(quoteId, this.toInput(body), this.toActor(actor));
  }

  @Post('item')
  @Roles('admin', 'operations')
  async addItem(
    @Param('quoteId') quoteId: string,
    @Body() body: AddItemBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.addActivityItem(quoteId, this.toInput(body), this.toActor(actor), {
      previewToken: body?.previewToken,
      acknowledgedDelta: body?.acknowledgedDelta === true,
    });
  }

  private toInput(body: AddItemBody): AddActivityItemInput {
    const toNum = (v: number | string | null | undefined) =>
      v === undefined || v === null || v === '' ? undefined : Number(v);
    return {
      itemType: body?.itemType ?? null,
      dayId: body?.dayId ?? null,
      activityId: body?.activityId ?? null,
      activityRateVariantId: body?.activityRateVariantId ?? null,
      serviceId: body?.serviceId ?? null,
      guideType: body?.guideType ?? null,
      guideDuration: body?.guideDuration ?? null,
      guideOvernight: body?.guideOvernight === true,
      serviceDate: body?.serviceDate ?? null,
      adultCount: toNum(body?.adultCount),
      childCount: toNum(body?.childCount),
    };
  }

  private toActor(actor?: AuthenticatedActor | null): QuoteItemCreateActor {
    // Slice 2C: carry the role through so the service can redact cost/margin from
    // preview/create responses for non-finance roles. auditLabel/companyId/id kept
    // exactly as before (the audit actor shape is unchanged).
    return actor
      ? { id: actor.id, companyId: actor.companyId ?? null, auditLabel: actor.auditLabel, role: actor.role ?? null }
      : null;
  }
}
