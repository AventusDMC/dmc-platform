import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CitiesService } from './cities.service';

type CreateCityBody = {
  name: string;
  country?: string | null;
  isActive?: boolean;
};

type UpdateCityBody = Partial<CreateCityBody>;

@Controller('cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('active') active?: string) {
    return this.citiesService.findAll({
      search,
      active: active === undefined ? undefined : active !== 'false',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.citiesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateCityBody) {
    return this.citiesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCityBody) {
    return this.citiesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.citiesService.remove(id);
  }
}
