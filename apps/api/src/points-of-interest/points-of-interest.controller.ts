import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PointOfInterestInput, PointsOfInterestService } from './points-of-interest.service';

@Controller('points-of-interest')
export class PointsOfInterestController {
  constructor(private readonly pointsOfInterestService: PointsOfInterestService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('active') active?: string,
    @Query('cityId') cityId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.pointsOfInterestService.findAll({
      search,
      active: active === undefined ? undefined : active !== 'false',
      cityId: cityId || undefined,
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pointsOfInterestService.findOne(id);
  }

  @Post()
  create(@Body() body: PointOfInterestInput) {
    return this.pointsOfInterestService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<PointOfInterestInput>) {
    return this.pointsOfInterestService.update(id, body);
  }
}
