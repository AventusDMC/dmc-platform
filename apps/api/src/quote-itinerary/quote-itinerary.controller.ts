import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import {
  CreateQuoteItineraryDayDto,
  CreateQuoteItineraryDayItemDto,
  SetQuoteItineraryDayPoisDto,
  UpdateQuoteItineraryDayDto,
  UpdateQuoteItineraryDayItemDto,
} from './quote-itinerary.dto';
import { QuoteItineraryService } from './quote-itinerary.service';

type CreateDayBody = {
  dayNumber: number | string;
  title: string;
  notes?: string | null;
  country?: string | null;
  sortOrder?: number | string;
  isActive?: boolean;
};

type UpdateDayBody = Partial<CreateDayBody>;

type CreateDayItemBody = {
  quoteServiceId: string;
  sortOrder?: number | string;
  notes?: string | null;
  isActive?: boolean;
};

type UpdateDayItemBody = Partial<CreateDayItemBody>;

type DayPoiAssignmentBody = {
  poiId?: string | null;
  sourceTouringRouteStopId?: string | null;
  fallbackTitle?: string | null;
  fallbackCity?: string | null;
};

type SetDayPoisBody = {
  assignments?: DayPoiAssignmentBody[];
};

// Phase R.1b — tailor-made draft input (mirrors TailorMadeDraftInput). The
// generator sanitizes/defaults every field, so the body is intentionally loose.
type TailorMadeDraftBody = {
  durationDays?: number | string;
  arrivalCity?: string;
  arrivalAirport?: string;
  departureCity?: string;
  departureAirport?: string;
  pax?: number | string;
  hotelCategory?: string;
  travelStyle?: string;
  requiredPlaces?: string[];
  optionalPlaces?: string[];
  guideType?: string;
  currency?: string;
  /** APPLY only — replace the existing itinerary-day structure (never items/pricing). */
  replaceExisting?: boolean;
};

// Phase R.6A-0 — body for the read-only hotel-stay price preview.
type HotelStayOptionsBody = {
  hotelId?: string;
  contractId?: string;
  stay?: { city?: string; startDay?: number; endDay?: number; nights?: number; firstItineraryDayId?: string };
  roomCategoryId?: string;
  occupancyType?: string;
  mealPlan?: string;
  roomCount?: number;
  paxCount?: number;
  serviceDate?: string;
};

@Controller()
export class QuoteItineraryController {
  constructor(private readonly quoteItineraryService: QuoteItineraryService) {}

  @Get('quotes/:quoteId/itinerary')
  async findByQuoteId(@Param('quoteId') quoteId: string, @Actor() actor: AuthenticatedActor | null) {
    return this.quoteItineraryService.findByQuoteId(quoteId, this.toCompanyActor(actor));
  }

  @Post('quotes/:quoteId/itinerary/day')
  @Roles('admin', 'viewer', 'finance')
  async createDay(@Param('quoteId') quoteId: string, @Body() body: CreateDayBody, @Actor() actor: AuthenticatedActor | null) {
    return this.quoteItineraryService.createDay(quoteId, this.toCreateDayDto(body), this.toActor(actor));
  }

  @Patch('itinerary/day/:dayId')
  @Roles('admin', 'viewer', 'finance')
  async updateDay(@Param('dayId') dayId: string, @Body() body: UpdateDayBody, @Actor() actor: AuthenticatedActor | null) {
    return this.quoteItineraryService.updateDay(dayId, this.toUpdateDayDto(body), this.toActor(actor));
  }

  // Phase R.1b — generate a tailor-made draft itinerary (read-only; no writes).
  @Post('quotes/:quoteId/tailor-made-draft/preview')
  @Roles('admin', 'viewer', 'finance')
  async previewTailorMadeDraft(
    @Param('quoteId') quoteId: string,
    @Body() body: TailorMadeDraftBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.quoteItineraryService.previewTailorMadeDraft(quoteId, this.toDraftInput(body), this.toCompanyActor(actor));
  }

  // Phase R.2 — read-only hotel-stay suggestions grouped by overnight city
  // (no writes, no QuoteItems, no pricing).
  @Post('quotes/:quoteId/tailor-made-draft/hotel-suggestions')
  @Roles('admin', 'viewer', 'finance')
  async suggestTailorMadeHotels(
    @Param('quoteId') quoteId: string,
    @Body() body: TailorMadeDraftBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.quoteItineraryService.suggestTailorMadeHotels(
      quoteId,
      { hotelCategory: body?.hotelCategory, currency: body?.currency },
      this.toCompanyActor(actor),
    );
  }

  // Phase R.3 — read-only transport suggestions per itinerary day
  // (no writes, no QuoteItems, no pricing, no route/rate lookup).
  @Post('quotes/:quoteId/tailor-made-draft/transport-suggestions')
  @Roles('admin', 'viewer', 'finance')
  async suggestTailorMadeTransport(@Param('quoteId') quoteId: string, @Actor() actor: AuthenticatedActor | null) {
    return this.quoteItineraryService.suggestTailorMadeTransport(quoteId, this.toCompanyActor(actor));
  }

  // Phase R.4 — read-only entrance/ticket/activity suggestions per itinerary day
  // (no writes, no QuoteItems, no pricing; best-effort master match only).
  @Post('quotes/:quoteId/tailor-made-draft/experience-suggestions')
  @Roles('admin', 'viewer', 'finance')
  async suggestTailorMadeExperiences(@Param('quoteId') quoteId: string, @Actor() actor: AuthenticatedActor | null) {
    return this.quoteItineraryService.suggestTailorMadeExperiences(quoteId, this.toCompanyActor(actor));
  }

  // Phase R.5 — read-only guide suggestions per itinerary day (no writes, no
  // QuoteItems, no pricing, no guide master/rate lookup).
  @Post('quotes/:quoteId/tailor-made-draft/guide-suggestions')
  @Roles('admin', 'viewer', 'finance')
  async suggestTailorMadeGuides(@Param('quoteId') quoteId: string, @Actor() actor: AuthenticatedActor | null) {
    return this.quoteItineraryService.suggestTailorMadeGuides(quoteId, this.toCompanyActor(actor));
  }

  // Phase R.6A-0 — READ-ONLY hotel-stay configure + price preview. No QuoteItem,
  // no pricing write, no quote-total change. Returns room/meal/occupancy options
  // + an estimated cost/sell at the standard hotel markup; canApply:false.
  @Post('quotes/:quoteId/tailor-made-draft/hotel-stay-options')
  @Roles('admin', 'viewer', 'finance')
  async previewTailorMadeHotelStay(
    @Param('quoteId') quoteId: string,
    @Body() body: HotelStayOptionsBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.quoteItineraryService.previewTailorMadeHotelStay(quoteId, body || {}, this.toCompanyActor(actor));
  }

  // Phase R.1b — persist the tailor-made draft as editable QuoteItineraryDay
  // rows (no QuoteItems / pricing). Conflicts unless replaceExisting:true.
  @Post('quotes/:quoteId/tailor-made-draft/apply')
  @Roles('admin', 'viewer', 'finance')
  async applyTailorMadeDraft(
    @Param('quoteId') quoteId: string,
    @Body() body: TailorMadeDraftBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.quoteItineraryService.applyTailorMadeDraft(
      quoteId,
      this.toDraftInput(body),
      { replaceExisting: body?.replaceExisting === true },
      this.toActor(actor),
      this.toCompanyActor(actor),
    );
  }

  @Delete('itinerary/day/:dayId')
  @Roles('admin', 'viewer', 'finance')
  async removeDay(@Param('dayId') dayId: string, @Actor() actor: AuthenticatedActor | null) {
    return this.quoteItineraryService.removeDay(dayId, this.toActor(actor));
  }

  @Post('itinerary/day/:dayId/items')
  @Roles('admin', 'viewer', 'finance')
  async createDayItem(
    @Param('dayId') dayId: string,
    @Body() body: CreateDayItemBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.quoteItineraryService.createDayItem(dayId, this.toCreateDayItemDto(body), this.toActor(actor));
  }

  @Patch('itinerary/day/:dayId/items/:itemId')
  @Roles('admin', 'viewer', 'finance')
  async updateDayItem(
    @Param('dayId') dayId: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateDayItemBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.quoteItineraryService.updateDayItem(dayId, itemId, this.toUpdateDayItemDto(body), this.toActor(actor));
  }

  @Delete('itinerary/day/:dayId/items/:itemId')
  @Roles('admin', 'viewer', 'finance')
  async removeDayItem(
    @Param('dayId') dayId: string,
    @Param('itemId') itemId: string,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.quoteItineraryService.removeDayItem(dayId, itemId, this.toActor(actor));
  }

  // Phase 3B.1 — ordered Point-of-Interest assignments for a day.
  @Get('itinerary/day/:dayId/pois')
  async listDayPois(@Param('dayId') dayId: string) {
    return this.quoteItineraryService.listDayPois(dayId);
  }

  @Put('itinerary/day/:dayId/pois')
  @Roles('admin', 'viewer', 'finance')
  async setDayPois(
    @Param('dayId') dayId: string,
    @Body() body: SetDayPoisBody,
    @Actor() actor: AuthenticatedActor | null,
  ) {
    return this.quoteItineraryService.setDayPois(dayId, this.toSetDayPoisDto(body), this.toActor(actor));
  }

  private toCreateDayDto(body: CreateDayBody): CreateQuoteItineraryDayDto {
    return {
      dayNumber: Number(body.dayNumber),
      title: body.title,
      notes: body.notes,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      isActive: body.isActive,
    };
  }

  private toUpdateDayDto(body: UpdateDayBody): UpdateQuoteItineraryDayDto {
    return {
      dayNumber: body.dayNumber === undefined ? undefined : Number(body.dayNumber),
      title: body.title,
      notes: body.notes,
      country: body.country,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      isActive: body.isActive,
    };
  }

  private toCreateDayItemDto(body: CreateDayItemBody): CreateQuoteItineraryDayItemDto {
    return {
      quoteServiceId: body.quoteServiceId,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      notes: body.notes,
      isActive: body.isActive,
    };
  }

  private toUpdateDayItemDto(body: UpdateDayItemBody): UpdateQuoteItineraryDayItemDto {
    return {
      quoteServiceId: body.quoteServiceId,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      notes: body.notes,
      isActive: body.isActive,
    };
  }

  private toSetDayPoisDto(body: SetDayPoisBody): SetQuoteItineraryDayPoisDto {
    const assignments = Array.isArray(body?.assignments) ? body.assignments : [];
    return {
      assignments: assignments.map((entry) => ({
        poiId: entry?.poiId ?? null,
        sourceTouringRouteStopId: entry?.sourceTouringRouteStopId ?? null,
        fallbackTitle: entry?.fallbackTitle ?? null,
        fallbackCity: entry?.fallbackCity ?? null,
      })),
    };
  }

  private toDraftInput(body: TailorMadeDraftBody) {
    return {
      durationDays: body?.durationDays === undefined ? undefined : Number(body.durationDays),
      arrivalCity: body?.arrivalCity,
      arrivalAirport: body?.arrivalAirport,
      departureCity: body?.departureCity,
      departureAirport: body?.departureAirport,
      pax: body?.pax === undefined ? undefined : Number(body.pax),
      hotelCategory: body?.hotelCategory,
      travelStyle: body?.travelStyle as any,
      requiredPlaces: Array.isArray(body?.requiredPlaces) ? body.requiredPlaces : undefined,
      optionalPlaces: Array.isArray(body?.optionalPlaces) ? body.optionalPlaces : undefined,
      guideType: body?.guideType,
      currency: body?.currency,
    };
  }

  private toActor(actor?: AuthenticatedActor | null) {
    return actor ? { id: actor.id, auditLabel: actor.auditLabel } : null;
  }

  private toCompanyActor(actor?: AuthenticatedActor | null) {
    return actor ? { companyId: actor.companyId } : null;
  }
}

