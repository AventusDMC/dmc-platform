import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { HotelMealPlan, HotelOccupancyType } from '@prisma/client';
import { HotelRatesService } from './hotel-rates.service';

type CreateHotelRateBody = {
  contractId: string;
  seasonId?: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: HotelOccupancyType;
  mealPlan: HotelMealPlan;
  currency: string;
  cost: number;
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
      currency: body.currency,
      cost: Number(body.cost),
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
      currency: body.currency,
      cost: body.cost === undefined ? undefined : Number(body.cost),
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.hotelRatesService.remove(id);
  }
}
