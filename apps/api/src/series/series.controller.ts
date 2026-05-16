import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { SeriesService } from './series.service';

@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get()
  findAll() {
    return this.seriesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.seriesService.findOne(id);
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: any) {
    return this.seriesService.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: any) {
    return this.seriesService.update(id, body);
  }

  @Post(':id/departures')
  @Roles('admin', 'operations')
  addDeparture(@Param('id') id: string, @Body() body: any) {
    return this.seriesService.addDeparture(id, body);
  }

  @Post(':id/departures/:departureId/clone')
  @Roles('admin', 'operations')
  cloneDeparture(@Param('id') id: string, @Param('departureId') departureId: string, @Body() body: any) {
    return this.seriesService.cloneDeparture(id, departureId, body);
  }

  @Post(':id/departures/:departureId/regenerate-services')
  @Roles('admin', 'operations')
  regenerateOperationalServices(@Param('id') id: string, @Param('departureId') departureId: string) {
    return this.seriesService.regenerateOperationalServices(id, departureId);
  }
}
