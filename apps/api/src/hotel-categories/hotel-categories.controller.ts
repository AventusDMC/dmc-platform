import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { HotelCategoriesService } from './hotel-categories.service';

type CreateHotelCategoryBody = {
  name: string;
  isActive?: boolean;
};

type UpdateHotelCategoryBody = Partial<CreateHotelCategoryBody>;

@Controller('hotel-categories')
export class HotelCategoriesController {
  constructor(private readonly hotelCategoriesService: HotelCategoriesService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('active') active?: string) {
    return this.hotelCategoriesService.findAll({
      search,
      active: active === undefined ? undefined : active !== 'false',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hotelCategoriesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateHotelCategoryBody) {
    return this.hotelCategoriesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateHotelCategoryBody) {
    return this.hotelCategoriesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.hotelCategoriesService.remove(id);
  }
}
