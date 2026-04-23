import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { HotelMealPlan, HotelOccupancyType } from '@prisma/client';
import { HotelRatesService } from './hotel-rates.service';

type TourismFeeMode = 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM';
type HotelRatePricingMode = 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT';

type CreateHotelRateBody = {
  contractId: string;
  seasonId?: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: HotelOccupancyType;
  mealPlan: HotelMealPlan;
  pricingMode?: HotelRatePricingMode | null;
  currency: string;
  cost: number;
  costBaseAmount?: number;
  costCurrency?: string;
  salesTaxPercent?: number;
  salesTaxIncluded?: boolean;
  serviceChargePercent?: number;
  serviceChargeIncluded?: boolean;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: TourismFeeMode | null;
};

type UpdateHotelRateBody = Partial<CreateHotelRateBody>;

@Controller('hotel-rates')
export class HotelRatesController {
  constructor(private readonly hotelRatesService: HotelRatesService) {}

  @Get()
  findAll() {
    return this.hotelRatesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hotelRatesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateHotelRateBody) {
    return this.hotelRatesService.create({
      contractId: body.contractId,
      seasonId: body.seasonId || undefined,
      seasonName: body.seasonName,
      roomCategoryId: body.roomCategoryId,
      occupancyType: body.occupancyType,
      mealPlan: body.mealPlan,
      pricingMode: body.pricingMode ?? null,
      currency: body.currency,
      cost: Number(body.cost),
      costBaseAmount: body.costBaseAmount === undefined ? undefined : Number(body.costBaseAmount),
      costCurrency: body.costCurrency,
      salesTaxPercent: body.salesTaxPercent === undefined ? undefined : Number(body.salesTaxPercent),
      salesTaxIncluded: body.salesTaxIncluded,
      serviceChargePercent: body.serviceChargePercent === undefined ? undefined : Number(body.serviceChargePercent),
      serviceChargeIncluded: body.serviceChargeIncluded,
      tourismFeeAmount: body.tourismFeeAmount === undefined || body.tourismFeeAmount === null ? body.tourismFeeAmount : Number(body.tourismFeeAmount),
      tourismFeeCurrency: body.tourismFeeCurrency,
      tourismFeeMode: body.tourismFeeMode,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateHotelRateBody) {
    return this.hotelRatesService.update(id, {
      contractId: body.contractId,
      seasonId: body.seasonId || undefined,
      seasonName: body.seasonName,
      roomCategoryId: body.roomCategoryId,
      occupancyType: body.occupancyType,
      mealPlan: body.mealPlan,
      pricingMode: body.pricingMode === undefined ? undefined : body.pricingMode ?? null,
      currency: body.currency,
      cost: body.cost === undefined ? undefined : Number(body.cost),
      costBaseAmount: body.costBaseAmount === undefined ? undefined : Number(body.costBaseAmount),
      costCurrency: body.costCurrency,
      salesTaxPercent: body.salesTaxPercent === undefined ? undefined : Number(body.salesTaxPercent),
      salesTaxIncluded: body.salesTaxIncluded,
      serviceChargePercent: body.serviceChargePercent === undefined ? undefined : Number(body.serviceChargePercent),
      serviceChargeIncluded: body.serviceChargeIncluded,
      tourismFeeAmount:
        body.tourismFeeAmount === undefined || body.tourismFeeAmount === null ? body.tourismFeeAmount : Number(body.tourismFeeAmount),
      tourismFeeCurrency: body.tourismFeeCurrency,
      tourismFeeMode: body.tourismFeeMode,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.hotelRatesService.remove(id);
  }
}
