import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { RestaurantsService } from './restaurants.service';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get()
  findAll() {
    return this.restaurantsService.findAll();
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: any) {
    return this.restaurantsService.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: any) {
    return this.restaurantsService.update(id, body);
  }

  @Get(':id/availability')
  availability(@Param('id') id: string) {
    return this.restaurantsService.availability(id);
  }
}
