import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import {
  CreateQuoteItineraryDayDto,
  CreateQuoteItineraryDayItemDto,
  UpdateQuoteItineraryDayDto,
  UpdateQuoteItineraryDayItemDto,
} from './quote-itinerary.dto';
import { QuoteItineraryService } from './quote-itinerary.service';

type CreateDayBody = {
  dayNumber: number | string;
  title: string;
  notes?: string | null;
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

  private toActor(actor?: AuthenticatedActor | null) {
    return actor ? { id: actor.id, auditLabel: actor.auditLabel } : null;
  }

  private toCompanyActor(actor?: AuthenticatedActor | null) {
    return actor ? { companyId: actor.companyId } : null;
  }
}

