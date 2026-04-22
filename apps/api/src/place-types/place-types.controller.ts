import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PlaceTypesService } from './place-types.service';

type CreatePlaceTypeBody = {
  name: string;
  isActive?: boolean;
};

type UpdatePlaceTypeBody = Partial<CreatePlaceTypeBody>;

@Controller('place-types')
export class PlaceTypesController {
  constructor(private readonly placeTypesService: PlaceTypesService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('active') active?: string) {
    return this.placeTypesService.findAll({
      search,
      active: active === undefined ? undefined : active !== 'false',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.placeTypesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreatePlaceTypeBody) {
    return this.placeTypesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePlaceTypeBody) {
    return this.placeTypesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.placeTypesService.remove(id);
  }
}
