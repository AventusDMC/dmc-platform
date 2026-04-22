import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PlacesService } from './places.service';

type CreatePlaceBody = {
  name: string;
  type?: string;
  placeTypeId?: string | null;
  cityId?: string | null;
  city?: string | null;
  country?: string | null;
  isActive?: boolean;
};

type UpdatePlaceBody = Partial<CreatePlaceBody>;

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('active') active?: string) {
    return this.placesService.findAll({
      search,
      active: active === undefined ? undefined : active !== 'false',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.placesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreatePlaceBody) {
    return this.placesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePlaceBody) {
    return this.placesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.placesService.remove(id);
  }
}
