import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RoutesService } from './routes.service';

type CreateRouteBody = {
  fromPlaceId: string;
  toPlaceId: string;
  name?: string | null;
  routeType?: string | null;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  notes?: string | null;
  isActive?: boolean;
};

type UpdateRouteBody = Partial<CreateRouteBody>;

@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('active') active?: string, @Query('type') type?: string) {
    return this.routesService.findAll({
      search,
      active: active === undefined ? undefined : active !== 'false',
      type,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.routesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateRouteBody) {
    return this.routesService.create({
      fromPlaceId: body.fromPlaceId,
      toPlaceId: body.toPlaceId,
      name: body.name,
      routeType: body.routeType,
      durationMinutes: body.durationMinutes === undefined ? undefined : body.durationMinutes === null ? null : Number(body.durationMinutes),
      distanceKm: body.distanceKm === undefined ? undefined : body.distanceKm === null ? null : Number(body.distanceKm),
      notes: body.notes,
      isActive: body.isActive,
    });
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.routesService.duplicate(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRouteBody) {
    return this.routesService.update(id, {
      fromPlaceId: body.fromPlaceId,
      toPlaceId: body.toPlaceId,
      name: body.name,
      routeType: body.routeType,
      durationMinutes: body.durationMinutes === undefined ? undefined : body.durationMinutes === null ? null : Number(body.durationMinutes),
      distanceKm: body.distanceKm === undefined ? undefined : body.distanceKm === null ? null : Number(body.distanceKm),
      notes: body.notes,
      isActive: body.isActive,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.routesService.remove(id);
  }
}
