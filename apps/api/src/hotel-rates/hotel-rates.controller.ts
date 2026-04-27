import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { HotelMealPlan, HotelOccupancyType, HotelRatePricingBasis } from '@prisma/client';
import { Public } from '../auth/auth.decorators';
import { HotelRatesService } from './hotel-rates.service';

type TourismFeeMode = 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM';
type HotelRatePricingMode = 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT';

type CreateHotelRateBody = {
  contractId: string;
  seasonId?: string;
  seasonName: string;
  seasonFrom?: string | null;
  seasonTo?: string | null;
  roomCategoryId: string;
  occupancyType: HotelOccupancyType;
  mealPlan: HotelMealPlan;
  pricingMode?: HotelRatePricingMode | null;
  pricingBasis?: HotelRatePricingBasis | string | null;
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

  @Public()
  @Get('lookup')
  lookup(
    @Query('hotelId') hotelId: string,
    @Query('contractId') contractId: string | undefined,
    @Query('date') date: string,
    @Query('occupancy') occupancy: HotelOccupancyType,
    @Query('mealPlan') mealPlan: HotelMealPlan,
    @Query('roomCategoryId') roomCategoryId?: string,
    @Query('pax') pax?: string,
  ) {
    return this.hotelRatesService.lookup({
      hotelId,
      contractId: contractId || null,
      date,
      occupancy,
      mealPlan,
      roomCategoryId: roomCategoryId || null,
      pax: pax === undefined ? null : Number(pax),
    });
  }

  @Public()
  @Get('calculate-hotel-cost')
  calculateHotelCost(
    @Query('hotelId') hotelId: string,
    @Query('contractId') contractId: string | undefined,
    @Query('checkInDate') checkInDate: string,
    @Query('checkOutDate') checkOutDate: string,
    @Query('occupancy') occupancy: HotelOccupancyType,
    @Query('mealPlan') mealPlan: HotelMealPlan,
    @Query('pax') pax: string,
    @Query('roomCount') roomCount?: string,
    @Query('roomCategoryId') roomCategoryId?: string,
    @Query('adults') adults?: string,
    @Query('childrenAges') childrenAges?: string | string[],
    @Query('selectedSupplementIds') selectedSupplementIds?: string | string[],
  ) {
    return this.hotelRatesService.calculateHotelCost({
      hotelId,
      contractId: contractId || null,
      checkInDate,
      checkOutDate,
      occupancy,
      mealPlan,
      pax: Number(pax),
      roomCount: roomCount === undefined ? null : Number(roomCount),
      adults: adults === undefined ? null : Number(adults),
      childrenAges: this.parseChildrenAges(childrenAges),
      roomCategoryId: roomCategoryId || null,
      selectedSupplementIds: this.parseStringList(selectedSupplementIds),
    });
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
      seasonFrom: body.seasonFrom ? new Date(body.seasonFrom) : body.seasonFrom === null ? null : undefined,
      seasonTo: body.seasonTo ? new Date(body.seasonTo) : body.seasonTo === null ? null : undefined,
      roomCategoryId: body.roomCategoryId,
      occupancyType: body.occupancyType,
      mealPlan: body.mealPlan,
      pricingMode: body.pricingMode ?? null,
      pricingBasis: body.pricingBasis ?? null,
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
      seasonFrom: body.seasonFrom ? new Date(body.seasonFrom) : body.seasonFrom === null ? null : undefined,
      seasonTo: body.seasonTo ? new Date(body.seasonTo) : body.seasonTo === null ? null : undefined,
      roomCategoryId: body.roomCategoryId,
      occupancyType: body.occupancyType,
      mealPlan: body.mealPlan,
      pricingMode: body.pricingMode === undefined ? undefined : body.pricingMode ?? null,
      pricingBasis: body.pricingBasis === undefined ? undefined : body.pricingBasis ?? null,
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

  private parseChildrenAges(value: string | string[] | undefined) {
    if (value === undefined) {
      return [];
    }

    const parts = Array.isArray(value) ? value : value.split(',');
    return parts.map((age) => Number(age)).filter((age) => Number.isFinite(age) && age >= 0);
  }

  private parseStringList(value: string | string[] | undefined) {
    if (value === undefined) {
      return [];
    }

    const parts = Array.isArray(value) ? value : value.split(',');
    return parts.map((part) => part.trim()).filter(Boolean);
  }
}
