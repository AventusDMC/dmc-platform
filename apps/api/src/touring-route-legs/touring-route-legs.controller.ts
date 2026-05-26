import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import {
  CreateLegInput,
  LEG_TYPES,
  TouringRouteLegsService,
  UpdateLegInput,
} from './touring-route-legs.service';

// Touring Route Legs v1 — REST endpoints. Two route shapes:
//   - /touring-routes/:touringRouteId/legs  (list + create + reorder)
//   - /touring-route-legs/:id               (single leg update + delete + fetch)
//   - /touring-routes/:touringRouteId/legs-summary  (operational aggregate)

@Controller('touring-routes/:touringRouteId/legs')
export class TouringRouteLegsByRouteController {
  constructor(private readonly service: TouringRouteLegsService) {}

  @Get()
  list(@Param('touringRouteId') touringRouteId: string) {
    return this.service.listForTouringRoute(touringRouteId);
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Param('touringRouteId') touringRouteId: string, @Body() body: Omit<CreateLegInput, 'touringRouteId'>) {
    return this.service.create({ ...body, touringRouteId });
  }

  @Post('reorder')
  @Roles('admin', 'operations')
  reorder(
    @Param('touringRouteId') touringRouteId: string,
    @Body() body: { orderedIds: string[] },
  ) {
    return this.service.reorder(touringRouteId, body?.orderedIds || []);
  }
}

@Controller('touring-routes/:touringRouteId')
export class TouringRouteLegsSummaryController {
  constructor(private readonly service: TouringRouteLegsService) {}

  @Get('legs-summary')
  summary(@Param('touringRouteId') touringRouteId: string) {
    return this.service.computeSummary(touringRouteId);
  }

  @Get('leg-types')
  legTypes() {
    return LEG_TYPES;
  }
}

@Controller('touring-route-legs')
export class TouringRouteLegsController {
  constructor(private readonly service: TouringRouteLegsService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: UpdateLegInput) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @Roles('admin', 'operations')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
