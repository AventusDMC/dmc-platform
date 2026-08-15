import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import {
  AddActivityItemInput,
  EditExternalPackageInput,
  QuoteExperiencesV2Service,
  QuoteItemCreateActor,
} from './quote-experiences-v2.service';

type AddItemBody = {
  itemType?: string | null;
  dayId?: string | null;
  // Activity fields.
  activityId?: string | null;
  activityRateVariantId?: string | null;
  // Guide fields. serviceId is shared with Meal (both reference a SupplierService).
  serviceId?: string | null;
  guideType?: string | null;
  guideDuration?: string | null;
  guideOvernight?: boolean | null;
  // Meal fields (itemType='meal'). customServiceName is the meal name (required);
  // unitCost/currency are a FINANCE-ONLY cost override (rejected for other roles).
  customServiceName?: string | null;
  unitCost?: number | string | null;
  currency?: string | null;
  // Entrance fields (itemType='entrance'). serviceId (shared) is an ENTRANCE service
  // with a linked EntranceFee; ticketRateVariantId is OPTIONAL (base-fee fallback).
  // entranceFeeId / Jordan Pass values are NEVER accepted from the client — computed.
  ticketRateVariantId?: string | null;
  // External-package fields (itemType='external_package'). ONE-OFF / SERVICE-LESS
  // (no serviceId). netCost/currency are the manual price (FINANCE-ONLY item); country
  // + clientDescription required; the rest optional. No matrix/supplement/sell override.
  netCost?: number | string | null;
  country?: string | null;
  clientDescription?: string | null;
  packageName?: string | null;
  pricingBasis?: string | null;
  includes?: string | null;
  excludes?: string | null;
  hotelsOrSimilar?: string | null;
  internalNotes?: string | null;
  serviceDate?: string | null;
  adultCount?: number | string | null;
  childCount?: number | string | null;
  // Slice 2B-1 determinism guard — replayed from the create-preview response.
  previewToken?: unknown;
  acknowledgedDelta?: boolean;
};

// E-a: external-package EDIT body. Only netCost + pricingBasis are read (see toEditInput);
// previewToken + acknowledgedDelta drive the guarded apply. Any other property is ignored.
type EditExternalPackageBody = {
  netCost?: number | string | null;
  pricingBasis?: string | null;
  previewToken?: unknown;
  acknowledgedDelta?: boolean;
};

// Quote Builder V2 — Phase B: add ONE item (Activity/Guide/Meal/Entrance/External
// Package). NEW, V2-SCOPED route under /quotes/:quoteId/v2/experiences so it never
// touches the shared Classic item-create endpoint (POST /quotes/:id/items). Gated by the
// QUOTE_ITEM_CREATE flag inside the service (fail-closed). The route admits admin/
// operations/finance (plus super_admin/agent_admin via RolesGuard coalescing); finance
// is required because external_package create is finance-only and is additionally gated
// at the SERVICE level (cost-visible roles only — operations/agent_admin fail closed with
// external_package_finance_only). The service enforces access/company isolation, editable
// status, day-belongs-to-quote, per-type integrity, and ACTIVITY+GUIDE+MEAL+ENTRANCE+
// EXTERNAL_PACKAGE scope; it delegates the actual create + recalculation to the existing
// QuotesService.createItem behind a determinism guard and writes a sanitized audit row.
@Controller('quotes/:quoteId/v2/experiences')
export class QuoteExperiencesV2Controller {
  constructor(private readonly service: QuoteExperiencesV2Service) {}

  // Slice 2B-1: read-only create-preview. Projects the activity's price with NO
  // writes and returns a signed previewToken the client must replay on create.
  // Same flag/role/status gating as create (enforced in the service).
  @Post('item/preview')
  @Roles('admin', 'operations', 'finance')
  async previewItem(
    @Param('quoteId') quoteId: string,
    @Body() body: AddItemBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.previewActivityItem(quoteId, this.toInput(body), this.toActor(actor));
  }

  @Post('item')
  @Roles('admin', 'operations', 'finance')
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

  // D-a: remove-preview — projects post-remove totals with NO writes and returns an
  // opaque v2-item-delete token. Same flag/role/company/status gating as the delete
  // (enforced in the service). Selling total/delta always visible; cost redacted for
  // non-finance roles.
  @Post('item/:itemId/remove/preview')
  @Roles('admin', 'operations', 'finance')
  async removeItemPreview(
    @Param('quoteId') quoteId: string,
    @Param('itemId') itemId: string,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.previewRemoveItem(quoteId, itemId, this.toActor(actor));
  }

  // D-a: guarded DELETE — replays the opaque remove-preview token (body), fails closed
  // on staleness, then delegates to the UNCHANGED, deterministic removeItem. Delete
  // exposes no cost, so there is NO extra external-package finance-only gate here.
  @Delete('item/:itemId')
  @Roles('admin', 'operations', 'finance')
  async removeItem(
    @Param('quoteId') quoteId: string,
    @Param('itemId') itemId: string,
    @Body() body: { previewToken?: unknown } | null,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.removeExperienceItem(quoteId, itemId, this.toActor(actor), {
      previewToken: body?.previewToken,
    });
  }

  // E-a: external-package EDIT preview — projects the repriced item + quote totals with
  // NO writes and returns an opaque `v2e` edit token. Gated by QUOTE_EXTERNAL_PACKAGE_EDIT
  // (OFF by default) and finance-only, both enforced in the service. `finance` is on the
  // @Roles allowlist because the edit is finance-only; agent_admin/operations that
  // RolesGuard may coalesce onto the route fail closed at the service.
  @Post('item/:itemId/edit/preview')
  @Roles('admin', 'finance')
  async editExternalPackagePreview(
    @Param('quoteId') quoteId: string,
    @Param('itemId') itemId: string,
    @Body() body: EditExternalPackageBody | null,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.previewExternalPackageEdit(quoteId, itemId, this.toEditInput(body), this.toActor(actor));
  }

  // E-a: guarded external-package EDIT apply — replays the opaque `v2e` edit token (body),
  // fails closed on staleness, requires a selling-delta acknowledgement, then delegates to
  // the UNCHANGED updateItem with a server-built {netCost, pricingBasis} patch. Never
  // touches the pricing-apply flow.
  @Post('item/:itemId/edit')
  @Roles('admin', 'finance')
  async editExternalPackage(
    @Param('quoteId') quoteId: string,
    @Param('itemId') itemId: string,
    @Body() body: EditExternalPackageBody | null,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.service.applyExternalPackageEdit(quoteId, itemId, this.toEditInput(body), this.toActor(actor), {
      previewToken: body?.previewToken,
      acknowledgedDelta: body?.acknowledgedDelta === true,
    });
  }

  // Strict allowlist projection: ONLY netCost + pricingBasis reach the service. Every other
  // property on the body (currency, markup, sell/override, packageName, …) is dropped here
  // and never forwarded — the immutable fields cannot be edited through this route.
  private toEditInput(body: EditExternalPackageBody | null): EditExternalPackageInput {
    const netCost =
      body?.netCost === undefined || body?.netCost === null || String(body?.netCost).trim() === ''
        ? undefined
        : Number(body.netCost);
    const pricingBasis = (body?.pricingBasis ?? '').toString().trim() || undefined;
    return { netCost, pricingBasis };
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
      customServiceName: body?.customServiceName ?? null,
      // Blank/absent → undefined so "no override supplied" is distinguishable from
      // an explicit value (the service's cost-override guard keys on this).
      unitCost: toNum(body?.unitCost),
      currency: (body?.currency ?? '').trim() || undefined,
      // Blank/absent → null so the entrance base-fee fallback path is taken.
      ticketRateVariantId: (body?.ticketRateVariantId ?? '').trim() || null,
      // External-package fields. Blank/absent → undefined (netCost) / null (text) so the
      // service's required-field guard can distinguish "not supplied". serviceId is NOT
      // accepted for external packages (one-off / service-less).
      netCost: toNum(body?.netCost),
      country: (body?.country ?? '').trim() || null,
      clientDescription: (body?.clientDescription ?? '').trim() || null,
      packageName: (body?.packageName ?? '').trim() || null,
      pricingBasis: (body?.pricingBasis ?? '').trim() || null,
      includes: (body?.includes ?? '').trim() || null,
      excludes: (body?.excludes ?? '').trim() || null,
      hotelsOrSimilar: (body?.hotelsOrSimilar ?? '').trim() || null,
      internalNotes: (body?.internalNotes ?? '').trim() || null,
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
