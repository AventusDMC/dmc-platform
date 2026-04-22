import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { HotelMealPlan } from '@prisma/client';
import { PromotionsService } from './promotions.service';

type PromotionTypeValue = 'PERCENTAGE_DISCOUNT' | 'FIXED_DISCOUNT' | 'STAY_PAY' | 'FREE_NIGHT';
type PromotionCombinabilityModeValue = 'EXCLUSIVE' | 'COMBINABLE' | 'BEST_OF_GROUP';

type PromotionRuleBody = {
  roomCategoryId?: string;
  travelDateFrom?: string;
  travelDateTo?: string;
  bookingDateFrom?: string;
  bookingDateTo?: string;
  boardBasis?: HotelMealPlan;
  minStay?: number | string;
  isActive?: boolean;
};

type CreatePromotionBody = {
  hotelContractId: string;
  name: string;
  type: PromotionTypeValue;
  value?: number | string;
  stayPayNights?: number | string;
  payNights?: number | string;
  freeNightCount?: number | string;
  isActive?: boolean;
  priority?: number | string;
  combinabilityMode?: PromotionCombinabilityModeValue;
  promotionGroup?: string;
  combinable?: boolean;
  notes?: string;
  rules?: PromotionRuleBody[];
};

type EvaluatePromotionQuery = {
  hotelContractId: string;
  travelDate?: string;
  bookingDate?: string;
  roomCategoryId?: string;
  boardBasis?: string;
  stayNights?: string;
  baseCost: string;
  baseSell: string;
  currency?: string;
};

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  findAll() {
    return this.promotionsService.findAll();
  }

  @Get('evaluate')
  evaluate(@Query() query: EvaluatePromotionQuery) {
    return this.promotionsService.evaluate({
      hotelContractId: query.hotelContractId,
      travelDate: query.travelDate ? new Date(query.travelDate) : undefined,
      bookingDate: query.bookingDate ? new Date(query.bookingDate) : undefined,
      roomCategoryId: query.roomCategoryId || undefined,
      boardBasis: query.boardBasis || undefined,
      stayNights: query.stayNights === undefined ? undefined : Number(query.stayNights),
      baseCost: Number(query.baseCost),
      baseSell: Number(query.baseSell),
      currency: query.currency || undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(id);
  }

  @Post()
  create(@Body() body: CreatePromotionBody) {
    return this.promotionsService.create(this.toPromotionPayload(body) as any);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<CreatePromotionBody>) {
    return this.promotionsService.update(id, this.toPromotionPayload(body) as any);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(id);
  }

  private toPromotionPayload(body: Partial<CreatePromotionBody>) {
    return {
      hotelContractId: body.hotelContractId,
      name: body.name,
      type: body.type,
      value: body.value === undefined ? undefined : Number(body.value),
      stayPayNights: body.stayPayNights === undefined ? undefined : Number(body.stayPayNights),
      payNights: body.payNights === undefined ? undefined : Number(body.payNights),
      freeNightCount: body.freeNightCount === undefined ? undefined : Number(body.freeNightCount),
      isActive: body.isActive,
      priority: body.priority === undefined ? undefined : Number(body.priority),
      combinabilityMode: body.combinabilityMode,
      promotionGroup: body.promotionGroup,
      combinable: body.combinable,
      notes: body.notes,
      rules: body.rules?.map((rule) => ({
        roomCategoryId: rule.roomCategoryId || undefined,
        travelDateFrom: rule.travelDateFrom ? new Date(rule.travelDateFrom) : undefined,
        travelDateTo: rule.travelDateTo ? new Date(rule.travelDateTo) : undefined,
        bookingDateFrom: rule.bookingDateFrom ? new Date(rule.bookingDateFrom) : undefined,
        bookingDateTo: rule.bookingDateTo ? new Date(rule.bookingDateTo) : undefined,
        boardBasis: rule.boardBasis || undefined,
        minStay: rule.minStay === undefined ? undefined : Number(rule.minStay),
        isActive: rule.isActive,
      })),
    };
  }
}
